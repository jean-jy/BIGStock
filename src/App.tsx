/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Settings, 
  Bell, 
  HelpCircle, 
  Hospital, 
  MapPin, 
  Stethoscope, 
  Pill, 
  AlertCircle, 
  ArrowRightLeft, 
  FileCheck, 
  Download, 
  Search, 
  Filter, 
  Edit3, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  History, 
  CheckCircle2, 
  CloudUpload,
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  Warehouse,
  LogOut,
  Pencil,
  Trash2,
  User,
  Shield,
  Globe,
  Database,
  Mail,
  Phone,
  Map,
  Users,
  Lock,
  UserPlus,
  LogIn,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Sparkles,
  PartyPopper,
  Smile,
  Star,
  Banknote,
  Receipt,
  ChevronDown,
  ChevronUp,
  MinusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider, signInWithPopup, signOut, deleteUser, db } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, query, where, onSnapshot, orderBy, updateDoc, deleteDoc, increment, runTransaction } from 'firebase/firestore';

// --- Types ---

type View = 'dashboard' | 'audit-checklist' | 'multi-branch' | 'stock-comparison' | 'inventory' | 'settings';

interface InventoryItem {
  id: string;
  name: string;
  subtext: string;
  category: string;
  sku: string;
  total: number;
  lastAudit: string;
  status: 'REORDER' | 'HEALTHY' | 'BALANCED';
  unit: string;
  price?: number;
  branchStock: Record<string, number>;
}

const BRANCH_NAMES = ['Kepong', 'Jadehills', 'Puchong'] as const;
type BranchName = typeof BRANCH_NAMES[number];

function getStatusForTotal(total: number): 'REORDER' | 'HEALTHY' | 'BALANCED' {
  if (total > 50) return 'HEALTHY';
  if (total > 20) return 'BALANCED';
  return 'REORDER';
}

function getInventoryForBranch(items: InventoryItem[], branch: string): InventoryItem[] {
  if (branch === 'Main Branch') {
    return items; // Main shows totals
  }
  return items.map(item => {
    const branchQty = item.branchStock[branch] || 0;
    return { ...item, total: branchQty, status: getStatusForTotal(branchQty) };
  });
}

interface AuditLog {
  id: string;
  date: string;
  branch: string;
  auditor: string;
  auditorAvatar: string;
  itemsChecked: number;
  status: 'ZERO DISCREPANCY' | '3 ITEMS MISMATCH';
  isRecent?: boolean;
  mismatchedItems?: { name: string; sku: string; expected: number; actual: number; remark?: string; }[];
}

interface Activity {
  id: string;
  type: 'audit' | 'restock' | 'transfer';
  title: string;
  location: string;
  time: string;
}

interface Branch {
  id: string;
  name: string;
  location: string;
}

interface TransferRequest {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  requestedBy: string;
  requestedAt: any;
}

interface TransactionRecord {
  id: string;
  type: 'STOCK_IN' | 'TRANSFER' | 'ADJUSTMENT' | 'USAGE';
  date: string;
  itemName: string;
  quantity: number;
  unit: string;
  from: string;
  to: string;
  status: 'COMPLETED' | 'PENDING';
  user: string;
}

// --- Mock Data ---

let MOCK_TRANSACTIONS: TransactionRecord[] = [
  { id: 'tx-1', type: 'TRANSFER', date: 'Oct 26, 2023, 10:30 AM', itemName: 'Dental Implant Screws 4.0mm', quantity: 10, unit: 'Units', from: 'Kepong Branch', to: 'Jadehills Branch', status: 'COMPLETED', user: 'System Admin' },
  { id: 'tx-2', type: 'STOCK_IN', date: 'Oct 25, 2023, 02:15 PM', itemName: 'Composite Resin A2', quantity: 20, unit: 'Syringes', from: 'Supplier: Dentcare', to: 'Kepong Branch', status: 'COMPLETED', user: 'Dr. Sarah' }
];

let MOCK_INVENTORY: InventoryItem[] = [
  {
    id: '1',
    name: 'Dental Implant Screws 4.0mm',
    subtext: 'Titanium Grade 5',
    category: 'Surgery',
    sku: 'IMP-400-T',
    total: 54,
    lastAudit: 'Oct 25, 2023',
    status: 'HEALTHY',
    unit: 'Units',
    price: 450.00,
    branchStock: { Kepong: 22, Jadehills: 18, Puchong: 14 }
  },
  {
    id: '2',
    name: 'Nitrile Exam Gloves (Medium)',
    subtext: 'Box of 100',
    category: 'Consumables',
    sku: 'GLV-NIT-M',
    total: 165,
    lastAudit: 'Oct 24, 2023',
    status: 'HEALTHY',
    unit: 'Boxes',
    price: 35.50,
    branchStock: { Kepong: 60, Jadehills: 55, Puchong: 50 }
  },
  {
    id: '3',
    name: 'Alginate Impression Material',
    subtext: 'Fast Set 500g',
    category: 'Prosthetics',
    sku: 'ALG-FST-500',
    total: 47,
    lastAudit: 'Oct 19, 2023',
    status: 'BALANCED',
    unit: 'Packs',
    price: 125.00,
    branchStock: { Kepong: 18, Jadehills: 15, Puchong: 14 }
  },
  {
    id: '4',
    name: 'Composite Resin A2',
    subtext: 'Light-cure 4g syringe',
    category: 'Consumables',
    sku: 'CMP-A2-4G',
    total: 36,
    lastAudit: 'Oct 22, 2023',
    status: 'BALANCED',
    unit: 'Syringes',
    price: 85.00,
    branchStock: { Kepong: 14, Jadehills: 12, Puchong: 10 }
  },
  {
    id: '5',
    name: 'Anesthetic Cartridges 2%',
    subtext: 'Lidocaine HCL',
    category: 'Surgery',
    sku: 'ANE-LID-2P',
    total: 120,
    lastAudit: 'Oct 23, 2023',
    status: 'HEALTHY',
    unit: 'Cartridges',
    price: 12.50,
    branchStock: { Kepong: 45, Jadehills: 40, Puchong: 35 }
  },
  {
    id: '6',
    name: 'Dental Burs (Diamond FG)',
    subtext: 'Assorted Pack 10pcs',
    category: 'Instruments',
    sku: 'BUR-DIA-FG',
    total: 15,
    lastAudit: 'Oct 20, 2023',
    status: 'REORDER',
    unit: 'Packs',
    price: 65.00,
    branchStock: { Kepong: 6, Jadehills: 5, Puchong: 4 }
  }
];

const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: '1',
    date: 'Today, 09:30 AM',
    branch: 'Main Branch',
    auditor: 'System Manager',
    auditorAvatar: 'https://picsum.photos/seed/admin/100/100',
    itemsChecked: 1284,
    status: 'ZERO DISCREPANCY',
    isRecent: true
  },
  {
    id: '2',
    date: 'Oct 24, 2023',
    branch: 'Main Branch',
    auditor: 'Dr. Sarah Chen',
    auditorAvatar: 'https://picsum.photos/seed/sarah/100/100',
    itemsChecked: 1284,
    status: 'ZERO DISCREPANCY'
  },
  {
    id: '3',
    date: 'Oct 22, 2023',
    branch: 'Main Branch',
    auditor: 'Marcus Wong',
    auditorAvatar: 'https://picsum.photos/seed/marcus/100/100',
    itemsChecked: 412,
    status: '3 ITEMS MISMATCH',
    mismatchedItems: [
      { name: 'Dental Implant Screws 4.0mm', sku: 'IMP-400-T', expected: 22, actual: 18, remark: 'Used in morning surgery, forgot to log.' },
      { name: 'Composite Resin (A2 Shade)', sku: 'BD-RES-045', expected: 20, actual: 24, remark: 'Found extra unlogged boxes in back drawer.' },
      { name: 'Sterile Gauze Pads (4x4)', sku: 'BD-GAU-089', expected: 520, actual: 500, remark: 'Dispensed to hygiene room.' }
    ]
  }
];

const MOCK_ACTIVITIES: Activity[] = [
  {
    id: '1',
    type: 'audit',
    title: 'Audit Completed',
    location: 'Main Branch',
    time: 'Today, 9:30 AM'
  },
  {
    id: '2',
    type: 'restock',
    title: 'Restock: Ortho-Brackets',
    location: 'Jadehills',
    time: '12 mins ago'
  },
  {
    id: '3',
    type: 'transfer',
    title: 'Transfer: Local Anesthetic',
    location: 'Kepong → Setiawalk',
    time: '1 hour ago'
  }
];

// --- Components ---

const LoginView = ({ onLogin, mockUsers }: { onLogin: (u: any) => void, mockUsers: any[] }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('admin@bigdental.com');
  const [password, setPassword] = useState('password123');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    setTimeout(() => {
      const foundUser = mockUsers.find(u => u.email === email && u.password === password);
      if (foundUser) {
        onLogin({
          email: foundUser.email,
          uid: foundUser.id.toString(),
          displayName: foundUser.name,
          role: foundUser.role,
          assignedBranch: foundUser.branch,
          photoURL: foundUser.avatar
        });
      } else {
        setError("Invalid email or password");
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100"
      >
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-primary-container rounded-2xl flex items-center justify-center text-white mx-auto mb-6 shadow-lg">
            <Hospital size={32} />
          </div>
          <h1 className="text-3xl font-manrope font-extrabold text-slate-900 tracking-tight mb-2">BIGStock Precision</h1>
          <p className="text-slate-500 text-sm mb-8">Secure clinical inventory management for Big Dental Group.</p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-xs font-bold text-left">
              <AlertTriangle size={16} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email Address</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"><Mail size={16} /></div>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="name@bigdental.com" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Password</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"><Lock size={16} /></div>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="••••••••" />
              </div>
            </div>
            
            <button 
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-4 bg-primary text-white rounded-2xl font-manrope font-bold text-sm tracking-tight shadow-xl shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn size={20} />
                  Sign In
                </>
              )}
            </button>
          </form>
          
          <p className="mt-8 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Authorized Personnel Only
          </p>
        </div>
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
          <p className="text-[9px] text-slate-400 font-medium">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void, key?: string }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 w-full rounded-md font-inter text-xs font-semibold uppercase tracking-widest transition-all duration-300 ${
      active 
        ? 'bg-white text-primary shadow-sm translate-x-1' 
        : 'text-slate-500 hover:bg-surface-container-high hover:translate-x-1'
    }`}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const StatsCard = ({ label, value, subtext, borderVariant }: { label: string, value: string, subtext: string, borderVariant: 'primary' | 'tertiary' | 'secondary' | 'blue' }) => {
  const borderColors = {
    primary: 'border-primary',
    tertiary: 'border-tertiary',
    secondary: 'border-surface-container-high',
    blue: 'border-primary-container'
  };

  return (
    <div className={`bg-white p-6 rounded-xl border-l-4 ${borderColors[borderVariant]} shadow-sm`}>
      <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-manrope font-extrabold ${borderVariant === 'tertiary' ? 'text-tertiary' : 'text-slate-900'}`}>{value}</p>
      <p className="text-[9px] text-slate-400 mt-2 flex items-center gap-1">
        <History size={12} /> {subtext}
      </p>
    </div>
  );
};

const StatusBadge = ({ status }: { status: InventoryItem['status'] | AuditLog['status'] }) => {
  const styles = {
    REORDER: 'bg-red-100 text-red-700',
    HEALTHY: 'bg-blue-100 text-blue-700',
    BALANCED: 'bg-blue-100 text-blue-700',
    'ZERO DISCREPANCY': 'bg-blue-100 text-blue-700',
    '3 ITEMS MISMATCH': 'bg-red-100 text-red-700'
  };

  const dotColors = {
    REORDER: 'bg-red-500',
    HEALTHY: 'bg-blue-500',
    BALANCED: 'bg-blue-500',
    'ZERO DISCREPANCY': 'bg-blue-500',
    '3 ITEMS MISMATCH': 'bg-red-500'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${styles[status as keyof typeof styles]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status as keyof typeof dotColors]}`}></span>
      {status}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [activeBranch, setActiveBranch] = useState('Main Branch');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [mockUsers, setMockUsers] = useState([
    { id: 1, name: 'Dr. Sarah Chen', role: 'Admin', branch: 'All Branches', email: 'admin@bigdental.com', avatar: 'https://picsum.photos/seed/sarah/100/100', password: 'password123' },
    { id: 2, name: 'Marcus Wong', role: 'Branch Manager', branch: 'Kepong Branch', email: 'marcus.w@bigdental.com', avatar: 'https://picsum.photos/seed/marcus/100/100', password: 'password123' },
    { id: 3, name: 'Aisha Rahman', role: 'Staff', branch: 'Jadehills Branch', email: 'aisha.r@bigdental.com', avatar: 'https://picsum.photos/seed/aisha/100/100', password: 'password123' },
    { id: 4, name: 'Kevin Tan', role: 'Staff', branch: 'Setiawalk Branch', email: 'kevin.t@bigdental.com', avatar: 'https://picsum.photos/seed/kevin/100/100', password: 'password123' },
  ]);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Seed database with initial data if empty
  useEffect(() => {
    if (!user || user.email !== 'jiayingjean@gmail.com') return;

    const seedData = async () => {
      try {
        // Seed branches
        const branches = ['Kepong', 'Jadehills', 'Setiawalk'];
        for (const branchName of branches) {
          const branchRef = doc(db, 'branches', branchName);
          const branchSnap = await getDoc(branchRef);
          if (!branchSnap.exists()) {
            await setDoc(branchRef, {
              name: `${branchName} Branch`,
              location: `${branchName} Medical Center`,
              manager: 'Branch Manager'
            });
          }
        }

        // Seed inventory items
        for (const item of MOCK_INVENTORY) {
          const itemRef = doc(db, 'inventory', item.id);
          const itemSnap = await getDoc(itemRef);
          if (!itemSnap.exists()) {
            await setDoc(itemRef, {
              name: item.name,
              subtext: item.subtext,
              category: item.category,
              sku: item.sku,
              total: item.total,
              unit: item.unit,
              status: item.status,
              lastAudit: serverTimestamp()
            });
          }
        }
      } catch (error) {
        console.error("Error seeding database:", error);
      }
    };

    seedData();
  }, [user]);

  const handleLogout = async () => {
    setUser(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={(newUser) => { 
      setUser(newUser); 
      setCurrentView('dashboard');
      setActiveBranch(newUser.assignedBranch === 'All Branches' ? 'Main Branch' : newUser.assignedBranch); 
    }} mockUsers={mockUsers} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-8">
          <span className="text-xl font-extrabold text-primary tracking-tighter flex items-center gap-1">
            BIGStock Precision <Sparkles className="text-amber-400 animate-pulse" size={18} />
          </span>
          <nav className="hidden md:flex gap-6 items-center">
            <button 
              onClick={() => setCurrentView('dashboard')}
              className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${
                currentView === 'dashboard' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'
              }`}
            >
              Dashboard
            </button>
            {user?.role === 'Admin' && (
              <button 
                onClick={() => setCurrentView('multi-branch')}
                className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${
                  currentView === 'multi-branch' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'
                }`}
              >
                Multi-Branch
              </button>
            )}
            <button 
              onClick={() => setCurrentView('stock-comparison')}
              className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${
                currentView === 'stock-comparison' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'
              }`}
            >
              Comparison
            </button>
            {user?.role === 'Admin' && (
              <button 
                onClick={() => setCurrentView('inventory')}
                className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${
                  currentView === 'inventory' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'
                }`}
              >
                Inventory
              </button>
            )}
            {user?.role === 'Admin' && (
              <button 
                onClick={() => setCurrentView('settings')}
                className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${
                  currentView === 'settings' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'
                }`}
              >
                Settings
              </button>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-500 hover:text-primary transition-colors"><Bell size={20} /></button>
          <button className="p-2 text-slate-500 hover:text-primary transition-colors"><HelpCircle size={20} /></button>
          <div className="relative group cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-900 leading-tight">{user.displayName}</p>
                <p className="text-[9px] font-bold text-primary uppercase tracking-widest">{user.role}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-slate-200 overflow-hidden border-2 border-slate-100 group-hover:border-primary/50 transition-all">
                <img src={user.photoURL || "https://picsum.photos/seed/user123/100/100"} alt="User" className="w-full h-full object-cover" />
              </div>
            </div>
            
            {/* Quick User Switcher Menu (For Demo purposes) */}
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Fast Role Switcher (Demo)</p>
              </div>
              <div className="p-1">
                {[
                  { ...user, uid: '1', displayName: 'Admin User', role: 'Admin', assignedBranch: 'All Branches', photoURL: 'https://picsum.photos/seed/a/100/100' },
                  { ...user, uid: '2', displayName: 'Marcus (Manager)', role: 'Branch Manager', assignedBranch: 'Kepong', photoURL: 'https://picsum.photos/seed/b/100/100' },
                  { ...user, uid: '3', displayName: 'Aisha (Staff)', role: 'Staff', assignedBranch: 'Jadehills', photoURL: 'https://picsum.photos/seed/c/100/100' }
                ].map(demoUser => (
                  <button 
                    key={demoUser.uid}
                    onClick={() => {
                        setUser(demoUser); 
                        if(demoUser.role !== 'Admin') setActiveBranch(demoUser.assignedBranch);
                        if(demoUser.role !== 'Admin' && ['settings', 'multi-branch', 'inventory'].includes(currentView)) setCurrentView('dashboard');
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors flex flex-col ${user.uid === demoUser.uid ? 'bg-primary/5 text-primary' : 'text-slate-600'}`}
                  >
                    <span>{demoUser.displayName}</span>
                    <span className="text-[9px] text-slate-400 font-normal">{demoUser.assignedBranch}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col gap-4 p-6 border-r border-slate-100 bg-surface-container-low w-64 fixed left-0 top-16 h-[calc(100vh-64px)]">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded bg-primary-container flex items-center justify-center text-white overflow-hidden shrink-0">
                <img src="/logo.png" alt="Big Dental Clinic" className="w-full h-full object-cover bg-white" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                <Hospital size={16} className="hidden" />
              </div>
              <div>
                <h3 className="text-sm font-manrope font-bold text-slate-800 leading-none">BIG DENTAL CLINIC</h3>
                <p className="text-[9px] font-inter font-semibold uppercase tracking-widest text-slate-500 mt-1">Stock Management</p>
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {user?.role === 'Admin' && (
              <>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-4">Headquarters</p>
                <SidebarItem 
                  icon={MapPin} 
                  label="Main Branch" 
                  active={activeBranch === 'Main Branch'} 
                  onClick={() => setActiveBranch('Main Branch')}
                />
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1 px-4">Branches</p>
              </>
            )}
            {user?.role !== 'Admin' && (
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-4">My Assigned Branch</p>
            )}
            
            {BRANCH_NAMES.filter(branch => user?.role === 'Admin' || user?.assignedBranch === branch).map(branch => (
              <SidebarItem 
                key={branch}
                icon={MapPin} 
                label={branch} 
                active={activeBranch === branch} 
                onClick={() => setActiveBranch(branch)}
              />
            ))}
          </nav>

          <div className="mt-auto space-y-4">
            {user?.role === 'Admin' && (
              <button 
                onClick={() => setIsTransferModalOpen(true)}
                className="w-full py-3 px-4 bg-primary-container text-white rounded-md font-manrope font-bold text-sm tracking-tight shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <ArrowRightLeft size={16} />
                Request Transfer
              </button>
            )}
            <div className="pt-4 border-t border-slate-200">
               <button 
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-2 text-slate-500 text-xs font-semibold uppercase tracking-widest hover:text-tertiary transition-colors w-full"
               >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 p-8">
          <AnimatePresence mode="wait">
            {currentView === 'dashboard' ? (
              <DashboardView key={`dashboard-${activeBranch}`} onStartAudit={() => setCurrentView('audit-checklist')} activeBranch={activeBranch} user={user} />
            ) : currentView === 'multi-branch' ? (
              <MultiBranchView key="multi-branch" onOpenTransfer={() => setIsTransferModalOpen(true)} />
            ) : currentView === 'stock-comparison' ? (
              <StockComparisonView key="stock-comparison" />
            ) : currentView === 'inventory' ? (
              <InventoryView key={`inventory-${activeBranch}`} activeBranch={activeBranch} />
            ) : currentView === 'settings' ? (
              <SettingsView key="settings" mockUsers={mockUsers} setMockUsers={setMockUsers} />
            ) : (
              <AuditChecklist key="audit" onBack={() => setCurrentView('dashboard')} />
            )}
          </AnimatePresence>
        </main>
      </div>

      <TransferModal 
        isOpen={isTransferModalOpen} 
        onClose={() => setIsTransferModalOpen(false)} 
        inventory={MOCK_INVENTORY} 
      />
    </div>
  );
}

// --- Inventory View ---

function InventoryView({ activeBranch }: { activeBranch: string, key?: string }) {
  const [items, setItems] = useState<InventoryItem[]>(() => getInventoryForBranch(MOCK_INVENTORY, activeBranch));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [categories, setCategories] = useState(['Surgery', 'Consumables', 'Prosthetics', 'Endodontics', 'Orthodontics', 'Instruments']);
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
  
  const [newItem, setNewItem] = useState({
    name: '',
    subtext: '',
    category: 'Surgery',
    sku: '',
    total: 0,
    unit: 'Units',
    price: 0
  });

  const handleAddCategory = () => {
    if (newCategoryName.trim() && !categories.includes(newCategoryName.trim())) {
      setCategories([...categories, newCategoryName.trim()]);
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

  const handleCreateOrUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      setItems(items.map(item => item.id === editingItem.id ? { ...item, ...newItem, status: newItem.total < 20 ? 'REORDER' : 'HEALTHY' } : item));
    } else {
      const item: InventoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        ...newItem,
        lastAudit: 'Just now',
        status: newItem.total < 20 ? 'REORDER' : 'HEALTHY'
      };
      setItems([item, ...items]);
    }
    closeModal();
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
      price: item.price || 0
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setNewItem({ name: '', subtext: '', category: 'Surgery', sku: '', total: 0, unit: 'Units', price: 0 });
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      setItems(items.filter(item => item.id !== id));
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

  const handleStockInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInItem || stockInForm.quantity <= 0) return;
    
    const newTotal = stockInItem.total + stockInForm.quantity;
    setItems(items.map(i => i.id === stockInItem.id ? {
      ...i,
      total: newTotal,
      lastAudit: new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' }),
      status: newTotal < 20 ? 'REORDER' : 'HEALTHY'
    } : i));

    // Log this stock-in to history
    setStockInHistory(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      itemId: stockInItem.id,
      itemName: stockInItem.name,
      quantity: stockInForm.quantity,
      supplierName: stockInForm.supplierName,
      invoiceNo: stockInForm.invoiceNo,
      notes: stockInForm.notes,
      date: new Date().toLocaleString('en-MY')
    }, ...prev]);

    closeStockInModal();
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
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all rounded-md active:scale-95"
        >
          <Plus size={18} />
          Add New Item
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-8 items-center">
        <button className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-full shadow-sm">All Items</button>
        {categories.map(cat => (
          <div key={cat} className="group relative flex items-center">
            <button className="px-4 py-2 bg-white text-slate-500 text-xs font-bold rounded-full border border-slate-100 hover:border-primary/20 hover:text-primary transition-all pr-8">
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
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
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                <td className="px-6 py-5">
                  <p className="text-sm font-bold text-slate-900">{item.name}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-tight">{item.subtext}</p>
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
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Item Name</label>
                    <input 
                      required
                      value={newItem.name}
                      onChange={e => setNewItem({...newItem, name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all" 
                      placeholder="e.g. Dental Mirror #4"
                    />
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
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
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

// --- Stock Comparison View ---

function StockComparisonView() {
  const comparisonData = [
    { id: '1', name: 'Dental Implant Screws 4.0mm', sku: 'IMP-400-T', lastCount: 22, currentCount: 18, unit: 'Units' },
    { id: '2', name: 'Nitrile Exam Gloves (Medium)', sku: 'GLV-NIT-M', lastCount: 150, currentCount: 165, unit: 'Boxes' },
    { id: '3', name: 'Alginate Impression Material', sku: 'ALG-FST-500', lastCount: 55, currentCount: 47, unit: 'Packs' },
    { id: '4', name: 'Composite Resin (A2 Shade)', sku: 'BD-RES-045', lastCount: 20, currentCount: 24, unit: 'Syringes' },
    { id: '5', name: 'Sterile Gauze Pads (4x4)', sku: 'BD-GAU-089', lastCount: 520, currentCount: 500, unit: 'Units' },
  ];

  const totalDecrease = comparisonData.reduce((acc, item) => {
    const diff = item.currentCount - item.lastCount;
    return diff < 0 ? acc + Math.abs(diff) : acc;
  }, 0);

  const totalIncrease = comparisonData.reduce((acc, item) => {
    const diff = item.currentCount - item.lastCount;
    return diff > 0 ? acc + diff : acc;
  }, 0);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Audit Variance Analysis</span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">Stock Comparison</h1>
          <p className="text-slate-500 font-inter text-sm mt-1">Comparing current audit (Oct 24) vs previous audit (Oct 10).</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-lg border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="text-right">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Net Variance</p>
              <p className={`text-sm font-extrabold ${totalIncrease - totalDecrease >= 0 ? 'text-blue-600' : 'text-tertiary'}`}>
                {totalIncrease - totalDecrease > 0 ? '+' : ''}{totalIncrease - totalDecrease} Units
              </p>
            </div>
            <div className="w-px h-8 bg-slate-100"></div>
            <button className="flex items-center gap-2 text-primary text-sm font-bold hover:opacity-80 transition-opacity">
              <Download size={16} />
              Export Variance
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Decreases</p>
          <p className="text-2xl font-extrabold text-tertiary">-{totalDecrease}</p>
          <p className="text-[10px] text-slate-400 mt-1">Items consumed or missing</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Increases</p>
          <p className="text-2xl font-extrabold text-blue-600">+{totalIncrease}</p>
          <p className="text-[10px] text-slate-400 mt-1">Restocked or found items</p>
        </div>
        <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
          <p className="text-primary text-[10px] font-bold uppercase mb-1">Accuracy Rate</p>
          <p className="text-2xl font-extrabold text-primary">98.4%</p>
          <p className="text-[10px] text-primary/60 mt-1">Based on system expectations</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Details</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Last Count</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Current Count</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Difference</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {comparisonData.map((item) => {
                const diff = item.currentCount - item.lastCount;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-tight">SKU: {item.sku}</p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-sm font-medium text-slate-500">{item.lastCount}</span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-sm font-bold text-slate-900">{item.currentCount}</span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`text-sm font-extrabold ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-tertiary' : 'text-slate-400'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        diff > 0 ? 'bg-blue-50 text-blue-700' : diff < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'
                      }`}>
                        {diff > 0 ? 'RESTOCKED' : diff < 0 ? 'CONSUMED' : 'NO CHANGE'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

// --- Transfer Modal ---

function TransferModal({ isOpen, onClose, inventory }: { isOpen: boolean, onClose: () => void, inventory: InventoryItem[] }) {
  const [fromBranch, setFromBranch] = useState('Kepong');
  const [toBranch, setToBranch] = useState('Jadehills');
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const branches = [...BRANCH_NAMES];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!selectedItem || fromBranch === toBranch || qty <= 0) return;

    setLoading(true);
    try {
      const item = inventory.find(i => i.id === selectedItem);
      if (!item) return;

      try {
        await addDoc(collection(db, 'transfers'), {
          fromBranchId: fromBranch,
          toBranchId: toBranch,
          itemId: selectedItem,
          itemName: item.name,
          quantity: qty,
          status: 'COMPLETED',
          requestedBy: auth.currentUser?.uid || 'user',
          requestedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn("Firebase skipped for local dev transfer.");
      }

      // 1. Immediately apply transfer to MOCK_INVENTORY for instant feedback
      if (item.branchStock) {
        item.branchStock[fromBranch] = Math.max(0, (item.branchStock[fromBranch] || 0) - qty);
        item.branchStock[toBranch] = (item.branchStock[toBranch] || 0) + qty;
        item.total = Object.values(item.branchStock).reduce((a, b) => a + b, 0);
        // 2. Force array reference update properly
        MOCK_INVENTORY = [...MOCK_INVENTORY];
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setQuantity(1);
        setSelectedItem('');
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Error requesting transfer:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-manrope font-extrabold text-slate-900 tracking-tight">Request Stock Transfer</h2>
              <p className="text-slate-500 text-sm">Move inventory between clinical branches.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
              <Plus size={24} className="rotate-45 text-slate-400" />
            </button>
          </div>

          {success ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Transfer Completed Successfully</h3>
              <p className="text-slate-500 text-sm mt-2">Inventory balances have been automatically adjusted.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From Branch</label>
                  <select 
                    value={fromBranch}
                    onChange={(e) => setFromBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
                  >
                    {branches.map(b => <option key={b} value={b}>{b} Branch</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">To Branch</label>
                  <select 
                    value={toBranch}
                    onChange={(e) => setToBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
                  >
                    {branches.map(b => <option key={b} value={b}>{b} Branch</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Item</label>
                <select 
                  required
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 text-sm font-semibold p-3 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
                >
                  <option value="">Choose an item...</option>
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="number" 
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="flex-1 bg-slate-50 border border-slate-100 text-sm font-bold p-3 rounded-xl focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                  <span className="text-xs font-bold text-slate-400 uppercase">
                    {inventory.find(i => i.id === selectedItem)?.unit || 'Units'}
                  </span>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 border border-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading || !selectedItem || fromBranch === toBranch || Number(quantity) <= 0}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Transfer Stock'}
                </button>
              </div>
              
              {fromBranch === toBranch && (
                <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-tight">Source and destination branches must be different</p>
              )}
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// --- Multi-Branch View ---

function MultiBranchView({ onOpenTransfer }: { onOpenTransfer: () => void, key?: string }) {
  const multiBranchData = [
    { id: '1', name: 'Dental Implant Screws 4.0mm', category: 'Surgery', kepong: 5, jadehills: 8, setiawalk: 5, total: 18 },
    { id: '2', name: 'Nitrile Exam Gloves (Medium)', category: 'Consumables', kepong: 45, jadehills: 70, setiawalk: 50, total: 165 },
    { id: '3', name: 'Alginate Impression Material', category: 'Prosthetics', kepong: 12, jadehills: 20, setiawalk: 15, total: 47 },
    { id: '4', name: 'Composite Resin (A2 Shade)', category: 'Consumables', kepong: 4, jadehills: 12, setiawalk: 8, total: 24 },
    { id: '5', name: 'Sterile Gauze Pads (4x4)', category: 'Consumables', kepong: 150, jadehills: 200, setiawalk: 150, total: 500 },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Network Synchronization</span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">Multi-Branch Inventory</h1>
          <p className="text-slate-500 font-inter text-sm mt-1">Comparative stock analysis across Kepong, Jadehills, and Setiawalk branches.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenTransfer}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-container text-white text-sm font-bold shadow-sm hover:opacity-90 transition-opacity rounded-md"
          >
            <ArrowRightLeft size={16} />
            New Transfer Request
          </button>
          <button 
            onClick={onOpenTransfer}
            className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-bold shadow-sm hover:bg-white transition-colors rounded-md"
          >
            <RefreshCw size={16} className="text-primary" />
            Rebalance Stock
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Details</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center bg-blue-50/30">Kepong</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center bg-blue-50/30">Jadehills</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center bg-purple-50/30">Setiawalk</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Total Network</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {multiBranchData.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-slate-900">{item.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-tight">SKU: MB-{item.id}00-X</p>
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
                  </td>
                  <td className="px-6 py-5 text-center bg-blue-50/10">
                    <span className={`text-sm font-bold ${item.kepong < 10 ? 'text-tertiary' : 'text-slate-700'}`}>{item.kepong}</span>
                  </td>
                  <td className="px-6 py-5 text-center bg-blue-50/10">
                    <span className="text-sm font-bold text-slate-700">{item.jadehills}</span>
                  </td>
                  <td className="px-6 py-5 text-center bg-purple-50/10">
                    <span className="text-sm font-bold text-slate-700">{item.setiawalk}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="text-sm font-extrabold text-primary">{item.total}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-tertiary"></span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Low Stock Alert</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary"></span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Healthy Supply</span>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Synced: 2 mins ago</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50">
          <h5 className="text-xs font-bold text-blue-800 uppercase mb-4">Kepong Performance</h5>
          <p className="text-2xl font-extrabold text-blue-900">88%</p>
          <p className="text-[10px] text-blue-600 font-medium mt-1">Inventory Efficiency Score</p>
        </div>
        <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50">
          <h5 className="text-xs font-bold text-blue-800 uppercase mb-4">Jadehills Performance</h5>
          <p className="text-2xl font-extrabold text-blue-900">94%</p>
          <p className="text-[10px] text-blue-600 font-medium mt-1">Inventory Efficiency Score</p>
        </div>
        <div className="bg-purple-50/50 p-6 rounded-2xl border border-purple-100/50">
          <h5 className="text-xs font-bold text-purple-800 uppercase mb-4">Setiawalk Performance</h5>
          <p className="text-2xl font-extrabold text-purple-900">82%</p>
          <p className="text-[10px] text-purple-600 font-medium mt-1">Inventory Efficiency Score</p>
        </div>
      </div>

      {/* Transfer History Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-manrope font-extrabold text-slate-900">Recent Transfer History</h3>
            <p className="text-slate-500 text-sm">Detailed records of stock moved across the branch network.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="text-[10px] font-bold text-primary uppercase">Synchronized</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/30 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Route</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Qty</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <PendingTransfersList />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PendingTransfersList() {
  const transfers = MOCK_TRANSACTIONS.filter(t => t.type === 'TRANSFER');

  if (transfers.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm italic">No recent transfer records found.</td>
      </tr>
    );
  }

  return (
    <>
      {transfers.map((transfer) => (
        <tr key={transfer.id} className="hover:bg-slate-50/30 transition-colors">
          <td className="px-6 py-4">
            <p className="text-sm font-bold text-slate-900">{transfer.itemName}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-tight">ID: {transfer.id.slice(0, 8)}</p>
          </td>
          <td className="px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{transfer.from.replace(' Branch', '')}</span>
              <ArrowRightLeft size={12} className="text-slate-300" />
              <span className="text-xs font-bold text-slate-700">{transfer.to.replace(' Branch', '')}</span>
            </div>
          </td>
          <td className="px-6 py-4 text-sm font-extrabold text-slate-900">{transfer.quantity}</td>
          <td className="px-6 py-4">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100`}>
              {transfer.status}
            </span>
          </td>
          <td className="px-6 py-4 text-right">
            <span className="text-[10px] font-bold text-slate-400">{transfer.date}</span>
          </td>
        </tr>
      ))}
    </>
  );
}

// --- Dashboard View ---

interface POLineItem {
  itemName: string;
  sku: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

interface ProcurementOrder {
  id: string;
  poNumber: string;
  supplier: string;
  items: POLineItem[];
  totalCost: number;
  status: 'DRAFT' | 'SUBMITTED' | 'RECEIVED' | 'CANCELLED';
  expectedDelivery: string;
  notes: string;
  createdAt: string;
  paymentStatus?: 'UNPAID' | 'PAYMENT_SUBMITTED' | 'PAID';
  paymentSubmittedDate?: string;
  paymentPaidDate?: string;
}

function DashboardView({ onStartAudit, activeBranch, user }: { onStartAudit: () => void, activeBranch: string, user?: any, key?: string }) {
  const [dashTab, setDashTab] = useState<'inventory' | 'audit' | 'procurement' | 'transactions'>('inventory');
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [usageForm, setUsageForm] = useState({ itemId: '', quantity: 1, remarks: '' });

  const handleRecordUsage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usageForm.itemId || usageForm.quantity <= 0) return;
    
    const itemIndex = MOCK_INVENTORY.findIndex(i => i.id === usageForm.itemId);
    if (itemIndex > -1) {
      if (activeBranch !== 'Main Branch') {
         MOCK_INVENTORY[itemIndex].branchStock[activeBranch] = Math.max(0, (MOCK_INVENTORY[itemIndex].branchStock[activeBranch] || 0) - usageForm.quantity);
         MOCK_INVENTORY[itemIndex].total = Math.max(0, MOCK_INVENTORY[itemIndex].total - usageForm.quantity);
      } else {
         MOCK_INVENTORY[itemIndex].total = Math.max(0, MOCK_INVENTORY[itemIndex].total - usageForm.quantity);
      }
      
      const newTotal = activeBranch !== 'Main Branch' ? MOCK_INVENTORY[itemIndex].branchStock[activeBranch] : MOCK_INVENTORY[itemIndex].total;
      if (newTotal > 50) MOCK_INVENTORY[itemIndex].status = 'HEALTHY';
      else if (newTotal > 20) MOCK_INVENTORY[itemIndex].status = 'BALANCED';
      else MOCK_INVENTORY[itemIndex].status = 'REORDER';
    // Force re-render if needed, but MOCK_INVENTORY is directly referenced
    
      MOCK_TRANSACTIONS.unshift({
        id: 'tx-usage-' + Math.random().toString(36).substr(2, 9),
        type: 'USAGE',
        date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        itemName: MOCK_INVENTORY[itemIndex].name,
        quantity: usageForm.quantity,
        unit: MOCK_INVENTORY[itemIndex].unit,
        from: activeBranch,
        to: usageForm.remarks ? `Ref: ${usageForm.remarks}` : 'Consumed / Dispensed',
        status: 'COMPLETED',
        user: user?.name || 'Staff'
      });
    }

    setUsageModalOpen(false);
    setUsageForm({ itemId: '', quantity: 1, remarks: '' });
  };

  const [orders, setOrders] = useState<ProcurementOrder[]>([
    {
      id: '1', poNumber: 'PO-2023-001', supplier: 'Dentcare Solutions Sdn Bhd',
      items: [
        { itemName: 'Dental Implant Screws 4.0mm', sku: 'IMP-400-T', quantity: 50, unit: 'Units', unitPrice: 450.00 },
        { itemName: 'Nitrile Exam Gloves (Medium)', sku: 'GLV-NIT-M', quantity: 20, unit: 'Boxes', unitPrice: 35.50 }
      ],
      totalCost: 23210.00, status: 'SUBMITTED', expectedDelivery: '2023-11-15',
      notes: 'Urgent restock — stock critical', createdAt: 'Oct 25, 2023'
    },
    {
      id: '2', poNumber: 'PO-2023-002', supplier: 'MediGlove Malaysia',
      items: [{ itemName: 'Nitrile Exam Gloves (Medium)', sku: 'GLV-NIT-M', quantity: 100, unit: 'Boxes', unitPrice: 35.50 }],
      totalCost: 3550.00, status: 'RECEIVED', expectedDelivery: '2023-11-01',
      notes: 'Monthly restock order', createdAt: 'Oct 20, 2023',
      paymentStatus: 'PAID', paymentSubmittedDate: 'Oct 21, 2023', paymentPaidDate: 'Oct 22, 2023'
    },
    {
      id: '3', poNumber: 'PO-2023-003', supplier: 'ProDental Supplies',
      items: [
        { itemName: 'Alginate Impression Material', sku: 'ALG-FST-500', quantity: 30, unit: 'Packs', unitPrice: 125.00 },
        { itemName: 'Dental Implant Screws 4.0mm', sku: 'IMP-400-T', quantity: 10, unit: 'Units', unitPrice: 450.00 }
      ],
      totalCost: 8250.00, status: 'DRAFT', expectedDelivery: '2023-12-01',
      notes: '', createdAt: 'Oct 26, 2023'
    }
  ]);

  const emptyLine = (): POLineItem => ({ itemName: '', sku: '', quantity: 0, unit: 'Units', unitPrice: 0 });
  const [poFormSupplier, setPoFormSupplier] = useState('');
  const [poFormDelivery, setPoFormDelivery] = useState('');
  const [poFormNotes, setPoFormNotes] = useState('');
  const [poFormLines, setPoFormLines] = useState<POLineItem[]>([emptyLine()]);
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [editingPOId, setEditingPOId] = useState<string | null>(null);
  const [suppliersList, setSuppliersList] = useState<string[]>(['Dentcare Solutions Sdn Bhd', 'MediGlove Malaysia', 'ProDental Supplies']);
  const [printPOId, setPrintPOId] = useState<string | null>(null);

  const nextPoNumber = editingPOId ? orders.find(o => o.id === editingPOId)?.poNumber || '' : `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`;

  const updateLine = (idx: number, field: keyof POLineItem, val: string | number) => {
    setPoFormLines(poFormLines.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  };
  const removeLine = (idx: number) => setPoFormLines(poFormLines.filter((_, i) => i !== idx));
  const addLine = () => setPoFormLines([...poFormLines, emptyLine()]);

  const poFormTotal = poFormLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = poFormLines.filter(l => l.itemName && l.quantity > 0);
    if (validLines.length === 0) return;

    if (editingPOId) {
      setOrders(orders.map(o => o.id === editingPOId ? {
        ...o,
        supplier: poFormSupplier,
        items: validLines,
        totalCost: validLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
        expectedDelivery: poFormDelivery,
        notes: poFormNotes,
      } : o));
    } else {
      const newOrder: ProcurementOrder = {
        id: Math.random().toString(36).substr(2, 9),
        poNumber: nextPoNumber,
        supplier: poFormSupplier,
        items: validLines,
        totalCost: validLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
        status: 'DRAFT',
        expectedDelivery: poFormDelivery,
        notes: poFormNotes,
        createdAt: new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })
      };
      setOrders([newOrder, ...orders]);
    }

    setPoFormSupplier(''); setPoFormDelivery(''); setPoFormNotes(''); setPoFormLines([emptyLine()]);
    setEditingPOId(null);
    setPoModalOpen(false);
  };
  
  const handleEditPO = (order: ProcurementOrder) => {
    setEditingPOId(order.id);
    setPoFormSupplier(order.supplier);
    setPoFormDelivery(order.expectedDelivery || '');
    setPoFormNotes(order.notes || '');
    setPoFormLines(order.items.length > 0 ? order.items.map(l => ({...l})) : [emptyLine()]);
    setPoModalOpen(true);
  };
  
  const handleClosePoModal = () => {
    setPoModalOpen(false);
    setTimeout(() => {
      setEditingPOId(null);
      setPoFormSupplier(''); setPoFormDelivery(''); setPoFormNotes(''); setPoFormLines([emptyLine()]);
    }, 200);
  };

  const updatePOStatus = (id: string, newStatus: ProcurementOrder['status']) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const handleGoodsReceived = (order: ProcurementOrder) => {
    // Update MOCK_INVENTORY totals for each line item
    for (const line of order.items) {
      const invItem = MOCK_INVENTORY.find(i => i.sku === line.sku);
      if (invItem) {
        invItem.total += line.quantity;
        if (invItem.total > 50) invItem.status = 'HEALTHY';
        else if (invItem.total > 20) invItem.status = 'BALANCED';
        else invItem.status = 'REORDER';
      }
    }
    MOCK_INVENTORY = [...MOCK_INVENTORY];
    const updatedOrder = { ...order, status: 'RECEIVED' as const, paymentStatus: 'UNPAID' as const };
    setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
  };

  const updatePaymentStatus = (orderId: string, status: 'PAYMENT_SUBMITTED' | 'PAID') => {
    const now = new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      if (status === 'PAYMENT_SUBMITTED') {
        return { ...o, paymentStatus: status, paymentSubmittedDate: now };
      }
      return { ...o, paymentStatus: status, paymentPaidDate: now, paymentSubmittedDate: o.paymentSubmittedDate || now };
    }));
  };

  const deletePO = (id: string) => {
    if (window.confirm('Delete this procurement order?')) {
      setOrders(orders.filter(o => o.id !== id));
    }
  };

  const prefillFromItem = (item: InventoryItem) => {
    setPoFormLines([{ itemName: item.name, sku: item.sku, quantity: 0, unit: item.unit, unitPrice: item.price || 0 }]);
    setPoModalOpen(true);
  };

  const poStatusStyles: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-600', SUBMITTED: 'bg-amber-100 text-amber-700',
    RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700'
  };
  const poStatusDots: Record<string, string> = {
    DRAFT: 'bg-slate-400', SUBMITTED: 'bg-amber-500', RECEIVED: 'bg-green-500', CANCELLED: 'bg-red-500'
  };
  const paymentStatusStyles: Record<string, string> = {
    UNPAID: 'bg-red-50 text-red-600 border-red-100',
    PAYMENT_SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-100',
    PAID: 'bg-emerald-50 text-emerald-700 border-emerald-100'
  };
  const paymentStatusDots: Record<string, string> = {
    UNPAID: 'bg-red-400', PAYMENT_SUBMITTED: 'bg-amber-500', PAID: 'bg-emerald-500'
  };
  const paymentStatusLabels: Record<string, string> = {
    UNPAID: 'UNPAID', PAYMENT_SUBMITTED: 'PAYMENT SUBMITTED', PAID: 'PAID'
  };

  const totalPOValue = orders.filter(o => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.totalCost, 0);
  const pendingCount = orders.filter(o => o.status === 'SUBMITTED').length;
  const draftCount = orders.filter(o => o.status === 'DRAFT').length;

  const dashboardInventory = getInventoryForBranch(MOCK_INVENTORY, activeBranch);
  const totalSKUs = dashboardInventory.length;
  const criticalStock = dashboardInventory.filter(item => item.status === 'REORDER').length;
  const stockValue = dashboardInventory.reduce((sum, item) => sum + (item.total * (item.price || 0)), 0);
  
  const formatStockValue = (value: number) => {
    if (value >= 1000) {
      return `RM${(value / 1000).toFixed(1)}k`;
    }
    return `RM${value.toFixed(2)}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="max-w-6xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">Stock Overview — {activeBranch}</span>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight">{activeBranch === 'Main Branch' ? 'Main Master Sheet' : `${activeBranch} Branch`}</h1>
          <p className="text-slate-500 font-inter text-sm mt-1">{activeBranch === 'Main Branch' ? 'Consolidated stock across all branches.' : `Viewing stock levels for ${activeBranch} branch.`}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
            <button className="px-4 py-2 bg-white shadow-sm rounded-md text-xs font-bold text-primary">Consolidated</button>
            <button className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-primary transition-colors">By Branch</button>
          </div>
          <button 
            onClick={() => setUsageModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all rounded-md active:scale-95"
          >
            <MinusCircle size={16} />
            Log Usage
          </button>
          <button 
            onClick={onStartAudit}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-container text-white text-sm font-bold shadow-sm hover:opacity-90 transition-opacity rounded-md"
          >
            <FileCheck size={16} />
            Start New Audit
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-bold shadow-sm hover:bg-white transition-colors rounded-md">
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatsCard label="Total SKUs" value={`${totalSKUs.toLocaleString()}`} subtext="Available in catalog" borderVariant="primary" />
        <StatsCard label="Critical Low Stock" value={`${criticalStock} Items`} subtext="Requires attention" borderVariant="tertiary" />
        <StatsCard label="In Transit" value="156 Units" subtext="Pending Delivery" borderVariant="secondary" />
        <StatsCard label="Stock Value" value={formatStockValue(stockValue)} subtext="Calculated total value" borderVariant="blue" />
      </div>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-slate-100 mb-6">
        <button 
          onClick={() => setDashTab('inventory')}
          className={`pb-4 text-sm font-bold transition-colors ${dashTab === 'inventory' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-primary'}`}
        >Active Inventory</button>
        <button 
          onClick={() => setDashTab('audit')}
          className={`pb-4 text-sm font-bold transition-colors ${dashTab === 'audit' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-primary'}`}
        >Stock Audit Logs</button>
        {user?.role === 'Admin' && (
          <>
            <button 
              onClick={() => setDashTab('procurement')}
              className={`pb-4 text-sm font-bold transition-colors ${dashTab === 'procurement' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-primary'}`}
            >Procurement Orders</button>
            <button 
              onClick={() => setDashTab('transactions')}
              className={`pb-4 text-sm font-bold transition-colors ${dashTab === 'transactions' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-primary'}`}
            >Transaction Records</button>
          </>
        )}
      </div>

      {/* ==================== ACTIVE INVENTORY TAB ==================== */}
      {dashTab === 'inventory' && (
        <>
          {/* Filter Bar */}
          <div className="bg-surface-container-low rounded-xl p-4 mb-6 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[300px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                className="w-full pl-10 pr-4 py-2.5 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-slate-300" 
                placeholder="Search by item name or SKU..." 
                type="text" 
              />
            </div>
            <select className="bg-white border-none rounded-lg text-xs font-bold py-2.5 px-4 focus:ring-2 focus:ring-primary/10 text-slate-700">
              <option>All Categories</option>
              <option>Surgery</option>
              <option>Consumables</option>
              <option>Prosthetics</option>
            </select>
            <button className="p-2.5 bg-white text-slate-500 rounded-lg hover:text-primary transition-colors shadow-sm">
              <Filter size={18} />
            </button>
          </div>

          {/* Inventory Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100 mb-10">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">SKU</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Total</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Last Audit</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                    {user?.role === 'Admin' && (
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {getInventoryForBranch(MOCK_INVENTORY, activeBranch).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{item.name}</span>
                          <span className="text-[10px] text-slate-500 uppercase">{item.subtext}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">{item.category}</span>
                      </td>
                      <td className="px-6 py-5 text-xs font-mono text-slate-400">{item.sku}</td>
                      <td className={`px-6 py-5 text-sm font-bold ${item.status === 'REORDER' ? 'text-tertiary' : 'text-slate-900'}`}>{item.total}</td>
                      <td className="px-6 py-5 text-xs font-medium text-slate-500">{item.lastAudit}</td>
                      <td className="px-6 py-5">
                        <StatusBadge status={item.status} />
                      </td>
                      {user?.role === 'Admin' && (
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <button className="text-primary hover:text-primary-container transition-colors">
                              <Edit3 size={18} />
                            </button>
                            {item.status === 'REORDER' && (
                              <button 
                                onClick={() => prefillFromItem(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full border border-amber-100 hover:bg-amber-100 transition-all"
                                title="Create Purchase Order for this item"
                              >
                                <Plus size={11} />
                                Order
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 flex items-center justify-between border-t border-slate-50">
              <span className="text-xs text-slate-400">Showing 1 to 3 of 1,284 entries</span>
              <div className="flex gap-1">
                <button className="w-8 h-8 flex items-center justify-center rounded bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors"><ChevronLeft size={14} /></button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-primary text-white text-xs font-bold">1</button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors text-xs font-bold">2</button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors"><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== AUDIT LOGS TAB ==================== */}
      {dashTab === 'audit' && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-manrope font-bold text-slate-900">Stock Audit Logs</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-primary/5 text-primary text-xs font-bold rounded hover:bg-primary/10 transition-colors border border-primary/10">
              <Plus size={14} />
              Schedule New Audit
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Audit Date</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Branch</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Auditor Name</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Items Checked</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Discrepancy Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MOCK_AUDIT_LOGS.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr 
                      className={`${log.isRecent ? 'bg-primary/5' : ''} hover:bg-slate-50/50 transition-colors ${log.mismatchedItems ? 'cursor-pointer' : ''}`}
                      onClick={() => log.mismatchedItems && setExpandedAuditId(expandedAuditId === log.id ? null : log.id)}
                    >
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{log.date}</span>
                          {log.isRecent && <span className="text-[9px] text-primary font-bold uppercase tracking-tighter">Recently Completed</span>}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">{log.branch}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <img src={log.auditorAvatar} alt={log.auditor} className="w-6 h-6 rounded-full object-cover" />
                          <span className="text-sm font-medium text-slate-700">{log.auditor}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm font-bold text-primary">{log.itemsChecked.toLocaleString()}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <StatusBadge status={log.status} />
                          {log.mismatchedItems && (
                            <button className="text-slate-400 hover:text-primary transition-colors flex shrink-0">
                              {expandedAuditId === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedAuditId === log.id && log.mismatchedItems && (
                      <tr className="bg-slate-50 border-t border-slate-100/50">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <AlertCircle size={12} className="text-tertiary" /> 
                              Discrepancy Details
                            </h4>
                            <div className="space-y-3">
                              {log.mismatchedItems.map((item, idx) => {
                                const diff = item.actual - item.expected;
                                return (
                                  <div key={idx} className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100/60 bg-slate-50/50">
                                    <div>
                                      <p className="text-sm font-bold text-slate-900">{item.name}</p>
                                      <p className="text-[10px] text-slate-500 font-mono tracking-tight mt-0.5">{item.sku}</p>
                                    </div>
                                    <div className="flex items-center gap-8 text-xs">
                                      <div className="text-right">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">System Qty</p>
                                        <p className="font-semibold text-slate-600">{item.expected}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Audited Qty</p>
                                        <p className="font-bold text-slate-900">{item.actual}</p>
                                      </div>
                                      <div className="text-right min-w-[70px] bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Variance</p>
                                        <p className={`font-extrabold ${diff > 0 ? 'text-blue-600' : 'text-tertiary'}`}>{diff > 0 ? `+${diff}` : diff}</p>
                                      </div>
                                      <div className="text-right min-w-[140px] w-[200px] border-l border-slate-200 pl-6 ml-2 flex flex-col justify-center">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Auditor Remark</p>
                                        <input 
                                          type="text"
                                          defaultValue={item.remark || ''}
                                          onChange={(e) => { item.remark = e.target.value; }}
                                          placeholder="Click to add remark..."
                                          className="w-full text-xs font-semibold text-slate-700 italic text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none transition-colors"
                                          title="Edit auditor remark"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== PROCUREMENT ORDERS TAB ==================== */}
      {dashTab === 'procurement' && (
        <>
          {/* PO Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Orders</p>
              <p className="text-2xl font-bold font-manrope">{orders.length}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Pending Delivery</p>
              <p className="text-2xl font-bold font-manrope text-amber-600">{pendingCount}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Awaiting Payment</p>
              <p className="text-2xl font-bold font-manrope text-red-500">{orders.filter(o => o.status === 'RECEIVED' && o.paymentStatus && o.paymentStatus !== 'PAID').length}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total PO Value</p>
              <p className="text-2xl font-bold font-manrope text-primary">RM{totalPOValue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* PO Actions */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-manrope font-bold text-slate-900">Purchase Orders</h3>
            <button 
              onClick={() => setPoModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all rounded-md active:scale-95"
            >
              <Plus size={16} />
              New Purchase Order
            </button>
          </div>

          {/* PO Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100 mb-10">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">PO Number</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Supplier</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Items</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Total (RM)</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Payment</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.map((o) => (
                    <React.Fragment key={o.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setExpandedPO(expandedPO === o.id ? null : o.id)}>
                        <td className="px-6 py-5">
                          <span className="text-sm font-bold text-primary font-mono">{o.poNumber}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">{o.createdAt}</p>
                        </td>
                        <td className="px-6 py-5 text-xs font-medium text-slate-600 max-w-[160px]">{o.supplier}</td>
                        <td className="px-6 py-5">
                          <span className="text-sm font-bold text-slate-900">{o.items.length}</span>
                          <span className="text-[10px] text-slate-400 ml-1">{o.items.length === 1 ? 'item' : 'items'}</span>
                        </td>
                        <td className="px-6 py-5 text-sm font-bold text-slate-900">RM{o.totalCost.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                        <td className="px-6 py-5 text-xs text-slate-500">{o.expectedDelivery ? new Date(o.expectedDelivery).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${poStatusStyles[o.status]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${poStatusDots[o.status]}`}></span>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          {o.status === 'RECEIVED' && o.paymentStatus ? (
                            <div>
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${paymentStatusStyles[o.paymentStatus]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${paymentStatusDots[o.paymentStatus]}`}></span>
                                {paymentStatusLabels[o.paymentStatus]}
                              </span>
                              {o.paymentSubmittedDate && (
                                <p className="text-[9px] text-slate-400 mt-1.5">Submitted: <span className="font-bold text-slate-600">{o.paymentSubmittedDate}</span></p>
                              )}
                              {o.paymentPaidDate && (
                                <p className="text-[9px] text-slate-400 mt-0.5">Paid: <span className="font-bold text-emerald-600">{o.paymentPaidDate}</span></p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-bold">—</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {o.status === 'DRAFT' && (
                              <>
                                <button onClick={() => updatePOStatus(o.id, 'SUBMITTED')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full border border-amber-100 hover:bg-amber-100 transition-all">
                                  <CloudUpload size={11} /> Submit
                                </button>
                                <button onClick={() => handleEditPO(o)}
                                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all" title="Edit Draft">
                                  <Pencil size={13} />
                                </button>
                              </>
                            )}
                            {o.status === 'SUBMITTED' && (
                              <button onClick={() => handleGoodsReceived(o)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-[10px] font-bold rounded-full hover:bg-green-600 transition-all shadow-sm active:scale-95">
                                <CheckCircle2 size={12} /> Goods Received
                              </button>
                            )}
                            {o.status === 'RECEIVED' && o.paymentStatus !== 'PAID' && (
                              <>
                                {(!o.paymentStatus || o.paymentStatus === 'UNPAID') && (
                                  <button onClick={() => updatePaymentStatus(o.id, 'PAYMENT_SUBMITTED')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full border border-amber-100 hover:bg-amber-100 transition-all active:scale-95">
                                    <Receipt size={11} /> Payment Submitted
                                  </button>
                                )}
                                <button onClick={() => updatePaymentStatus(o.id, 'PAID')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full border border-emerald-100 hover:bg-emerald-100 transition-all active:scale-95">
                                  <CheckCircle2 size={11} /> Payment Done
                                </button>
                              </>
                            )}
                            {(o.status === 'SUBMITTED' || o.status === 'RECEIVED') && (
                              <button onClick={() => setPrintPOId(o.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full border border-slate-200 hover:bg-slate-200 transition-all shadow-sm tracking-tight">
                                <Download size={11} /> Export PO
                              </button>
                            )}
                            {(o.status === 'DRAFT' || o.status === 'SUBMITTED') && (
                              <button onClick={() => updatePOStatus(o.id, 'CANCELLED')}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Cancel Order">
                                <Plus size={14} className="rotate-45" />
                              </button>
                            )}
                            <button onClick={() => deletePO(o.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded row — line items detail */}
                      {expandedPO === o.id && (
                        <tr>
                          <td colSpan={8} className="bg-slate-50/80 px-6 py-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Line Items</p>
                            <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="border-b border-slate-100">
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">Item</th>
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">SKU</th>
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">Qty</th>
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">Unit Price</th>
                                    <th className="px-4 py-2 text-[9px] font-bold uppercase text-slate-400">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {o.items.map((line, li) => (
                                    <tr key={li}>
                                      <td className="px-4 py-2.5 text-xs font-bold text-slate-800">{line.itemName}</td>
                                      <td className="px-4 py-2.5 text-[10px] font-mono text-slate-400">{line.sku}</td>
                                      <td className="px-4 py-2.5 text-xs font-bold">{line.quantity} <span className="text-slate-400 font-normal">{line.unit}</span></td>
                                      <td className="px-4 py-2.5 text-xs text-slate-600">RM{line.unitPrice.toFixed(2)}</td>
                                      <td className="px-4 py-2.5 text-xs font-bold text-primary">RM{(line.quantity * line.unitPrice).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {o.notes && <p className="text-[10px] text-slate-500 mt-2"><span className="font-bold">Notes:</span> {o.notes}</p>}
                            {o.paymentStatus && (
                              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Banknote size={12} /> Payment Record</p>
                                <div className="flex items-center gap-4 flex-wrap">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${paymentStatusStyles[o.paymentStatus]}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${paymentStatusDots[o.paymentStatus]}`}></span>
                                    {paymentStatusLabels[o.paymentStatus]}
                                  </span>
                                  {o.paymentSubmittedDate && <span className="text-[10px] text-slate-500">Submitted: <span className="font-bold">{o.paymentSubmittedDate}</span></span>}
                                  {o.paymentPaidDate && <span className="text-[10px] text-slate-500">Paid: <span className="font-bold text-emerald-600">{o.paymentPaidDate}</span></span>}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                        <Package size={40} className="mx-auto mb-3 text-slate-200" />
                        <p className="text-sm font-bold">No procurement orders yet</p>
                        <p className="text-xs mt-1">Create your first purchase order to start tracking supplier orders.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Inventory + Audit tabs: Bottom Grid (only show when not on procurement tab) */}
      {dashTab !== 'procurement' && (
        <>
          {dashTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="col-span-1 md:col-span-2 bg-surface-container-low p-6 rounded-2xl relative overflow-hidden">
                <h4 className="text-lg font-manrope font-bold text-slate-900 mb-4">Branch Distribution Trend</h4>
                <div className="h-48 w-full flex items-end gap-4 px-2 relative z-10">
                  {[
                    { name: 'Kepong', val: 34 },
                    { name: 'Jadehills', val: 42 },
                    { name: 'Setiawalk', val: 24 }
                  ].map((branch) => (
                    <div key={branch.name} className="flex-1 bg-primary/10 rounded-t-lg relative group">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-white text-[10px] px-2 py-1 rounded">{branch.val}%</div>
                      <div 
                        className="bg-primary-container w-full rounded-t-lg transition-all duration-1000" 
                        style={{ height: `${branch.val}%` }}
                      ></div>
                      <p className="text-[10px] font-bold text-center mt-2 text-slate-600">{branch.name}</p>
                    </div>
                  ))}
                </div>
                <div className="absolute right-[-5%] bottom-[-5%] w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-manrope font-bold text-slate-900">Recent Activity</h4>
                  <button className="text-[10px] text-primary uppercase font-bold tracking-tighter">View All</button>
                </div>
                <div className="space-y-4">
                  {MOCK_ACTIVITIES.map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        activity.type === 'audit' ? 'bg-blue-50 text-blue-600' : 
                        activity.type === 'restock' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {activity.type === 'audit' ? <FileCheck size={14} /> : 
                         activity.type === 'restock' ? <Warehouse size={14} /> : <ArrowRightLeft size={14} />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{activity.title}</p>
                        <p className="text-[10px] text-slate-400">{activity.location} • {activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* FAB */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-4">
        <button 
          onClick={onStartAudit}
          className="w-12 h-12 bg-white text-primary rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all group relative border border-slate-100"
        >
          <ClipboardCheck size={20} />
          <span className="absolute right-full mr-3 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">Quick Audit</span>
        </button>
        {user?.role === 'Admin' && (
          <button 
            onClick={() => setPoModalOpen(true)}
            className="w-14 h-14 bg-primary text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={28} />
          </button>
        )}
      </div>

      {/* ==================== CREATE PO MODAL ==================== */}
      <AnimatePresence>
        {poModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClosePoModal}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 border-b border-slate-100">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Package size={16} className="text-primary" />
                      </div>
                      <h3 className="text-xl font-manrope font-extrabold text-slate-900">{editingPOId ? 'Edit Purchase Order' : 'New Purchase Order'}</h3>
                    </div>
                    <p className="text-xs text-slate-500">PO Number: <span className="font-mono font-bold text-primary">{nextPoNumber}</span></p>
                  </div>
                  <button type="button" onClick={handleClosePoModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <Plus size={24} className="rotate-45" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreatePO} className="p-6 space-y-4">
                {/* Supplier & Delivery */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Supplier Name *</label>
                    <div className="flex items-center gap-2">
                      <select required value={poFormSupplier} onChange={e => setPoFormSupplier(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all text-slate-700 font-semibold"
                      >
                        <option value="">Select Supplier...</option>
                        {suppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button type="button" onClick={() => {
                        const newSup = window.prompt("Enter new supplier name:");
                        if (newSup && newSup.trim() && !suppliersList.includes(newSup.trim())) {
                          setSuppliersList([...suppliersList, newSup.trim()]);
                          setPoFormSupplier(newSup.trim());
                        }
                      }} className="w-10 h-10 flex shrink-0 items-center justify-center bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors" title="Add New Supplier">
                        <Plus size={16} />
                      </button>
                      {poFormSupplier && (
                        <button type="button" onClick={() => {
                          if (window.confirm(`Delete supplier "${poFormSupplier}" from list?`)) {
                            setSuppliersList(suppliersList.filter(s => s !== poFormSupplier));
                            setPoFormSupplier('');
                          }
                        }} className="w-10 h-10 flex shrink-0 items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Remove Supplier">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Expected Delivery</label>
                    <input type="date" value={poFormDelivery} onChange={e => setPoFormDelivery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all" />
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Line Items *</label>
                    <button type="button" onClick={addLine}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/5 text-primary text-[10px] font-bold rounded-full border border-primary/10 hover:bg-primary/10 transition-all">
                      <Plus size={11} /> Add Item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {poFormLines.map((line, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Item {idx + 1}</span>
                          {poFormLines.length > 1 && (
                            <button type="button" onClick={() => removeLine(idx)}
                              className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          <div className="col-span-2">
                            <input required value={line.itemName} onChange={e => updateLine(idx, 'itemName', e.target.value)}
                              className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/10 transition-all"
                              placeholder="Item Name *" />
                          </div>
                          <input value={line.sku} onChange={e => updateLine(idx, 'sku', e.target.value)}
                            className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary/10 transition-all"
                            placeholder="SKU" />
                          <input type="number" min="1" required value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/10 transition-all"
                            placeholder="Qty *" />
                          <input type="number" step="0.01" required value={line.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/10 transition-all"
                            placeholder="RM Price *" />
                        </div>
                        {line.quantity > 0 && line.unitPrice > 0 && (
                          <p className="text-[10px] text-primary font-bold mt-1.5 text-right">Subtotal: RM{(line.quantity * line.unitPrice).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notes (Optional)</label>
                  <textarea value={poFormNotes} onChange={e => setPoFormNotes(e.target.value)} rows={2}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all resize-none"
                    placeholder="e.g. Urgent restock, preferred brand..." />
                </div>

                {/* Cost Preview */}
                {poFormTotal > 0 && (
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-600">Order Total ({poFormLines.filter(l => l.quantity > 0).length} items)</p>
                      <p className="text-lg font-extrabold text-primary">RM{poFormTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={handleClosePoModal}
                    className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
                  <button type="submit"
                    className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-lg hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <Package size={16} /> {editingPOId ? 'Save Draft' : 'Create PO (Draft)'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

      {/* ==================== TRANSACTION RECORDS TAB ==================== */}
      {dashTab === 'transactions' && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-manrope font-bold text-slate-900">Transaction & Activity Records</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 text-xs font-bold rounded hover:bg-slate-50 transition-colors shadow-sm">
              <Download size={14} />
              Export Log
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Date & Time</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Type</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Quantity</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Details (Route/User)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MOCK_TRANSACTIONS.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-5 text-sm font-semibold text-slate-700">{tx.date}</td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md ${
                        tx.type === 'STOCK_IN' ? 'bg-green-50 text-green-700' :
                        tx.type === 'TRANSFER' ? 'bg-blue-50 text-blue-700' :
                        tx.type === 'USAGE' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {tx.type === 'STOCK_IN' && <Package size={12} />}
                        {tx.type === 'TRANSFER' && <ArrowRightLeft size={12} />}
                        {tx.type === 'USAGE' && <MinusCircle size={12} />}
                        {tx.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-900">{tx.itemName}</td>
                    <td className="px-6 py-5">
                      <span className={`text-sm font-extrabold ${tx.type === 'STOCK_IN' ? 'text-green-600' : tx.type === 'USAGE' ? 'text-orange-600' : 'text-blue-600'}`}>
                        {tx.type === 'USAGE' ? '-' : '+'}{tx.quantity} {tx.unit}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col text-xs text-slate-500 leading-snug">
                        <span className="font-semibold">{tx.from} <ArrowRight className="inline mx-1 text-slate-300" size={10} /> {tx.to}</span>
                        <span>By: {tx.user}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {MOCK_TRANSACTIONS.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm italic">No recent transactions recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </AnimatePresence>

      {/* ==================== PRINT PO MODAL ==================== */}
      <AnimatePresence>
        {printPOId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPrintPOId(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col print:shadow-none print:w-full print:max-w-full print:max-h-full print:h-full print:m-0 print:rounded-none"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 print:hidden">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><FileCheck size={16}/> Purchase Order Outline</h3>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-1.5 focus:ring-2 focus:ring-primary/20">
                    <Download size={14} /> Save document as PDF
                  </button>
                  <button onClick={() => setPrintPOId(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-200"><Plus size={16} className="rotate-45" /></button>
                </div>
              </div>
              <div className="p-10 overflow-y-auto bg-white flex-1 min-h-0 print:p-0" id="print-area">
                {(() => {
                  const o = orders.find(x => x.id === printPOId);
                  if (!o) return null;
                  return (
                    <div className="max-w-xl mx-auto text-slate-800">
                      <div className="flex justify-between items-end border-b-2 border-slate-800 pb-6 mb-6">
                        <div>
                          <div className="flex items-center gap-2 text-primary font-bold mb-4">
                            <span className="w-8 h-8 rounded shrink-0 flex items-center justify-center overflow-hidden bg-primary text-white text-xs">
                              <img src="/logo.png" alt="Big Dental Clinic" className="w-full h-full object-cover bg-white" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                              <Hospital size={16} className="hidden" />
                            </span>
                            BIG DENTAL CLINIC
                          </div>
                          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-1">PURCHASE ORDER</h1>
                          <p className="text-sm font-bold text-slate-500 font-mono tracking-wider">{o.poNumber}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 space-y-1">
                          <p className="font-extrabold text-slate-800 text-sm mb-2">{o.supplier}</p>
                          <p><span className="font-semibold text-slate-700">Order Date:</span> {o.createdAt}</p>
                          <p><span className="font-semibold text-slate-700">Delivery:</span> {o.expectedDelivery ? new Date(o.expectedDelivery).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}</p>
                        </div>
                      </div>
                      <div className="pt-2">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b-2 border-slate-200">
                              <th className="py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Description</th>
                              <th className="py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Qty</th>
                              <th className="py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Rate (RM)</th>
                              <th className="py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Amount (RM)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {o.items.map((line, idx) => (
                              <tr key={idx}>
                                <td className="py-3">
                                  <p className="font-bold text-sm text-slate-900">{line.itemName}</p>
                                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{line.sku}</p>
                                </td>
                                <td className="py-3 text-center text-sm font-semibold">{line.quantity} <span className="text-[10px] text-slate-400 font-normal">{line.unit}</span></td>
                                <td className="py-3 text-right text-sm text-slate-600">{line.unitPrice.toFixed(2)}</td>
                                <td className="py-3 text-right text-sm font-bold text-slate-900">{(line.quantity * line.unitPrice).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-800 bg-slate-50/50 print:bg-transparent">
                              <td colSpan={3} className="py-4 text-right font-extrabold text-sm text-slate-700 uppercase tracking-wider pr-4">Total Amount</td>
                              <td className="py-4 text-right font-extrabold text-xl text-primary">RM{o.totalCost.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {o.notes && (
                        <div className="mt-8 pt-4 border-t border-slate-200 bg-slate-50/50 p-4 rounded-xl print:bg-transparent print:p-0 print:mt-10">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes / Instructions</p>
                          <p className="text-sm font-medium text-slate-700 leading-relaxed">{o.notes}</p>
                        </div>
                      )}
                      
                      <div className="mt-20 pt-8 border-t border-slate-200 flex justify-between align-end">
                        <div className="text-center">
                          <div className="w-48 border-b-2 border-slate-300 pb-2 mb-2"></div>
                          <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Authorized Signature</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== RECORD USAGE MODAL ==================== */}
      <AnimatePresence>
        {usageModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setUsageModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col print:hidden"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-teal-50/50">
                <h3 className="text-sm font-bold text-teal-800 flex items-center gap-2"><MinusCircle size={16} className="text-teal-600"/> Record Stock Usage</h3>
                <button type="button" onClick={() => setUsageModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg focus:outline-none"><Plus size={16} className="rotate-45" /></button>
              </div>
              <form onSubmit={handleRecordUsage} className="p-6 space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Item Consumed</label>
                  <select 
                    required
                    value={usageForm.itemId}
                    onChange={(e) => setUsageForm({...usageForm, itemId: e.target.value})}
                    className="w-full pl-3 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all"
                  >
                    <option value="" disabled>Select an item...</option>
                    {dashboardInventory.map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({item.total} {item.unit} available)</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Quantity Used</label>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={usageForm.quantity}
                      onChange={(e) => setUsageForm({...usageForm, quantity: parseInt(e.target.value) || 0})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Remarks / Patient Ref (Optional)</label>
                  <textarea 
                    value={usageForm.remarks}
                    onChange={(e) => setUsageForm({...usageForm, remarks: e.target.value})}
                    rows={2}
                    placeholder="e.g. For patient John Doe (Surgery)"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all resize-none"
                  ></textarea>
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setUsageModalOpen(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm shadow-sm">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/30 hover:opacity-90 transition-all text-sm">Save Usage</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}

// --- Audit Checklist View ---

function AuditChecklist({ onBack }: { onBack: () => void, key?: string }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);

  const auditItems = [
    { id: '1', name: 'Nitrile Gloves (Medium)', sku: 'BD-GLV-002', category: 'PPE', system: 24, unit: 'Boxes', icon: Package },
    { id: '2', name: 'Composite Resin (A2 Shade)', sku: 'BD-RES-045', category: 'Consumables', system: 12, unit: 'Syringes', icon: Stethoscope },
    { id: '3', name: 'Alginate Impression Material', sku: 'BD-ALG-011', category: 'Impression', system: 8, unit: 'Packs', icon: Pill },
    { id: '4', name: 'Sterile Gauze Pads (4x4)', sku: 'BD-GAU-089', category: 'Consumables', system: 50, unit: 'Units', icon: AlertCircle },
  ];

  const recordedCount = Object.values(counts).filter(v => v !== '').length;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-6xl mx-auto"
    >
      {/* Breadcrumbs & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div>
          <nav className="flex text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-2">
            <span>Inventory</span>
            <span className="mx-2 opacity-50">/</span>
            <span className="text-primary">Stock Audit</span>
          </nav>
          <button 
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:bg-primary/5 px-2 py-1 rounded transition-colors border border-primary/20 mb-4"
          >
            <ArrowLeft size={14} />
            Back to Master Inventory
          </button>
          <h1 className="text-4xl font-manrope font-extrabold text-slate-900 leading-tight">Audit Checklist</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-slate-500 text-sm">Bi-monthly stock verification for Big Dental Group.</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
              <CheckCircle2 size={12} className="mr-1" />
              Master Sheet Linked
            </span>
          </div>
        </div>

        <div className="w-full md:w-auto flex flex-col gap-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Select Branch</label>
          <div className="flex items-center gap-2">
            <select className="bg-white border border-slate-200 text-sm font-semibold text-slate-700 px-4 py-2.5 rounded-lg min-w-[200px] focus:ring-2 focus:ring-primary/10 transition-all">
              <option>Kepong Branch</option>
              <option>Jadehills Branch</option>
              <option>Setiawalk Branch</option>
            </select>
            <div className="relative flex items-center">
              <Calendar size={16} className="text-primary absolute left-3 pointer-events-none z-10" />
              <input 
                type="date"
                value={auditDate}
                onChange={e => setAuditDate(e.target.value)}
                className="bg-white pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Items</p>
          <p className="text-2xl font-bold font-manrope">142</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Completed</p>
          <p className="text-2xl font-bold font-manrope text-primary">{recordedCount}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Pending Check</p>
          <p className="text-2xl font-bold font-manrope">{142 - recordedCount}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Audit Status</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <p className="text-sm font-bold text-amber-600">In Progress</p>
          </div>
        </div>
      </div>

      {/* Checklist Table */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div className="flex gap-4">
            <button className="text-xs font-bold text-primary border-b-2 border-primary px-1">All Items</button>
            <button className="text-xs font-bold text-slate-400 hover:text-primary transition-colors px-1">Consumables</button>
            <button className="text-xs font-bold text-slate-400 hover:text-primary transition-colors px-1">Instruments</button>
            <button className="text-xs font-bold text-slate-400 hover:text-primary transition-colors px-1">PPE</button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">Sort by: <span className="text-slate-700 font-bold">A-Z</span></span>
            <Filter size={16} className="text-slate-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/30">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Details</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">System Stock</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-40">Physical Count</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {auditItems.map((item) => (
                <tr key={item.id} className="group hover:bg-slate-50/30 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors">
                        <item.icon size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.name}</p>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">SKU: {item.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">{item.category}</span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700">{item.system}</span>
                      <span className="text-[10px] font-medium text-slate-400 uppercase">{item.unit}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-2">
                      <input 
                        type="number" 
                        value={counts[item.id] || ''}
                        onChange={(e) => setCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className={`w-full bg-slate-50 border focus:ring-0 text-sm font-bold px-3 py-2 rounded transition-all outline-none ${counts[item.id] !== undefined && counts[item.id] !== '' && Number(counts[item.id]) !== item.system ? 'border-orange-300 ring-2 ring-orange-50 focus:border-orange-400 text-orange-700 bg-orange-50/30' : 'border-slate-100 focus:border-primary'}`} 
                        placeholder="0" 
                      />
                      {counts[item.id] !== undefined && counts[item.id] !== '' && Number(counts[item.id]) !== item.system && (
                        <input
                          type="text"
                          value={remarks[item.id] || ''}
                          onChange={(e) => setRemarks(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Why is it mismatched?"
                          title="Please provide a reason for this variance"
                          className="w-full bg-orange-50 border border-orange-200 text-orange-900 placeholder:text-orange-400/70 focus:border-orange-400 focus:ring-0 text-[10px] font-bold px-3 py-1.5 rounded transition-all outline-none animate-in fade-in slide-in-from-top-1"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <CheckCircle2 size={20} className={`transition-colors ${counts[item.id] ? 'text-primary' : 'text-slate-100'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Action */}
        <div className="p-8 bg-slate-50/50 border-t border-slate-100">
          <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
            <div className="flex-1 max-w-lg w-full">
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">Audit Notes (Optional)</label>
              <textarea 
                className="w-full bg-white border border-slate-200 focus:border-primary focus:ring-0 text-sm p-3 rounded-lg shadow-inner resize-none" 
                placeholder="Mention any damages or expired stock here..." 
                rows={2}
              ></textarea>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Current Submission</p>
                <p className="text-xl font-extrabold text-primary">{recordedCount} Items Recorded</p>
              </div>
              <button className="bg-gradient-to-b from-primary to-primary-container text-white px-8 py-4 rounded-xl font-bold flex flex-col items-center shadow-lg hover:shadow-primary/20 hover:scale-[1.02] transition-all active:scale-95">
                <div className="flex items-center gap-2">
                  <CloudUpload size={20} />
                  <span>Submit & Update Master Sheet</span>
                </div>
                <span className="text-[9px] uppercase tracking-widest opacity-80 mt-1">Syncing with Central Database</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-12 mb-8 text-center">
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">MedStock Precision © 2023 | Precision Stock Monitoring</p>
      </footer>
    </motion.div>
  );
}

// --- Settings View ---

function SettingsView({ mockUsers, setMockUsers }: { mockUsers: any[], setMockUsers: any }) {
  const [activeTab, setActiveTab] = useState<'profile' | 'clinic' | 'notifications' | 'security' | 'data' | 'users'>('profile');

  const [rolePermissions, setRolePermissions] = useState([
    { id: 1, name: 'View Master Inventory', admin: true, manager: true, staff: false },
    { id: 2, name: 'Perform Stock Audit', admin: true, manager: true, staff: true },
    { id: 3, name: 'Log Stock Usage', admin: true, manager: true, staff: true },
    { id: 4, name: 'Create Purchase Orders', admin: true, manager: true, staff: false },
    { id: 5, name: 'View Transaction Records', admin: true, manager: true, staff: false },
    { id: 6, name: 'Export Reports & Data', admin: true, manager: false, staff: false },
    { id: 7, name: 'Edit Item Catalog', admin: true, manager: false, staff: false },
    { id: 8, name: 'Approve Transfers', admin: true, manager: true, staff: false },
    { id: 9, name: 'Manage Users', admin: true, manager: false, staff: false },
    { id: 10, name: 'Modify System Settings', admin: true, manager: false, staff: false },
  ]);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'Staff', branch: 'All Branches', password: 'password123' });

  const handleAddUser = () => {
    setEditingUserId(null);
    setUserForm({ name: '', email: '', role: 'Staff', branch: 'All Branches', password: 'password123' });
    setUserModalOpen(true);
  };
  
  const handleEditUser = (user: any) => {
    setEditingUserId(user.id);
    setUserForm({ name: user.name, email: user.email, role: user.role, branch: user.branch, password: user.password || 'password123' });
    setUserModalOpen(true);
  };

  const handleDeleteUser = (id: number) => {
    if (window.confirm("Remove this user?")) {
      setMockUsers(mockUsers.filter(u => u.id !== id));
    }
  };

  const togglePermission = (id: number, role: 'admin' | 'manager' | 'staff') => {
    setRolePermissions(rolePermissions.map(p => 
      p.id === id ? { ...p, [role]: !p[role] } : p
    ));
  };

  const SettingSection = ({ title, description, children }: { title: string, description: string, children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/30">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{description}</p>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );

  const InputField = ({ label, icon: Icon, placeholder, type = "text", defaultValue = "" }: { label: string, icon: any, placeholder: string, type?: string, defaultValue?: string }) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{label}</label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">
          <Icon size={16} />
        </div>
        <input 
          type={type}
          defaultValue={defaultValue}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none"
          placeholder={placeholder}
        />
      </div>
    </div>
  );

  const handleDeleteAccount = async () => {
    if (window.confirm("Are you sure you want to delete your account? This action is permanent and will remove all your profile data.")) {
      try {
        const user = auth.currentUser;
        if (user) {
          await deleteUser(user);
          // The onAuthStateChanged listener will handle the UI update
        }
      } catch (err: any) {
        console.error("Delete account error:", err);
        if (err.code === 'auth/requires-recent-login') {
          alert("For security reasons, you must have recently signed in to delete your account. Please logout and sign in again before attempting to delete.");
        } else {
          alert("Failed to delete account: " + err.message);
        }
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="max-w-6xl mx-auto"
    >
      <div className="mb-10">
        <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <PartyPopper size={14} className="text-pink-500 animate-bounce" /> System Configuration
        </span>
        <h1 className="text-4xl font-manrope font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          Settings <Sparkles className="text-amber-400 animate-pulse" size={32} />
        </h1>
        <p className="text-slate-500 font-inter text-sm mt-2 flex items-center gap-1.5">
          Manage your account, clinic preferences, and make everything perfect! <Smile className="text-blue-400" size={16} />
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Settings Sidebar */}
        <aside className="w-full lg:w-64 shrink-0">
          <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0">
            {[
              { id: 'profile', label: 'My Profile', icon: User },
              { id: 'clinic', label: 'Clinic Details', icon: Hospital },
              { id: 'users', label: 'User Management', icon: Users },
              { id: 'notifications', label: 'Notifications', icon: Bell },
              { id: 'security', label: 'Security', icon: Shield },
              { id: 'data', label: 'Data & Export', icon: Database },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                    : 'text-slate-500 hover:bg-white hover:text-primary'
                }`}
              >
                <tab.icon size={18} />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Settings Content */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="Personal Information" description="Update your personal details and contact info">
                <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-2xl bg-slate-100 overflow-hidden border-4 border-white shadow-md">
                      <img src={auth.currentUser?.photoURL || "https://picsum.photos/seed/user123/200/200"} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                    <button className="absolute -bottom-2 -right-2 p-2 bg-white rounded-lg shadow-lg text-primary hover:scale-110 transition-transform border border-slate-100">
                      <CloudUpload size={16} />
                    </button>
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    <InputField label="Full Name" icon={User} placeholder="Enter your name" defaultValue={auth.currentUser?.displayName || "System Manager"} />
                    <InputField label="Job Title" icon={Stethoscope} placeholder="Enter your title" defaultValue="Clinic Administrator" />
                    <InputField label="Email Address" icon={Mail} placeholder="Enter your email" defaultValue={auth.currentUser?.email || "admin@bigdental.com"} />
                    <InputField label="Phone Number" icon={Phone} placeholder="Enter your phone" defaultValue="+60 12-345 6789" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button className="px-6 py-2.5 bg-primary text-white text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition-all active:scale-95">
                    Save Profile Changes
                  </button>
                </div>
              </SettingSection>

              <SettingSection title="Account Security" description="Manage your account status and security settings">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
                    <div>
                      <p className="text-sm font-bold text-red-900">Delete Account</p>
                      <p className="text-[10px] text-red-400">Permanently remove your account and all data</p>
                    </div>
                    <button 
                      onClick={handleDeleteAccount}
                      className="px-4 py-2 bg-tertiary text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow-sm hover:opacity-90 transition-all"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </SettingSection>

              <SettingSection title="Professional Preferences" description="Customize your workspace experience">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Dark Mode</p>
                      <p className="text-[10px] text-slate-400">Switch between light and dark themes</p>
                    </div>
                    <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Compact View</p>
                      <p className="text-[10px] text-slate-400">Show more items in tables with less padding</p>
                    </div>
                    <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                    </div>
                  </div>
                </div>
              </SettingSection>
            </motion.div>
          )}

          {activeTab === 'clinic' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="Organization Details" description="Manage your clinic's public information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <InputField label="Clinic Name" icon={Hospital} placeholder="Enter clinic name" defaultValue="BIG DENTAL CLINIC" />
                  <InputField label="Website URL" icon={Globe} placeholder="Enter website" defaultValue="https://bigdental.com" />
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Primary Address</label>
                    <div className="relative">
                      <div className="absolute left-3 top-3 text-slate-300">
                        <Map size={16} />
                      </div>
                      <textarea 
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none min-h-[100px] resize-none"
                        defaultValue="123, Jalan Dental, 43000 Kajang, Selangor, Malaysia"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button className="px-6 py-2.5 bg-primary text-white text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition-all active:scale-95">
                    Update Clinic Info
                  </button>
                </div>
              </SettingSection>

              <SettingSection title="Branch Management" description="Configure and manage clinic locations">
                <div className="space-y-3">
                  {['Main Branch'].map((branch) => (
                    <div key={branch} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-primary/20 transition-all group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                          <MapPin size={16} />
                        </div>
                        <span className="text-sm font-bold text-slate-700">{branch}</span>
                      </div>
                      <button className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">Manage</button>
                    </div>
                  ))}
                  <button className="w-full py-3 border-2 border-dashed border-slate-100 rounded-xl text-slate-400 text-xs font-bold uppercase tracking-widest hover:border-primary/30 hover:text-primary transition-all flex items-center justify-center gap-2">
                    <Plus size={16} />
                    Add New Branch
                  </button>
                </div>
              </SettingSection>
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="User Access Control" description="Manage branch-specific access and user roles">
                <div className="mb-6 flex justify-between items-center">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/10 transition-all" 
                      placeholder="Search users..." 
                    />
                  </div>
                  <button type="button" onClick={handleAddUser} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition-all active:scale-95">
                    <UserPlus size={14} />
                    Invite New User
                  </button>
                </div>

                <div className="space-y-3">
                  {mockUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-primary/20 transition-all group">
                      <div className="flex items-center gap-4">
                        <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover border-2 border-slate-50" />
                        <div>
                          <p className="text-sm font-bold text-slate-900">{user.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned Branch</p>
                          <p className="text-xs font-bold text-slate-700">{user.branch}</p>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</p>
                          <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            user.role === 'Admin' ? 'bg-primary/10 text-primary' : 
                            user.role === 'Branch Manager' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {user.role}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50/50 rounded-lg p-1 ml-4 border border-slate-100">
                          <button onClick={() => handleEditUser(user)} className="p-2 flex items-center justify-center text-slate-500 bg-white rounded shadow-sm hover:text-primary hover:border-primary/30 border border-slate-100 transition-all font-bold text-[10px]" title="Edit User"><Pencil size={14} className="mr-1"/> Edit</button>
                          <button onClick={() => handleDeleteUser(user.id)} className="p-2 flex items-center justify-center text-slate-500 bg-white rounded shadow-sm hover:text-red-500 hover:border-red-500/30 border border-slate-100 transition-all font-bold text-[10px]" title="Delete User"><Trash2 size={14} className="mr-1"/> Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SettingSection>

              <SettingSection title="Role Permissions" description="Define what each role can see and do">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-50">
                        <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Permission</th>
                        <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Admin</th>
                        <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Manager</th>
                        <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Staff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rolePermissions.map((perm) => (
                        <tr key={perm.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-2 text-xs font-medium text-slate-700">{perm.name}</td>
                          <td className="py-3 text-center cursor-pointer group" onClick={() => togglePermission(perm.id, 'admin')}>
                            <CheckCircle2 size={16} className={`mx-auto transition-transform group-active:scale-90 ${perm.admin ? 'text-primary' : 'text-slate-200'}`} />
                          </td>
                          <td className="py-3 text-center cursor-pointer group" onClick={() => togglePermission(perm.id, 'manager')}>
                            <CheckCircle2 size={16} className={`mx-auto transition-transform group-active:scale-90 ${perm.manager ? 'text-primary' : 'text-slate-200'}`} />
                          </td>
                          <td className="py-3 text-center cursor-pointer group" onClick={() => togglePermission(perm.id, 'staff')}>
                            <CheckCircle2 size={16} className={`mx-auto transition-transform group-active:scale-90 ${perm.staff ? 'text-primary' : 'text-slate-200'}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SettingSection>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="Inventory Alerts" description="Configure when and how you get notified">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="max-w-md">
                      <p className="text-sm font-bold text-slate-900">Low Stock Threshold</p>
                      <p className="text-[10px] text-slate-400">Notify me when an item falls below 20% of its capacity</p>
                    </div>
                    <input type="number" defaultValue="20" className="w-20 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold text-center" />
                  </div>
                  <div className="h-px bg-slate-50"></div>
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notification Channels</p>
                    {[
                      { label: 'Email Alerts', desc: 'Send daily stock summary to admin email' },
                      { label: 'In-App Notifications', desc: 'Show alerts in the dashboard bell icon' },
                      { label: 'SMS Critical Alerts', desc: 'Text manager for emergency stockouts' },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{item.label}</p>
                          <p className="text-[10px] text-slate-400">{item.desc}</p>
                        </div>
                        <div className={`w-12 h-6 ${idx < 2 ? 'bg-primary' : 'bg-slate-200'} rounded-full relative cursor-pointer`}>
                          <div className={`absolute ${idx < 2 ? 'right-1' : 'left-1'} top-1 w-4 h-4 bg-white rounded-full shadow-sm`}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SettingSection>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="Password & Authentication" description="Secure your account with strong credentials">
                <div className="grid grid-cols-1 gap-4 max-w-md">
                  <InputField label="Current Password" icon={Shield} type="password" placeholder="••••••••" />
                  <InputField label="New Password" icon={Shield} type="password" placeholder="••••••••" />
                  <InputField label="Confirm New Password" icon={Shield} type="password" placeholder="••••••••" />
                  <div className="pt-2">
                    <button className="w-full py-2.5 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-md hover:bg-slate-800 transition-all">
                      Update Password
                    </button>
                  </div>
                </div>
              </SettingSection>

              <SettingSection title="Access Control" description="Manage user roles and permissions">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                        <Shield size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-amber-900">Two-Factor Authentication</p>
                        <p className="text-[10px] text-amber-600">Add an extra layer of security to your account</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-amber-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-widest">Enable</button>
                  </div>
                </div>
              </SettingSection>
            </motion.div>
          )}

          {activeTab === 'data' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="Export & Backup" description="Download your inventory data for external use">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary/30 hover:bg-white transition-all group">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors mb-4 shadow-sm">
                      <Download size={24} />
                    </div>
                    <p className="text-sm font-bold text-slate-900">Export Master Sheet</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Download as .CSV</p>
                  </button>
                  <button className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary/30 hover:bg-white transition-all group">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors mb-4 shadow-sm">
                      <CloudUpload size={24} />
                    </div>
                    <p className="text-sm font-bold text-slate-900">Cloud Backup</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Sync to Secure Cloud</p>
                  </button>
                </div>
              </SettingSection>

              <SettingSection title="System Logs" description="Review system audit trails and changes">
                <div className="bg-slate-900 rounded-xl p-4 font-mono text-[10px] text-blue-400/80 space-y-1">
                  <p>[2023-10-25 09:30:12] INFO: Master sync completed successfully.</p>
                  <p>[2023-10-25 10:15:45] WARN: Low stock detected in Main Branch (SKU: IMP-400-T).</p>
                  <p>[2023-10-25 11:02:22] INFO: User 'admin' updated category 'Consumables'.</p>
                  <p className="text-slate-500 animate-pulse">_</p>
                </div>
              </SettingSection>
            </motion.div>
          )}
        </div>
      </div>

      <footer className="mt-12 mb-8 text-center">
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">BIGStock Precision © 2023 | Precision Stock Monitoring</p>
      </footer>

      {/* ==================== USER MODAL ==================== */}
      <AnimatePresence>
        {userModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setUserModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-indigo-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 text-indigo-900">
                  {editingUserId ? <><Smile size={18} className="text-blue-500 animate-bounce"/> Edit Teammate</> : <><Star size={18} className="text-amber-500 animate-pulse" fill="currentColor" /> Invite New Teammate</>}
                </h3>
                <button type="button" onClick={() => setUserModalOpen(false)} className="p-2 text-indigo-400 hover:text-indigo-600 transition-colors bg-white rounded-lg border border-indigo-100 shadow-sm"><Plus size={16} className="rotate-45" /></button>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (editingUserId) {
                  setMockUsers(mockUsers.map(u => u.id === editingUserId ? { ...u, name: userForm.name, email: userForm.email, role: userForm.role, branch: userForm.branch, password: userForm.password } : u));
                } else {
                  setMockUsers([{
                    id: Date.now(),
                    name: userForm.name,
                    role: userForm.role,
                    branch: userForm.branch,
                    email: userForm.email,
                    password: userForm.password,
                    avatar: `https://picsum.photos/seed/${Date.now()}/100/100`
                  }, ...mockUsers]);
                }
                setUserModalOpen(false);
              }} className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Full Name</label>
                  <input required value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all" placeholder="e.g. John Doe" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email Address</label>
                    <input required type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all" placeholder="name@bigdental.com" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Password</label>
                    <input required type="text" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all font-mono" placeholder="Set temporary password" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Assigned Branch</label>
                    <select value={userForm.branch} onChange={e => setUserForm({...userForm, branch: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all text-slate-700 font-semibold">
                      {['All Branches', 'Main Branch', 'Kepong Branch', 'Jadehills Branch', 'Puchong', 'Setiawalk Branch'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Role</label>
                    <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all text-slate-700 font-semibold">
                      {['Admin', 'Branch Manager', 'Staff'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setUserModalOpen(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-lg hover:opacity-90 transition-all text-sm">{editingUserId ? 'Save Changes' : 'Send Invite'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
