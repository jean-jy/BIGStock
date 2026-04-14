/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  Bell, HelpCircle, Hospital, MapPin, Sparkles,
  ArrowRightLeft, LogOut
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
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

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [activeBranch, setActiveBranch] = useState('Main Branch');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
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
      if (event === 'SIGNED_IN') {
        setCurrentView('dashboard');
        setActiveBranch(u.assignedBranch === 'All Branches' ? 'Main Branch' : u.assignedBranch);
      }
      setAuthLoading(false);

      supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile) {
            const fullName = profile.full_name || '';
            const match = fullName.match(/(.*) \[(.*)\]$/);
            const displayName = match ? match[1] : (profile.full_name || prev.displayName);
            const displayRole = match ? match[2] : (profile.role || prev.role);

            setUser((prev: any) => {
              if (!prev) return prev;
              
              const isOwner = prev.email === 'jiayingjean@gmail.com' || prev.email === 'jiayingchristine@gmail.com';
              // Force database update to secure Admin role permanently
              if (isOwner && profile.role !== 'Admin') {
                supabase.from('profiles').update({ role: 'Admin', full_name: `${displayName} [Admin]` }).eq('id', session.user.id).then(() => console.log('Owner promoted to Admin'));
              }

              return {
                ...prev,
                displayName: displayName,
                role: isOwner ? 'Admin' : displayRole,
                assignedBranch: profile.assigned_branch || prev.assignedBranch,
                photoURL: profile.avatar_url || prev.photoURL
              };
            });
          }
        }, () => {});
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
          <div className="relative">
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
              <SettingsView user={user} />
            ) : (
              <AuditChecklist key="audit" onBack={() => setCurrentView('dashboard')} />
            )}
          </AnimatePresence>
        </main>
      </div>

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
      />
    </div>
  );
}
