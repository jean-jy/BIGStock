import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Download, CheckCircle2, History, Upload, FileSpreadsheet, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabase';
import type { InventoryItem } from '../types';
import { StatusBadge } from './StatusBadge';

/** Normalize a category string to Title Case so that "CLEANING", "cleaning", "Cleaning" all become "Cleaning" */
function normalizeCategory(cat: string): string {
  if (!cat) return cat;
  return cat
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function InventoryView({ activeBranch, user }: { activeBranch: string, user?: any, key?: string }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isStockInModalOpen, setIsStockInModalOpen] = useState(false);
  const [stockInItem, setStockInItem] = useState<InventoryItem | null>(null);
  const [stockInForm, setStockInForm] = useState({
    quantity: 0,
    supplierName: '',
    invoiceNo: '',
    notes: ''
  });
  const [stockInHistory, setStockInHistory] = useState<Array<{
    id: string;
    itemId: string;
    itemName: string;
    quantity: number;
    supplierName: string;
    invoiceNo: string;
    notes: string;
    date: string;
  }>>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeType, setActiveType] = useState<'All' | 'Stock' | 'Asset'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [newItem, setNewItem] = useState({
    name: '',
    subtext: '',
    category: '',
    sku: '',
    total: 0,
    unit: 'Units',
    price: 0,
    min_stock: 20,
    item_type: 'Stock' as 'Stock' | 'Asset'
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const headers = ['item_name', 'subtext', 'category', 'sku', 'price', 'initial_quantity', 'unit', 'min_stock_alert'];
    const row = ['"Dental Mirror #4"', '"Stainless Steel"', '"Instruments"', '"INS-MIR-04"', '45.00', '100', '"Units"', '20'];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + row.join(",");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "inventory_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      // Skip header
      const dataRows = lines.slice(1);
      // Use a Map keyed by SKU to deduplicate — last row with same SKU wins
      const itemMap = new Map<string, any>();
      const newCats = new Set<string>(categories);

      dataRows.forEach(row => {
        // Simple CSV splitter (doesn't handle commas inside quotes perfectly, but okay for basics)
        const cols = row.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length < 4) return; // Skip invalid rows

        const [name, subtext, category, sku, price, qty, unit, minStock] = cols;
        const currentQty = parseInt(qty) || 0;
        const alertLevel = parseInt(minStock) || 20;
        const itemSku = sku || `SKU-${Math.random().toString(36).substr(2, 9)}`;

        const normalizedCat = normalizeCategory(category || 'General');
        itemMap.set(itemSku, {
          name,
          subtext: subtext || '',
          category: normalizedCat,
          sku: itemSku,
          price: parseFloat(price) || 0,
          total: currentQty,
          unit: unit || 'Units',
          min_stock: alertLevel,
          status: currentQty < alertLevel ? 'REORDER' : (currentQty < alertLevel * 2 ? 'BALANCED' : 'HEALTHY'),
          last_audit: new Date().toISOString()
        });
        if (category) newCats.add(normalizedCat);
      });

      const itemsToInsert = Array.from(itemMap.values());

      if (itemsToInsert.length === 0) {
        alert("No valid items found in the CSV.");
        return;
      }

      try {
        setLoading(true);
        // Batch upserts in chunks of 50 to avoid DB limits
        const CHUNK_SIZE = 50;
        for (let i = 0; i < itemsToInsert.length; i += CHUNK_SIZE) {
          const chunk = itemsToInsert.slice(i, i + CHUNK_SIZE);
          const { error: err } = await supabase
            .from('inventory')
            .upsert(chunk, { onConflict: 'sku' });
          if (err) throw err;
        }

        alert(`Successfully processed ${itemsToInsert.length} items!`);
        // Categories will be refreshed by fetchItems() below
        fetchItems();
      } catch (err: any) {
        console.error("CSV Import Error:", err);
        alert("Failed to import CSV: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const [invResult, historyResult] = await Promise.all([
        supabase.from('inventory').select('*').order('name').limit(5000),
        supabase.from('inventory_transactions')
          .select('id, item_id, item_name, quantity, from_location, remarks, created_at')
          .eq('type', 'STOCK_IN')
          .order('created_at', { ascending: false })
          .limit(30)
      ]);

      if (invResult.error) throw invResult.error;

      const mappedItems: InventoryItem[] = (invResult.data || []).map(item => ({
        ...item,
        category: normalizeCategory(item.category || ''),
        lastAudit: item.last_audit || 'Never',
        branchStock: {}
      }));

      setItems(mappedItems);
      const dbCategories = Array.from(new Set(mappedItems.map(i => i.category).filter(Boolean))).sort();
      setCategories(dbCategories);

      setStockInHistory((historyResult.data || []).map(tx => ({
        id: tx.id,
        itemId: tx.item_id,
        itemName: tx.item_name || 'Unknown Item',
        quantity: tx.quantity,
        supplierName: tx.from_location || '—',
        invoiceNo: '',
        notes: tx.remarks || '',
        date: tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
      })));
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [activeBranch]);

  const handleAddCategory = () => {
    const normalized = normalizeCategory(newCategoryName.trim());
    if (normalized && !categories.includes(normalized)) {
      setCategories([...categories, normalized]);
      setNewCategoryName('');
      setIsAddingCategory(false);
    }
  };

  const handleDeleteCategory = (catToDelete: string) => {
    if (window.confirm(`Are you sure you want to delete the "${catToDelete}" category? Items in this category will remain but their category label will be unassigned.`)) {
      setCategories(categories.filter(c => c !== catToDelete));
    }
  };

  const handleEditCategory = (oldName: string) => {
    const newName = window.prompt(`Rename category "${oldName}" to:`, oldName);
    if (newName && newName.trim() && newName.trim() !== oldName) {
      setCategories(categories.map(c => c === oldName ? newName.trim() : c));
      setItems(items.map(item => item.category === oldName ? { ...item, category: newName.trim() } : item));
    }
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const alertLevel = newItem.min_stock || 20;
    const status = newItem.total < alertLevel ? 'REORDER' : (newItem.total < alertLevel * 2 ? 'BALANCED' : 'HEALTHY');

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('inventory')
          .update({
            ...newItem,
            status,
            last_audit: new Date().toISOString()
          })
          .eq('id', editingItem.id);
        if (error) throw error;

        // SYNC BRANCH DATA
        if (newItem.total === 0) {
          await supabase.from('branch_inventory').update({ quantity: 0 }).eq('item_id', editingItem.id);
        } else {
          // Simplistic override: if they type a new total, put it in the active branch or main branch
          const targetBranch = activeBranch === 'All Branches' ? 'Main Branch' : activeBranch;
          // Zero out others
          await supabase.from('branch_inventory').update({ quantity: 0 }).eq('item_id', editingItem.id).neq('branch_id', targetBranch);
          // Set this one
          const { data: biCheck } = await supabase.from('branch_inventory').select('id').eq('item_id', editingItem.id).eq('branch_id', targetBranch).maybeSingle();
          if (biCheck) {
            await supabase.from('branch_inventory').update({ quantity: newItem.total }).eq('id', biCheck.id);
          } else {
            await supabase.from('branch_inventory').insert({ item_id: editingItem.id, branch_id: targetBranch, quantity: newItem.total });
          }
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('inventory')
          .insert({
            ...newItem,
            status,
            last_audit: new Date().toISOString()
          })
          .select('id')
          .single();
        if (error) throw error;

        if (inserted && newItem.total > 0) {
          const targetBranch = activeBranch === 'All Branches' ? 'Main Branch' : activeBranch;
          await supabase.from('branch_inventory').insert({ item_id: inserted.id, branch_id: targetBranch, quantity: newItem.total });
        }
      }
      fetchItems();
      closeModal();
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Failed to save item');
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setNewItem({
      name: item.name,
      subtext: item.subtext,
      category: item.category,
      sku: item.sku,
      total: item.total,
      unit: item.unit,
      price: item.price || 0,
      min_stock: item.min_stock || 20,
      item_type: item.item_type || 'Stock'
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setNewItem({ name: '', subtext: '', category: categories[0] || '', sku: '', total: 0, unit: 'Units', price: 0, min_stock: 20, item_type: 'Stock' as 'Stock' | 'Asset' });
  };

  const handleDeleteItem = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        const { error } = await supabase
          .from('inventory')
          .delete()
          .eq('id', id);
        if (error) throw error;
        fetchItems();
      } catch (error) {
        console.error('Error deleting item:', error);
      }
    }
  };

  const openStockInModal = (item: InventoryItem) => {
    setStockInItem(item);
    setStockInForm({ quantity: 0, supplierName: '', invoiceNo: '', notes: '' });
    setIsStockInModalOpen(true);
  };

  const closeStockInModal = () => {
    setIsStockInModalOpen(false);
    setStockInItem(null);
    setStockInForm({ quantity: 0, supplierName: '', invoiceNo: '', notes: '' });
  };

  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInItem || stockInForm.quantity <= 0) return;

    try {
      const alertLevel = stockInItem.min_stock || 20;
      const newTotal = stockInItem.total + stockInForm.quantity;
      const status = newTotal < alertLevel ? 'REORDER' : (newTotal < alertLevel * 2 ? 'BALANCED' : 'HEALTHY');

      const { error: invError } = await supabase
        .from('inventory')
        .update({
          total: newTotal,
          status,
          last_audit: new Date().toISOString()
        })
        .eq('id', stockInItem.id);

      if (invError) throw invError;

      const { error: txError } = await supabase.from('inventory_transactions').insert({
        type: 'STOCK_IN',
        item_id: stockInItem.id,
        item_name: stockInItem.name,
        quantity: stockInForm.quantity,
        unit: stockInItem.unit,
        from_location: stockInForm.supplierName || 'Supplier',
        to_location: activeBranch,
        remarks: stockInForm.notes,
        performed_by: (await supabase.auth.getSession()).data.session?.user?.id
      });

      if (txError) throw txError;

      // SYNC BRANCH DATA
      const targetBranch = activeBranch === 'All Branches' ? 'Main Branch' : activeBranch;
      const { data: biRow } = await supabase.from('branch_inventory').select('id, quantity').eq('item_id', stockInItem.id).eq('branch_id', targetBranch).maybeSingle();
      if (biRow) {
        await supabase.from('branch_inventory').update({ quantity: biRow.quantity + stockInForm.quantity }).eq('id', biRow.id);
      } else {
        await supabase.from('branch_inventory').insert({ item_id: stockInItem.id, branch_id: targetBranch, quantity: stockInForm.quantity });
      }

      fetchItems();
      closeStockInModal();
    } catch (error) {
      console.error('Error recording stock-in:', error);
      alert('Failed to record stock-in');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Catalog Management — {activeBranch}</span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">Inventory Master</h1>
          <p className="text-slate-500 font-inter text-sm mt-1">{activeBranch === 'Main Branch' ? 'Consolidated view across all branches.' : `Showing stock levels for ${activeBranch} branch.`}</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleCsvImport} 
            accept=".csv" 
            className="hidden" 
          />
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-md hover:bg-white transition-all"
            title="Download CSV Template"
          >
            <Download size={18} />
            Template
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-primary text-sm font-bold shadow-sm hover:border-primary/30 transition-all rounded-md"
          >
            <Upload size={18} />
            Bulk Import CSV
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all rounded-md active:scale-95"
          >
            <Plus size={18} />
            Add New Item
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by item name, description, category or SKU..."
          className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Type & Category Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">Type:</span>
        {(['All', 'Stock', 'Asset'] as const).map(type => (
          <button 
            key={type}
            onClick={() => setActiveType(type)}
            className={`px-4 py-2 text-xs font-bold rounded-full shadow-sm transition-all ${activeType === type ? 'bg-indigo-600 text-white shadow-indigo-600/20' : 'bg-white text-slate-500 border border-slate-100 hover:border-indigo-600/20 hover:text-indigo-600'}`}
          >
            {type === 'All' ? 'All Types' : type}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-8 items-center">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">Category:</span>
        <button 
          onClick={() => setActiveCategory('All')}
          className={`px-4 py-2 text-xs font-bold rounded-full shadow-sm transition-all ${activeCategory === 'All' ? 'bg-primary text-white shadow-primary/20' : 'bg-white text-slate-500 border border-slate-100'}`}
        >
          All Items
        </button>
        {categories.map(cat => (
          <div key={cat} className="group relative flex items-center">
            <button 
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 text-xs font-bold rounded-full border transition-all pr-8 ${
                activeCategory === cat 
                  ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20' 
                  : 'bg-white text-slate-500 border-slate-100 hover:border-primary/20 hover:text-primary'
              }`}
            >
              {cat}
            </button>
            <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }}
                className="p-1 text-slate-400 hover:text-primary transition-colors"
                title="Edit Category"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                className="p-1 text-slate-400 hover:text-tertiary transition-colors"
                title="Delete Category"
              >
                <Trash2 size={10} />
              </button>
            </div>
          </div>
        ))}

        {isAddingCategory ? (
          <div className="flex items-center gap-2 ml-2">
            <input
              autoFocus
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              className="px-3 py-1.5 bg-white border border-primary/30 rounded-full text-xs focus:ring-2 focus:ring-primary/10 outline-none w-32"
              placeholder="Category name..."
            />
            <button onClick={handleAddCategory} className="p-1.5 bg-primary text-white rounded-full hover:opacity-90">
              <Plus size={14} />
            </button>
            <button onClick={() => setIsAddingCategory(false)} className="p-1.5 bg-slate-100 text-slate-400 rounded-full hover:text-slate-600">
              <Plus size={14} className="rotate-45" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="px-4 py-2 bg-slate-50 text-slate-400 text-xs font-bold rounded-full border border-dashed border-slate-200 hover:border-primary/40 hover:text-primary transition-all flex items-center gap-1"
          >
            <Plus size={14} />
            New Category
          </button>
        )}
      </div>

      {/* Mobile inventory card list */}
      <div className="flex flex-col gap-3 mb-8 md:hidden">
        {items.filter(i => {
          const itemType = i.item_type || 'Stock';
          if (activeType !== 'All' && itemType !== activeType) return false;
          const matchesCategory = activeCategory === 'All' || i.category === activeCategory;
          if (!matchesCategory) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            i.name.toLowerCase().includes(q) ||
            (i.subtext || '').toLowerCase().includes(q) ||
            (i.category || '').toLowerCase().includes(q) ||
            (i.sku || '').toLowerCase().includes(q)
          );
        }).map((item) => (
          <div key={item.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start gap-2 mb-2">
              <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 text-[8px] font-black uppercase rounded ${(item.item_type || 'Stock') === 'Asset' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                {item.item_type || 'Stock'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 leading-tight">{item.name}</p>
                {item.subtext && <p className="text-[10px] text-slate-400 uppercase mt-0.5">{item.subtext}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
              <span className="text-[10px] font-mono text-slate-400">{item.sku}</span>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Unit Price</p>
                <p className="text-sm font-bold text-slate-900">RM {item.price?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Stock</p>
                <p className="text-sm font-bold text-slate-700">{item.total} <span className="text-[10px] text-slate-400 font-normal uppercase">{item.unit}</span></p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => openStockInModal(item)} className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-600 text-xs font-bold rounded-lg border border-green-100 active:scale-95">
                <Download size={13} /> Stock In
              </button>
              <button onClick={() => openEditModal(item)} className="flex items-center gap-1 px-3 py-1.5 bg-primary/5 text-primary text-xs font-bold rounded-lg">
                <Pencil size={13} /> Edit
              </button>
              <button onClick={() => handleDeleteItem(item.id)} className="ml-auto p-2 text-slate-400 hover:text-tertiary rounded-lg transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop inventory table */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Details</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">SKU</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Unit Price</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Stock Level</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.filter(i => {
              const itemType = i.item_type || 'Stock';
              if (activeType !== 'All' && itemType !== activeType) return false;
              
              const matchesCategory = activeCategory === 'All' || i.category === activeCategory;
              if (!matchesCategory) return false;
              if (!searchQuery.trim()) return true;
              const q = searchQuery.toLowerCase();
              return (
                i.name.toLowerCase().includes(q) ||
                (i.subtext || '').toLowerCase().includes(q) ||
                (i.category || '').toLowerCase().includes(q) ||
                (i.sku || '').toLowerCase().includes(q)
              );
            }).map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase rounded ${
                      (item.item_type || 'Stock') === 'Asset' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    }`}>
                      {item.item_type || 'Stock'}
                    </span>
                    <p className="text-sm font-bold text-slate-900">{item.name}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-tight mt-1">{item.subtext}</p>
                </td>
                <td className="px-6 py-5">
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
                </td>
                <td className="px-6 py-5 text-xs font-mono text-slate-400">{item.sku}</td>
                <td className="px-6 py-5 text-sm font-bold text-slate-900">RM {item.price?.toFixed(2) || '0.00'}</td>
                <td className="px-6 py-5">
                  <span className="text-sm font-bold text-slate-700">{item.total}</span>
                  <span className="text-[10px] text-slate-400 ml-1 uppercase">{item.unit}</span>
                </td>
                <td className="px-6 py-5 text-center">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-6 py-5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openStockInModal(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 text-[11px] font-bold rounded-full border border-green-100 hover:bg-green-100 hover:text-green-700 transition-all active:scale-95"
                      title="Stock In (Receive from Supplier)"
                    >
                      <Download size={13} />
                      Stock In
                    </button>
                    <button
                      onClick={() => openEditModal(item)}
                      className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                      title="Edit Item"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-2 text-slate-400 hover:text-tertiary hover:bg-tertiary/5 rounded-lg transition-all"
                      title="Delete Item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-manrope font-extrabold text-slate-900">
                  {editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}
                </h3>
                <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              <form onSubmit={handleCreateOrUpdate} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Item Name</label>
                    <input
                      required
                      value={newItem.name}
                      onChange={e => setNewItem({...newItem, name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all"
                      placeholder="e.g. Dental Mirror #4"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Item Type</label>
                    <select
                      value={newItem.item_type}
                      onChange={e => setNewItem({...newItem, item_type: e.target.value as 'Stock' | 'Asset'})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all font-bold"
                    >
                      <option value="Stock">Stock (Consumables, Merch)</option>
                      <option value="Asset">Asset (Equipment, Computers)</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Description / Subtext</label>
                    <input
                      value={newItem.subtext}
                      onChange={e => setNewItem({...newItem, subtext: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all"
                      placeholder="e.g. Stainless Steel, Autoclavable"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Category</label>
                    <select
                      value={newItem.category}
                      onChange={e => setNewItem({...newItem, category: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all"
                    >
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">SKU Code</label>
                    <input
                      required
                      value={newItem.sku}
                      onChange={e => setNewItem({...newItem, sku: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all font-mono"
                      placeholder="e.g. INS-MIR-04"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Initial Quantity</label>
                    <input
                      type="number"
                      required
                      value={newItem.total}
                      onChange={e => setNewItem({...newItem, total: parseInt(e.target.value) || 0})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unit</label>
                    <input
                      value={newItem.unit}
                      onChange={e => setNewItem({...newItem, unit: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all"
                      placeholder="e.g. Units, Boxes, Packs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unit Price (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newItem.price || ''}
                      onChange={e => setNewItem({...newItem, price: parseFloat(e.target.value) || 0})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all"
                      placeholder="e.g. 45.00"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Min. Stock Level (Alert Point)</label>
                    <input
                      type="number"
                      required
                      value={newItem.min_stock}
                      onChange={e => setNewItem({...newItem, min_stock: parseInt(e.target.value) || 0})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all"
                    />
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-lg hover:opacity-90 transition-all active:scale-95"
                  >
                    {editingItem ? 'Save Changes' : 'Create Item'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock In Modal */}
      <AnimatePresence>
        {isStockInModalOpen && stockInItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeStockInModal}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <Download size={16} className="text-green-600" />
                      </div>
                      <h3 className="text-xl font-manrope font-extrabold text-slate-900">Stock In</h3>
                    </div>
                    <p className="text-xs text-slate-500">Record new stock received from supplier</p>
                  </div>
                  <button onClick={closeStockInModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <Plus size={24} className="rotate-45" />
                  </button>
                </div>
              </div>

              {/* Item Info Banner */}
              <div className="mx-6 mt-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{stockInItem.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">{stockInItem.subtext} • {stockInItem.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 mb-0.5">Current Stock</p>
                    <p className="text-lg font-extrabold text-slate-900">{stockInItem.total} <span className="text-[10px] text-slate-400 uppercase font-bold">{stockInItem.unit}</span></p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleStockInSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Quantity Received *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      autoFocus
                      value={stockInForm.quantity || ''}
                      onChange={e => setStockInForm({...stockInForm, quantity: parseInt(e.target.value) || 0})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-200 focus:border-green-300 transition-all"
                      placeholder="e.g. 50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Supplier Name *</label>
                    <input
                      required
                      value={stockInForm.supplierName}
                      onChange={e => setStockInForm({...stockInForm, supplierName: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-200 focus:border-green-300 transition-all"
                      placeholder="e.g. Dentcare Solutions Sdn Bhd"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Invoice / DO No.</label>
                    <input
                      value={stockInForm.invoiceNo}
                      onChange={e => setStockInForm({...stockInForm, invoiceNo: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-200 focus:border-green-300 transition-all font-mono"
                      placeholder="e.g. INV-2024-001"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">New Total After Stock In</label>
                    <div className="w-full bg-green-50 border border-green-100 rounded-lg px-4 py-2.5 text-sm font-bold text-green-700">
                      {stockInItem.total + (stockInForm.quantity || 0)} {stockInItem.unit}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notes (Optional)</label>
                    <textarea
                      value={stockInForm.notes}
                      onChange={e => setStockInForm({...stockInForm, notes: e.target.value})}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-200 focus:border-green-300 transition-all resize-none"
                      placeholder="e.g. Batch #1234, Expiry: Dec 2025"
                    />
                  </div>
                </div>

                {stockInForm.quantity > 0 && (
                  <div className="p-3 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <p className="text-xs text-green-700">
                      <strong>{stockInForm.quantity} {stockInItem.unit}</strong> will be added to <strong>{stockInItem.name}</strong>.
                      New stock level: <strong>{stockInItem.total + stockInForm.quantity} {stockInItem.unit}</strong>
                      {stockInItem.price ? ` (RM ${(stockInItem.price * stockInForm.quantity).toFixed(2)} total value)` : ''}
                    </p>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={closeStockInModal}
                    className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={stockInForm.quantity <= 0}
                    className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Download size={16} />
                    Confirm Stock In
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock In History */}
      {stockInHistory.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-manrope font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <History size={16} className="text-green-600" />
            Recent Stock-In Records
          </h3>
          {/* Mobile stock-in history cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {stockInHistory.map(record => (
              <div key={record.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-slate-900">{record.itemName}</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full shrink-0">+{record.quantity}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{record.date}</span>
                  {record.supplierName && <span className="font-medium">{record.supplierName}</span>}
                  {record.invoiceNo && <span className="font-mono">{record.invoiceNo}</span>}
                </div>
                {record.notes && <p className="text-[10px] text-slate-400 mt-1">{record.notes}</p>}
              </div>
            ))}
          </div>

          {/* Desktop stock-in history table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Date</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Qty</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Supplier</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Invoice</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stockInHistory.map(record => (
                  <tr key={record.id} className="hover:bg-green-50/30 transition-colors">
                    <td className="px-6 py-3 text-xs text-slate-500">{record.date}</td>
                    <td className="px-6 py-3 text-xs font-bold text-slate-800">{record.itemName}</td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">
                        +{record.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-600">{record.supplierName}</td>
                    <td className="px-6 py-3 text-xs font-mono text-slate-400">{record.invoiceNo || '—'}</td>
                    <td className="px-6 py-3 text-xs text-slate-400">{record.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
