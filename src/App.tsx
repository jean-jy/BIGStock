/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import {
  Bell, HelpCircle, Hospital, MapPin, Sparkles,
  ArrowRightLeft, LogOut,
  Home, Package, BarChart3, GitBranch,
  MoreHorizontal, ChevronDown, X,
  Settings, DollarSign, ClipboardCheck
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from './supabase';

import type { View } from './types';
import { BRANCH_NAMES } from './types';

import { LoginView } from './components/LoginView';
import { SidebarItem } from './components/SidebarItem';
import { DashboardView } from './components/DashboardView';
import { MultiBranchView } from './components/MultiBranchView';
import { StockComparisonView } from './components/StockComparisonView';
import { InventoryView } from './components/InventoryView';
import { SettingsView } from './components/SettingsView';
import { AuditChecklist } from './components/AuditChecklist';
import { TransferModal } from './components/TransferModal';
import { FinancialsView } from './components/FinancialsView';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [activeBranch, setActiveBranch] = useState('Main Branch');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const initialized = useRef(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [mobileBranchOpen, setMobileBranchOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        setCurrentView('dashboard');
        initialized.current = false;
        setAuthLoading(false);
        return;
      }

      const u = {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.user_metadata?.full_name || session.user.email,
        role: session.user.user_metadata?.role || 'Staff',
        assignedBranch: 'Main Branch',
        photoURL: session.user.user_metadata?.avatar_url || ''
      };

      setUser(u);
      setAuthLoading(false);

      if (!initialized.current) {
        setActiveBranch(u.assignedBranch === 'All Branches' ? 'Main Branch' : u.assignedBranch);
        setCurrentView('dashboard');
        initialized.current = true;
      }

      supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile) {
            const fullName = profile.full_name || '';
            const match = fullName.match(/(.*) \[(.*)\]$/);
            const displayName = match ? match[1] : (profile.full_name || u.displayName);
            const displayRole = match ? match[2] : (profile.role || u.role);

            setUser((prev: any) => {
              if (!prev) return prev;
              const isOwner = prev.email === 'jiayingjean@gmail.com' || prev.email === 'jiayingchristine@gmail.com';
              if (isOwner && profile.role !== 'Admin') {
                supabase.from('profiles').update({ role: 'Admin', full_name: `${displayName} [Admin]` }).eq('id', session.user.id).then(() => console.log('Owner promoted to Admin'));
              }
              const resolvedBranch = profile.assigned_branch || prev.assignedBranch;
              // Set the active branch now that we have the real profile data
              if (!isOwner && resolvedBranch && resolvedBranch !== 'All Branches') {
                setActiveBranch(resolvedBranch);
              }
              return {
                ...prev,
                displayName: displayName,
                role: isOwner ? 'Admin' : displayRole,
                assignedBranch: resolvedBranch,
                photoURL: profile.avatar_url || prev.photoURL
              };
            });
          }
        });
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
    return <LoginView />;
  }

  const isAdmin = user?.role === 'Admin';
  const moreViewActive = ['settings', 'financials', 'audit-checklist'].includes(currentView);

  return (
    <div className="min-h-screen flex flex-col bg-surface relative">
      {darkMode && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{ background: 'radial-gradient(ellipse 90% 60% at 50% -5%, rgba(59,130,246,0.20) 0%, rgba(99,60,220,0.12) 45%, transparent 72%)' }}
        />
      )}

      {/* Top Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-4 md:px-8 py-3 md:py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4 md:gap-8">
          <span className="text-lg md:text-xl font-extrabold text-primary tracking-tighter flex items-center gap-1">
            BIGStock <Sparkles className="text-amber-400 animate-pulse" size={16} />
          </span>
          {/* Desktop nav */}
          <nav className="hidden md:flex gap-6 items-center">
            <button onClick={() => setCurrentView('dashboard')} className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${currentView === 'dashboard' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'}`}>Dashboard</button>
            {isAdmin && <button onClick={() => setCurrentView('multi-branch')} className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${currentView === 'multi-branch' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'}`}>Multi-Branch</button>}
            <button onClick={() => setCurrentView('stock-comparison')} className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${currentView === 'stock-comparison' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'}`}>Comparison</button>
            {isAdmin && <button onClick={() => setCurrentView('inventory')} className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${currentView === 'inventory' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'}`}>Inventory</button>}
            {isAdmin && <button onClick={() => setCurrentView('financials')} className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${currentView === 'financials' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'}`}>Financials</button>}
            {isAdmin && <button onClick={() => setCurrentView('settings')} className={`font-manrope font-bold text-sm tracking-tight pb-1 transition-all ${currentView === 'settings' ? 'text-primary border-b-2 border-primary-container' : 'text-slate-500 hover:text-primary'}`}>Settings</button>}
          </nav>
          {/* Mobile branch selector pill */}
          <button
            onClick={() => setMobileBranchOpen(true)}
            className="flex md:hidden items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-700 active:scale-95 transition-transform"
          >
            <MapPin size={11} />
            <span className="max-w-[100px] truncate">{activeBranch}</span>
            <ChevronDown size={11} />
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => alert('Notifications coming soon.')} className="p-2 text-slate-500 hover:text-primary transition-colors"><Bell size={20} /></button>
          <button onClick={() => alert('Help & Documentation coming soon.')} className="hidden md:block p-2 text-slate-500 hover:text-primary transition-colors"><HelpCircle size={20} /></button>
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900 leading-tight">{user.displayName}</p>
              <p className="text-[9px] font-bold text-primary uppercase tracking-widest">{user.role}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-200 overflow-hidden border-2 border-slate-100 shadow-sm">
              <img src={user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`} alt="User" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
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
            {isAdmin && (
              <>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-4">Headquarters</p>
                <SidebarItem icon={MapPin} label="Main Branch" active={activeBranch === 'Main Branch'} onClick={() => setActiveBranch('Main Branch')} />
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1 px-4">Branches</p>
              </>
            )}
            {!isAdmin && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-4">My Assigned Branch</p>}
            {BRANCH_NAMES.filter(branch => isAdmin || user?.assignedBranch === branch).map(branch => (
              <SidebarItem key={branch} icon={MapPin} label={branch} active={activeBranch === branch} onClick={() => setActiveBranch(branch)} />
            ))}
          </nav>

          <div className="mt-auto space-y-4">
            {isAdmin && (
              <button onClick={() => setIsTransferModalOpen(true)} className="w-full py-3 px-4 bg-primary-container text-white rounded-md font-manrope font-bold text-sm tracking-tight shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <ArrowRightLeft size={16} />
                Request Transfer
              </button>
            )}
            <div className="pt-4 border-t border-slate-200">
              <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 text-slate-500 text-xs font-semibold uppercase tracking-widest hover:text-tertiary transition-colors w-full">
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 p-4 md:p-6 lg:p-8 pb-24 lg:pb-8">
          <AnimatePresence mode="wait">
            {currentView === 'dashboard' ? (
              <DashboardView key={`dashboard-${activeBranch}`} onStartAudit={() => setCurrentView('audit-checklist')} activeBranch={activeBranch} user={user} />
            ) : currentView === 'multi-branch' ? (
              <MultiBranchView key="multi-branch" onOpenTransfer={() => setIsTransferModalOpen(true)} />
            ) : currentView === 'stock-comparison' ? (
              <StockComparisonView key="stock-comparison" />
            ) : currentView === 'inventory' ? (
              <InventoryView key={`inventory-${activeBranch}`} activeBranch={activeBranch} user={user} />
            ) : currentView === 'settings' ? (
              <SettingsView user={user} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(v => !v)} />
            ) : currentView === 'financials' ? (
              <FinancialsView key="financials" user={user} />
            ) : (
              <AuditChecklist key="audit" onBack={() => setCurrentView('dashboard')} user={user} />
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-100 safe-area-pb">
        <div className="flex items-center justify-around px-1 pt-2 pb-3">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[52px] transition-all ${currentView === 'dashboard' ? 'text-primary' : 'text-slate-400'}`}
          >
            <Home size={22} strokeWidth={currentView === 'dashboard' ? 2.5 : 1.8} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Home</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setCurrentView('multi-branch')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[52px] transition-all ${currentView === 'multi-branch' ? 'text-primary' : 'text-slate-400'}`}
            >
              <GitBranch size={22} strokeWidth={currentView === 'multi-branch' ? 2.5 : 1.8} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Branches</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setCurrentView('inventory')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[52px] transition-all ${currentView === 'inventory' ? 'text-primary' : 'text-slate-400'}`}
            >
              <Package size={22} strokeWidth={currentView === 'inventory' ? 2.5 : 1.8} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Inventory</span>
            </button>
          )}

          <button
            onClick={() => setCurrentView('stock-comparison')}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[52px] transition-all ${currentView === 'stock-comparison' ? 'text-primary' : 'text-slate-400'}`}
          >
            <BarChart3 size={22} strokeWidth={currentView === 'stock-comparison' ? 2.5 : 1.8} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Compare</span>
          </button>

          {!isAdmin && (
            <button
              onClick={() => setCurrentView('audit-checklist')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[52px] transition-all ${currentView === 'audit-checklist' ? 'text-primary' : 'text-slate-400'}`}
            >
              <ClipboardCheck size={22} strokeWidth={currentView === 'audit-checklist' ? 2.5 : 1.8} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Audit</span>
            </button>
          )}

          <button
            onClick={() => setMobileMoreOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[52px] transition-all ${moreViewActive ? 'text-primary' : 'text-slate-400'}`}
          >
            <MoreHorizontal size={22} strokeWidth={moreViewActive ? 2.5 : 1.8} />
            <span className="text-[9px] font-bold uppercase tracking-wider">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile Branch Selector Sheet */}
      <AnimatePresence>
        {mobileBranchOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileBranchOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl shadow-2xl p-6 pb-10"
            >
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-extrabold text-slate-900">Select Branch</h3>
                <button onClick={() => setMobileBranchOpen(false)} className="p-1.5 rounded-full bg-slate-100 text-slate-500"><X size={16} /></button>
              </div>
              <div className="space-y-2">
                {isAdmin && (
                  <button
                    onClick={() => { setActiveBranch('Main Branch'); setMobileBranchOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${activeBranch === 'Main Branch' ? 'bg-primary text-white' : 'bg-slate-50 text-slate-700'}`}
                  >
                    <MapPin size={16} />
                    Main Branch
                    {activeBranch === 'Main Branch' && <span className="ml-auto text-[10px] uppercase tracking-widest opacity-70">Active</span>}
                  </button>
                )}
                {BRANCH_NAMES.filter(b => isAdmin || user?.assignedBranch === b).map(branch => (
                  <button
                    key={branch}
                    onClick={() => { setActiveBranch(branch); setMobileBranchOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${activeBranch === branch ? 'bg-primary text-white' : 'bg-slate-50 text-slate-700'}`}
                  >
                    <MapPin size={16} />
                    {branch}
                    {activeBranch === branch && <span className="ml-auto text-[10px] uppercase tracking-widest opacity-70">Active</span>}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile More Sheet */}
      <AnimatePresence>
        {mobileMoreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileMoreOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl shadow-2xl p-6 pb-10"
            >
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-extrabold text-slate-900">More</h3>
                <button onClick={() => setMobileMoreOpen(false)} className="p-1.5 rounded-full bg-slate-100 text-slate-500"><X size={16} /></button>
              </div>
              <div className="space-y-2">
                {isAdmin && (
                  <button
                    onClick={() => { setCurrentView('audit-checklist'); setMobileMoreOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${currentView === 'audit-checklist' ? 'bg-primary/10 text-primary' : 'bg-slate-50 text-slate-700'}`}
                  >
                    <ClipboardCheck size={18} className="text-blue-500" />
                    Audit Checklist
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => { setCurrentView('financials'); setMobileMoreOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${currentView === 'financials' ? 'bg-primary/10 text-primary' : 'bg-slate-50 text-slate-700'}`}
                  >
                    <DollarSign size={18} className="text-green-500" />
                    Financials
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => { setIsTransferModalOpen(true); setMobileMoreOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm bg-slate-50 text-slate-700 transition-all"
                  >
                    <ArrowRightLeft size={18} className="text-violet-500" />
                    Request Transfer
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => { setCurrentView('settings'); setMobileMoreOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${currentView === 'settings' ? 'bg-primary/10 text-primary' : 'bg-slate-50 text-slate-700'}`}
                  >
                    <Settings size={18} className="text-slate-500" />
                    Settings
                  </button>
                )}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => { handleLogout(); setMobileMoreOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm bg-red-50 text-red-600 transition-all"
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
      />
    </div>
  );
}
