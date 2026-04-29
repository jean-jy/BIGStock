import { useState, useEffect } from 'react';
import {
  Download, TrendingDown, TrendingUp, DollarSign, PackageMinus,
  AlertTriangle, ArrowRight, Calendar, ChevronDown, ChevronUp, Printer, MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabase';
import { BRANCH_NAMES } from '../types';

/** Normalize a category string to Title Case so that "CLEANING", "cleaning", "Cleaning" all become "Cleaning" */
function normalizeCategory(cat: string): string {
  if (!cat) return cat;
  return cat
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface FinancialLineItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  unitPrice: number;
  startingQty: number;
  purchasedQty: number;
  consumedQty: number;
  transferredInQty: number;
  transferredOutQty: number;
  adjustmentQty: number; // shrinkage / audit adjustments
  endingQty: number;
  startingValue: number;
  purchasedValue: number;
  consumedValue: number;
  transferredValue: number; // Net transfer value
  adjustmentValue: number;
  endingValue: number;
}

interface MonthSummary {
  startingInventoryValue: number;
  purchasesValue: number;
  consumptionValue: number;
  transferredValue: number; // Net transfers
  shrinkageValue: number;
  endingInventoryValue: number;
  cogsTotal: number; // consumption + shrinkage (excludes transfers)
  grossMarginImpact: number; // starting + purchases +/- transfers - ending
  items: FinancialLineItem[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function FinancialsView({ user }: { user?: any }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [activeReportType, setActiveReportType] = useState<'Stock' | 'Asset'>('Stock');
  const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showItemBreakdown, setShowItemBreakdown] = useState(false);

  const branchLabel = selectedBranch === 'All Branches' ? 'All Branches (Consolidated)' : `${selectedBranch} Branch`;

  useEffect(() => {
    fetchFinancials();
  }, [selectedMonth, selectedYear, selectedBranch, activeReportType]);

  const fetchFinancials = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(selectedYear, selectedMonth, 1);
      const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
      const startISO = startOfMonth.toISOString();
      const endISO = endOfMonth.toISOString();

      // 1. Fetch current inventory baseline from branch_inventory for accuracy
      // We join with the master inventory table to get metadata (name, price, etc.)
      let inventoryQuery = supabase
        .from('branch_inventory')
        .select('quantity, branch_id, inventory(id, name, sku, category, unit, price)');

      if (selectedBranch !== 'All Branches') {
        inventoryQuery = inventoryQuery.eq('branch_id', selectedBranch);
      }

      const { data: branchData, error: branchError } = await inventoryQuery;
      if (branchError) throw branchError;

      // 2. Fetch the full item catalog to ensure items with 0 stock are initialized
      const { data: catalog, error: catError } = await supabase
        .from('inventory')
        .select('id, name, sku, category, unit, price, total, item_type');
      if (catError) throw catError;

      // Build per-item financial data
      const itemMap = new Map<string, FinancialLineItem>();

      // Initialize with catalog (names and prices)
      for (const item of (catalog || [])) {
        const isAsset = item.item_type === 'Asset';
        if (activeReportType === 'Stock' && isAsset) continue;
        if (activeReportType === 'Asset' && !isAsset) continue;

        itemMap.set(item.id, {
          id: item.id,
          name: item.name,
          sku: item.sku,
          category: normalizeCategory(item.category || ''),
          unit: item.unit,
          unitPrice: Number(item.price) || 0,
          startingQty: 0,
          purchasedQty: 0,
          consumedQty: 0,
          transferredInQty: 0,
          transferredOutQty: 0,
          adjustmentQty: 0,
          endingQty: 0, // Default to 0, will add branch quantities next
          startingValue: 0,
          purchasedValue: 0,
          consumedValue: 0,
          transferredValue: 0,
          adjustmentValue: 0,
          endingValue: 0,
          // Store master total to perform sanity checks
          _masterTotal: item.total || 0,
        } as FinancialLineItem & { _masterTotal: number });
      }

      // 3. Add current branch quantities to the map
      let needsAutoRepair = false;
      const idsToRepair: string[] = [];

      for (const row of (branchData || [])) {
        const itemBody = row.inventory as any;
        if (!itemBody) continue;
        const entry = itemMap.get(itemBody.id) as FinancialLineItem & { _masterTotal: number };
        if (entry) {
          // If the master list claims there is NO stock at all globally, but branch data still has stock,
          // it means this is orphaned data from before we synced the tables. We must trust the master global total 0.
          if (entry._masterTotal === 0 && row.quantity > 0) {
            needsAutoRepair = true;
            if (!idsToRepair.includes(itemBody.id)) idsToRepair.push(itemBody.id);
            // Locally zero it out for this report
            entry.endingQty = 0;
          } else {
            entry.endingQty += (row.quantity || 0);
          }
        }
      }

      // Background self-healing
      if (needsAutoRepair && idsToRepair.length > 0) {
        console.warn(`Auto-repairing ${idsToRepair.length} out-of-sync ghost items with 0 master stock.`);
        supabase.from('branch_inventory').update({ quantity: 0 }).in('item_id', idsToRepair).then();
      }

      // 4. Fetch ALL transactions from the start of the month UNTIL NOW
      const { data: transactions, error: txError } = await supabase
        .from('inventory_transactions')
        .select('id, type, item_id, quantity, from_location, to_location, created_at')
        .gte('created_at', startISO);
      if (txError) throw txError;

      // Process transactions
      for (const tx of (transactions || [])) {
        const entry = tx.item_id ? itemMap.get(tx.item_id) : null;
        if (!entry) continue;

        const txDate = new Date(tx.created_at);
        const inMonth = txDate <= endOfMonth;
        const qty = Math.abs(tx.quantity || 0);
        
        let change = 0;
        let isMovementForThisBranch = false;

        if (selectedBranch === 'All Branches') {
          isMovementForThisBranch = true;
          if (tx.type === 'STOCK_IN') change = qty;
          else if (tx.type === 'USAGE') change = -qty;
          else if (tx.type === 'ADJUSTMENT') change = tx.quantity;
        } else {
          if (tx.type === 'USAGE' && tx.from_location === selectedBranch) {
            change = -qty;
            isMovementForThisBranch = true;
          } else if (tx.type === 'STOCK_IN' && tx.to_location === selectedBranch) {
            change = qty;
            isMovementForThisBranch = true;
          } else if (tx.type === 'ADJUSTMENT' && (tx.from_location === selectedBranch || tx.to_location === selectedBranch)) {
            change = tx.quantity;
            isMovementForThisBranch = true;
          } else if (tx.type === 'TRANSFER') {
            if (tx.from_location === selectedBranch) { change = -qty; isMovementForThisBranch = true; }
            else if (tx.to_location === selectedBranch) { change = qty; isMovementForThisBranch = true; }
          }
        }

        if (!isMovementForThisBranch) continue;

        if (inMonth) {
          if (tx.type === 'STOCK_IN') entry.purchasedQty += qty;
          else if (tx.type === 'USAGE') entry.consumedQty += qty;
          else if (tx.type === 'ADJUSTMENT') entry.adjustmentQty += tx.quantity;
          else if (tx.type === 'TRANSFER' && selectedBranch !== 'All Branches') {
            if (change > 0) entry.transferredInQty += qty;
            else entry.transferredOutQty += qty;
          }
        } else {
          entry.endingQty -= change;
        }
      }

      // Calculate starting balances
      for (const [, entry] of itemMap) {
        // Starting = Ending - (Purchased + TransIn - Consumed - TransOut + Adjusted)
        const netMovement = entry.purchasedQty + entry.transferredInQty - entry.consumedQty - entry.transferredOutQty + entry.adjustmentQty;
        entry.startingQty = entry.endingQty - netMovement;
        
        entry.startingValue = entry.startingQty * entry.unitPrice;
        entry.purchasedValue = entry.purchasedQty * entry.unitPrice;
        entry.consumedValue = entry.consumedQty * entry.unitPrice;
        entry.transferredValue = (entry.transferredInQty - entry.transferredOutQty) * entry.unitPrice;
        entry.adjustmentValue = entry.adjustmentQty * entry.unitPrice;
        entry.endingValue = entry.endingQty * entry.unitPrice;
      }

      const allItems = Array.from(itemMap.values());
      const filteredItems = allItems.filter(i =>
        Math.abs(i.startingQty) > 0.001 ||
        Math.abs(i.purchasedQty) > 0.001 ||
        Math.abs(i.consumedQty) > 0.001 ||
        Math.abs(i.transferredInQty) > 0.001 ||
        Math.abs(i.transferredOutQty) > 0.001 ||
        Math.abs(i.adjustmentQty) > 0.001 ||
        Math.abs(i.endingQty) > 0.001
      );

      const startingInventoryValue = allItems.reduce((s, i) => s + i.startingValue, 0);
      const purchasesValue = allItems.reduce((s, i) => s + i.purchasedValue, 0);
      const consumptionValue = allItems.reduce((s, i) => s + i.consumedValue, 0);
      const transferredValue = allItems.reduce((s, i) => s + i.transferredValue, 0);
      const shrinkageValue = allItems.reduce((s, i) => i.adjustmentQty < 0 ? s + Math.abs(i.adjustmentValue) : s, 0);
      const endingInventoryValue = allItems.reduce((s, i) => s + i.endingValue, 0);

      setSummary({
        startingInventoryValue,
        purchasesValue,
        consumptionValue,
        transferredValue,
        shrinkageValue,
        endingInventoryValue,
        cogsTotal: consumptionValue + shrinkageValue,
        grossMarginImpact: startingInventoryValue + purchasesValue + transferredValue - endingInventoryValue,
        items: filteredItems,
      });

    } catch (err) {
      console.error('Error fetching financials:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatRM = (val: number) => `RM ${val.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleExportCSV = () => {
    if (!summary) return;

    const headers = [
      'SKU', 'Item Name', 'Category', 'Unit', 'Unit Price (RM)',
      'Starting Qty', 'Starting Value (RM)',
      '(+) Purchased', '(+) Purchase Value',
      '(+) Trans In', '(+) Trans In Value',
      '(-) Trans Out', '(-) Trans Out Value',
      '(-) Consumed', '(-) Consumed Value',
      '(±) Adjustment', '(±) Adjustment Value',
      'Ending Qty', 'Ending Value (RM)'
    ];

    const rows = summary.items.map(item => [
      item.sku,
      `"${item.name}"`,
      `"${item.category}"`,
      item.unit,
      item.unitPrice.toFixed(2),
      item.startingQty,
      item.startingValue.toFixed(2),
      item.purchasedQty,
      item.purchasedValue.toFixed(2),
      item.transferredInQty,
      (item.transferredInQty * item.unitPrice).toFixed(2),
      item.transferredOutQty,
      (item.transferredOutQty * item.unitPrice).toFixed(2),
      item.consumedQty,
      item.consumedValue.toFixed(2),
      item.adjustmentQty,
      item.adjustmentValue.toFixed(2),
      item.endingQty,
      item.endingValue.toFixed(2),
    ].join(','));

    // Add summary rows
    rows.push('');
    rows.push(`,,,,SUMMARY,,,,,,,,,,`);
    rows.push(`,,,,Starting Inventory Value,,${summary.startingInventoryValue.toFixed(2)},,,,,,,,`);
    rows.push(`,,,,+ Purchases Received,,${summary.purchasesValue.toFixed(2)},,,,,,,,`);
    rows.push(`,,,,± Net Transfers,,${summary.transferredValue.toFixed(2)},,,,,,,,`);
    rows.push(`,,,,- Consumption (COGS),,${summary.consumptionValue.toFixed(2)},,,,,,,,`);
    rows.push(`,,,,- Shrinkage / Write-offs,,${summary.shrinkageValue.toFixed(2)},,,,,,,,`);
    rows.push(`,,,,= Ending Inventory Value,,${summary.endingInventoryValue.toFixed(2)},,,,,,,,`);
    rows.push(`,,,,Total Material Cost (P&L),,${summary.cogsTotal.toFixed(2)},,,,,,,,`);

    const branchSuffix = selectedBranch === 'All Branches' ? 'All' : selectedBranch;
    rows.push(`,,,,Branch,,${branchSuffix},,,,,,,,`);

    const csvContent = 'data:text/csv;charset=utf-8,' + headers.join(',') + '\n' + rows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PNL_Inventory_${MONTHS[selectedMonth]}_${selectedYear}_${branchSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group items by category for breakdown
  const categoryGroups = summary ? summary.items.reduce<Record<string, FinancialLineItem[]>>((acc, item) => {
    const cat = item.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {}) : {};

  const categoryTotals = Object.entries(categoryGroups).map(([cat, items]) => ({
    category: cat,
    consumption: items.reduce((s, i) => s + i.consumedValue, 0),
    purchases: items.reduce((s, i) => s + i.purchasedValue, 0),
    shrinkage: items.reduce((s, i) => i.adjustmentQty < 0 ? s + Math.abs(i.adjustmentValue) : s, 0),
    ending: items.reduce((s, i) => s + i.endingValue, 0),
    items,
  })).sort((a, b) => b.consumption - a.consumption);

  const prevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="max-w-6xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">
            {activeReportType === 'Stock' ? 'Financial Intelligence' : 'Asset Intelligence'} — {branchLabel}
          </span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">
            {activeReportType === 'Stock' ? 'Monthly P&L Report' : 'Asset Value Report'}
          </h1>
          <p className="text-slate-500 font-inter text-sm mt-1">
            {activeReportType === 'Stock' ? 'Inventory movement summary for your accountant.' : 'Fixed asset capitalization tracking.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg shadow-sm">
            <button onClick={prevMonth} className="px-3 py-2.5 text-slate-400 hover:text-primary transition-colors">
              <ChevronDown size={16} className="rotate-90" />
            </button>
            <div className="flex items-center gap-2 px-2">
              <Calendar size={14} className="text-primary" />
              <span className="text-sm font-bold text-slate-800 min-w-[130px] text-center">{MONTHS[selectedMonth]} {selectedYear}</span>
            </div>
            <button onClick={nextMonth} className="px-3 py-2.5 text-slate-400 hover:text-primary transition-colors">
              <ChevronUp size={16} className="rotate-90" />
            </button>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={!summary || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all rounded-md active:scale-95 disabled:opacity-40"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-bold shadow-sm hover:bg-white transition-colors rounded-md"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      {/* Role & Branch Selectors */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-100 max-w-min">
          {(['Stock', 'Asset'] as const).map(type => (
            <button
              key={type}
              onClick={() => setActiveReportType(type)}
              className={`px-6 py-2 text-xs font-bold rounded-md transition-all ${activeReportType === type ? (type === 'Stock' ? 'bg-primary text-white shadow-primary/20' : 'bg-indigo-600 text-white shadow-indigo-600/20') : 'text-slate-500 hover:text-slate-800'}`}
            >
              {type === 'Stock' ? 'Stock Cost of Goods (COGS)' : 'Capital Assets Report'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setSelectedBranch('All Branches')}
          className={`px-4 py-2 text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5 ${
            selectedBranch === 'All Branches'
              ? 'bg-primary text-white shadow-primary/20'
              : 'bg-white text-slate-500 border border-slate-100 hover:border-primary/20 hover:text-primary'
          }`}
        >
          <MapPin size={12} />
          All Branches
        </button>
        {BRANCH_NAMES.map(branch => (
          <button
            key={branch}
            onClick={() => setSelectedBranch(branch)}
            className={`px-4 py-2 text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5 ${
              selectedBranch === branch
                ? 'bg-primary text-white shadow-primary/20'
                : 'bg-white text-slate-500 border border-slate-100 hover:border-primary/20 hover:text-primary'
            }`}
          >
            <MapPin size={12} />
            {branch}
          </button>
        ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : summary ? (
        <>
          {/* ==================== P&L FLOW CARDS ==================== */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 mb-8 print:shadow-none print:border-slate-300">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Inventory Movement Summary — {branchLabel} — {MONTHS[selectedMonth]} {selectedYear}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-0 items-stretch">
              {/* Starting */}
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                    <DollarSign size={16} className="text-slate-600" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Starting Inventory</p>
                </div>
                <p className="text-2xl font-extrabold text-slate-800 font-manrope">{formatRM(summary.startingInventoryValue)}</p>
                <p className="text-[10px] text-slate-400 mt-1">1 {MONTHS[selectedMonth].substring(0, 3)} {selectedYear}</p>
              </div>

              {/* Arrow */}
              <div className="hidden md:flex items-center justify-center">
                <ArrowRight size={20} className="text-slate-300" />
              </div>

              {/* Purchases & Costs */}
              <div className="p-5 space-y-4">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp size={14} className="text-blue-600" />
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">+ Purchases</p>
                  </div>
                  <p className="text-lg font-extrabold text-blue-800 font-manrope">{formatRM(summary.purchasesValue)}</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown size={14} className="text-orange-600" />
                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">− Consumption</p>
                  </div>
                  <p className="text-lg font-extrabold text-orange-800 font-manrope">{formatRM(summary.consumptionValue)}</p>
                </div>
                {summary.shrinkageValue > 0 && (
                  <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={14} className="text-red-600" />
                      <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">− Shrinkage</p>
                    </div>
                    <p className="text-lg font-extrabold text-red-800 font-manrope">{formatRM(summary.shrinkageValue)}</p>
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div className="hidden md:flex items-center justify-center">
                <ArrowRight size={20} className="text-slate-300" />
              </div>

              {/* Ending */}
              <div className="p-5 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                    <DollarSign size={16} className="text-primary" />
                  </div>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Ending Inventory</p>
                </div>
                <p className="text-2xl font-extrabold text-primary font-manrope">{formatRM(summary.endingInventoryValue)}</p>
                <p className="text-[10px] text-primary/60 mt-1">{new Date(selectedYear, selectedMonth + 1, 0).getDate()} {MONTHS[selectedMonth].substring(0, 3)} {selectedYear}</p>
              </div>
            </div>
          </div>

          {/* ==================== KEY P&L METRICS ==================== */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Material Cost</p>
                <PackageMinus size={16} className="text-orange-400" />
              </div>
              <p className="text-3xl font-extrabold text-slate-900 font-manrope">{formatRM(summary.cogsTotal)}</p>
              <p className="text-xs text-slate-500 mt-2">Consumption + Shrinkage — this is your <strong>COGS / Material Expense</strong> line item for your P&L.</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inventory Asset Change</p>
                <TrendingDown size={16} className={summary.endingInventoryValue >= summary.startingInventoryValue ? 'text-blue-400' : 'text-red-400'} />
              </div>
              <p className={`text-3xl font-extrabold font-manrope ${
                summary.endingInventoryValue >= summary.startingInventoryValue ? 'text-blue-600' : 'text-tertiary'
              }`}>
                {summary.endingInventoryValue >= summary.startingInventoryValue ? '+' : ''}{formatRM(summary.endingInventoryValue - summary.startingInventoryValue)}
              </p>
              <p className="text-xs text-slate-500 mt-2">Net change in your <strong>Balance Sheet</strong> inventory asset this month.</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shrinkage Rate</p>
                <AlertTriangle size={16} className="text-amber-400" />
              </div>
              <p className={`text-3xl font-extrabold font-manrope ${
                summary.shrinkageValue === 0 ? 'text-green-600' : summary.shrinkageValue > summary.consumptionValue * 0.05 ? 'text-red-600' : 'text-amber-600'
              }`}>
                {summary.consumptionValue > 0 ? ((summary.shrinkageValue / (summary.consumptionValue + summary.shrinkageValue)) * 100).toFixed(1) : '0.0'}%
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {summary.shrinkageValue === 0
                  ? 'No shrinkage recorded this month. Excellent!'
                  : `${formatRM(summary.shrinkageValue)} lost to unaccounted variances.`
                }
              </p>
            </div>
          </div>

          {/* ==================== CATEGORY BREAKDOWN ==================== */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-manrope font-extrabold text-slate-900">Expense by Category</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Click a category to see item-level detail.</p>
              </div>
            </div>
            
            <div className="divide-y divide-slate-50">
              {categoryTotals.map(cat => (
                <div key={cat.category}>
                  <div
                    className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                    onClick={() => setExpandedCategory(expandedCategory === cat.category ? null : cat.category)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase min-w-[100px] text-center">{cat.category}</span>
                      <div className="flex-1 max-w-md">
                        {/* Consumption bar */}
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-500"
                            style={{ width: `${summary.consumptionValue > 0 ? (cat.consumption / summary.consumptionValue * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right min-w-[120px]">
                        <p className="text-sm font-extrabold text-slate-900">{formatRM(cat.consumption)}</p>
                        <p className="text-[9px] text-slate-400 uppercase font-bold">consumed</p>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className="text-xs font-bold text-slate-500">{formatRM(cat.ending)}</p>
                        <p className="text-[9px] text-slate-400 uppercase font-bold">remaining</p>
                      </div>
                      {cat.shrinkage > 0 && (
                        <div className="text-right min-w-[80px]">
                          <p className="text-xs font-bold text-red-600">-{formatRM(cat.shrinkage)}</p>
                          <p className="text-[9px] text-red-400 uppercase font-bold">shrinkage</p>
                        </div>
                      )}
                      <button className="p-1 text-slate-400 hover:text-primary transition-colors">
                        {expandedCategory === cat.category ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded item detail */}
                  <AnimatePresence>
                    {expandedCategory === cat.category && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-slate-50/50 border-t border-slate-100">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                <th className="px-6 py-3">Item</th>
                                <th className="px-3 py-3 text-right">Unit Price</th>
                                <th className="px-3 py-3 text-right">Start Qty</th>
                                <th className="px-3 py-3 text-right text-blue-500">+ Purchased</th>
                                {selectedBranch !== 'All Branches' && (
                                  <>
                                    <th className="px-3 py-3 text-right text-indigo-500">+ Trans In</th>
                                    <th className="px-3 py-3 text-right text-purple-500">− Trans Out</th>
                                  </>
                                )}
                                <th className="px-3 py-3 text-right text-orange-500">− Used</th>
                                <th className="px-3 py-3 text-right">± Adjust</th>
                                <th className="px-3 py-3 text-right font-bold">End Qty</th>
                                <th className="px-3 py-3 text-right font-bold text-slate-900">End Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/80">
                              {cat.items.map(item => (
                                <tr key={item.id} className="hover:bg-white/60 transition-colors">
                                  <td className="px-6 py-3">
                                    <p className="text-xs font-bold text-slate-800">{item.name}</p>
                                    <p className="text-[9px] text-slate-400 font-mono">{item.sku}</p>
                                  </td>
                                  <td className="px-3 py-3 text-right text-xs text-slate-500">{formatRM(item.unitPrice)}</td>
                                  <td className="px-3 py-3 text-right text-xs text-slate-500">{item.startingQty}</td>
                                  <td className="px-3 py-3 text-right text-xs font-bold text-blue-600">
                                    {item.purchasedQty > 0 ? `+${item.purchasedQty}` : '—'}
                                  </td>
                                  {selectedBranch !== 'All Branches' && (
                                    <>
                                      <td className="px-3 py-3 text-right text-xs font-bold text-indigo-600">
                                        {item.transferredInQty > 0 ? `+${item.transferredInQty}` : '—'}
                                      </td>
                                      <td className="px-3 py-3 text-right text-xs font-bold text-purple-600">
                                        {item.transferredOutQty > 0 ? `-${item.transferredOutQty}` : '—'}
                                      </td>
                                    </>
                                  )}
                                  <td className="px-3 py-3 text-right text-xs font-bold text-orange-600">
                                    {item.consumedQty > 0 ? `-${item.consumedQty}` : '—'}
                                  </td>
                                  <td className={`px-3 py-3 text-right text-xs font-bold ${
                                    item.adjustmentQty > 0 ? 'text-green-600' : item.adjustmentQty < 0 ? 'text-red-600' : 'text-slate-400'
                                  }`}>
                                    {item.adjustmentQty !== 0 ? (item.adjustmentQty > 0 ? `+${item.adjustmentQty}` : item.adjustmentQty) : '—'}
                                  </td>
                                  <td className="px-3 py-3 text-right text-xs font-extrabold text-slate-800">{item.endingQty}</td>
                                  <td className="px-3 py-3 text-right text-xs font-bold text-slate-700">{formatRM(item.endingValue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>

          {/* ==================== ACCOUNTANT SUMMARY BOX ==================== */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 text-white shadow-xl mb-8 print:bg-white print:text-slate-900 print:border print:border-slate-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center print:bg-slate-100">
                <DollarSign size={20} className="text-emerald-400 print:text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-manrope font-extrabold">P&L Ready Summary</h3>
                <p className="text-xs text-slate-400 print:text-slate-500">{branchLabel} • {MONTHS[selectedMonth]} {selectedYear} — Hand this to your accountant</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 px-4 rounded-lg bg-white/5 print:bg-slate-50">
                <span className="text-sm font-medium text-slate-300 print:text-slate-600">Opening Stock Value (1 {MONTHS[selectedMonth].substring(0, 3)})</span>
                <span className="text-sm font-extrabold">{formatRM(summary.startingInventoryValue)}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-4 rounded-lg bg-white/5 print:bg-slate-50">
                <span className="text-sm font-medium text-blue-300 print:text-blue-600">(+) Purchases Received</span>
                <span className="text-sm font-extrabold text-blue-300 print:text-blue-600">{formatRM(summary.purchasesValue)}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-4 rounded-lg bg-white/5 print:bg-slate-50">
                <span className="text-sm font-medium text-orange-300 print:text-orange-600">(−) Consumption / Usage (COGS)</span>
                <span className="text-sm font-extrabold text-orange-300 print:text-orange-600">({formatRM(summary.consumptionValue)})</span>
              </div>
              {summary.shrinkageValue > 0 && (
                <div className="flex justify-between items-center py-2 px-4 rounded-lg bg-red-500/10 print:bg-red-50">
                  <span className="text-sm font-medium text-red-300 print:text-red-600">(−) Shrinkage / Write-offs</span>
                  <span className="text-sm font-extrabold text-red-300 print:text-red-600">({formatRM(summary.shrinkageValue)})</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-3 mt-3 print:border-slate-300">
                <div className="flex justify-between items-center py-2 px-4 rounded-lg bg-emerald-500/10 print:bg-emerald-50">
                  <span className="text-base font-bold text-emerald-300 print:text-emerald-700">Closing Stock Value ({new Date(selectedYear, selectedMonth + 1, 0).getDate()} {MONTHS[selectedMonth].substring(0, 3)})</span>
                  <span className="text-xl font-extrabold text-emerald-300 print:text-emerald-700">{formatRM(summary.endingInventoryValue)}</span>
                </div>
              </div>
              <div className="border-t border-white/10 pt-3 mt-1 print:border-slate-300">
                <div className="flex justify-between items-center py-3 px-4 rounded-xl bg-white/10 print:bg-primary/5">
                  <span className="text-base font-extrabold text-white print:text-slate-900">📊 Total Material Expense (P&L Line)</span>
                  <span className="text-2xl font-extrabold text-white print:text-primary">{formatRM(summary.cogsTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-4 mb-8">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Generated by BIGStock Precision • {new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-32 text-slate-400">
          <p className="font-medium">No data available for this period.</p>
        </div>
      )}
    </motion.div>
  );
}
