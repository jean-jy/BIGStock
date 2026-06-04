import React, { useState, useEffect } from 'react';
import {
  User, Shield, Globe, Database, Mail, Phone, Map,
  Users, Lock, UserPlus, Hospital, Bell, MapPin, Plus,
  Pencil, Trash2, Search, CloudUpload, Download,
  Sparkles, PartyPopper, Smile, Star, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, supabaseSecondary } from '../supabase';
import { USER_ROLES } from '../types';

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

const InputField = ({ label, icon: Icon, placeholder, type = "text", value = "", onChange }: { label: string, icon: any, placeholder: string, type?: string, value?: string, onChange?: (val: string) => void }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{label}</label>
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">
        <Icon size={16} />
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none"
        placeholder={placeholder}
      />
    </div>
  </div>
);

export function SettingsView({ user, darkMode = false, onToggleDarkMode }: { user: any; darkMode?: boolean; onToggleDarkMode?: () => void }) {
  const [activeTab, setActiveTab] = useState<'profile' | 'clinic' | 'notifications' | 'security' | 'data' | 'users' | 'suppliers' | 'schedules'>('profile');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', phone: '', email: '', lead_time_days: 7, notes: '' });
  const [auditSchedules, setAuditSchedules] = useState<any[]>([]);
  const [scheduleForm, setScheduleForm] = useState<Record<string, number>>({});
  const [profileUsers, setProfileUsers] = useState<any[]>([]);
  const [rolePermissions, setRolePermissions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [customRoles, setCustomRoles] = useState<string[]>(() => {
    const saved = localStorage.getItem('clinic_roles');
    return saved ? JSON.parse(saved) : ['Admin', 'Branch Manager', 'Staff'];
  });

  // Profile form
  const [profileForm, setProfileForm] = useState({ fullName: user?.displayName || '', title: 'Clinic Administrator', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await supabase.from('profiles').update({ full_name: `${profileForm.fullName} [${user?.role || 'Admin'}]` }).eq('id', user?.id);
      await supabase.auth.updateUser({ data: { full_name: profileForm.fullName } });
      alert('Profile updated successfully!');
    } catch (err: any) {
      alert('Failed to update profile: ' + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // Password form
  const [passwordForm, setPasswordForm] = useState({ newPass: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  const handleUpdatePassword = async () => {
    if (!passwordForm.newPass || passwordForm.newPass !== passwordForm.confirm) {
      alert(passwordForm.newPass ? 'Passwords do not match.' : 'Please enter a new password.');
      return;
    }
    if (passwordForm.newPass.length < 6) { alert('Password must be at least 6 characters.'); return; }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass });
      if (error) throw error;
      alert('Password updated successfully!');
      setPasswordForm({ newPass: '', confirm: '' });
    } catch (err: any) {
      alert('Failed to update password: ' + err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // Compact view toggle
  const [compactView, setCompactView] = useState(() => localStorage.getItem('compactView') === 'true');
  const handleToggleCompact = () => {
    const next = !compactView;
    setCompactView(next);
    localStorage.setItem('compactView', String(next));
  };

  // Export master sheet
  const handleExportMasterSheet = async () => {
    try {
      const { data, error } = await supabase.from('inventory').select('*').order('name');
      if (error) throw error;
      const headers = ['Name', 'SKU', 'Category', 'Type', 'Total', 'Unit', 'Price (RM)', 'Min Stock', 'Status'];
      const rows = (data || []).map(item => [item.name, item.sku, item.category, item.item_type || 'Stock', item.total, item.unit, (item.price || 0).toFixed(2), item.min_stock || 20, item.status]);
      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `inventory-master-${new Date().toISOString().split('T')[0]}.csv` });
      a.click();
    } catch (err: any) {
      alert('Export failed: ' + err.message);
    }
  };

  const saveRoles = (newRoles: string[]) => {
    setCustomRoles(newRoles);
    localStorage.setItem('clinic_roles', JSON.stringify(newRoles));
  };
  const [clinicInfo, setClinicInfo] = useState({ 
    name: 'BIG DENTAL CLINIC', 
    website: 'https://bigdental.com', 
    address: '123, Jalan Dental, 43000 Kajang, Selangor, Malaysia' 
  });
  const [loading, setLoading] = useState(true);

  const fetchSettingsData = async () => {
    setLoading(true);
    try {
      const [usersResult, permsResult, branchesResult, clinicResult] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('role_permissions').select('*').order('id'),
        supabase.from('branches').select('*').order('name'),
        supabase.from('clinic_info').select('*').single()
      ]);

      setProfileUsers((usersResult.data || []).map(u => {
        // Unpack "Smart Carry-Along" role if present: "Full Name [Custom Role]"
        const fullName = u.full_name || '';
        const match = fullName.match(/(.*) \[(.*)\]$/);
        const displayName = match ? match[1] : (u.full_name || u.email);
        const displayRole = match ? match[2] : u.role;

        return {
          id: u.id,
          name: displayName,
          email: u.email,
          role: displayRole,
          branch: u.assigned_branch || 'All Branches',
          avatar: u.avatar_url || `https://picsum.photos/seed/${u.id}/100/100`
        };
      }));

      setRolePermissions((permsResult.data || []).map(p => ({
        id: p.id,
        name: p.permission_name,
        admin: p.admin,
        manager: p.manager,
        staff: p.staff
      })));

      setBranches(branchesResult.data || []);
      if (clinicResult.data) {
        setClinicInfo({
          name: clinicResult.data.name,
          website: clinicResult.data.website,
          address: clinicResult.data.address
        });
      }
    } catch (err) {
      console.error('Error fetching settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data || []);
  };

  const fetchSchedules = async () => {
    const { data } = await supabase.from('audit_schedules').select('*');
    setAuditSchedules(data || []);
    const map: Record<string, number> = {};
    (data || []).forEach((s: any) => { map[s.branch_id] = s.frequency_days; });
    setScheduleForm(map);
  };

  useEffect(() => {
    fetchSettingsData();
    fetchSuppliers();
    fetchSchedules();
  }, []);

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: supplierForm.name,
      contact_person: supplierForm.contact_person,
      phone: supplierForm.phone,
      email: supplierForm.email,
      lead_time_days: supplierForm.lead_time_days,
      notes: supplierForm.notes,
    };
    let error;
    if (editingSupplier) {
      ({ error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id));
    } else {
      ({ error } = await supabase.from('suppliers').insert(payload));
    }
    if (error) { alert('Failed to save supplier: ' + error.message); return; }
    setSupplierModalOpen(false);
    setEditingSupplier(null);
    setSupplierForm({ name: '', contact_person: '', phone: '', email: '', lead_time_days: 7, notes: '' });
    fetchSuppliers();
  };

  const handleDeleteSupplier = async (id: string, name: string) => {
    if (!window.confirm(`Delete supplier "${name}"?`)) return;
    await supabase.from('suppliers').delete().eq('id', id);
    fetchSuppliers();
  };

  const handleSaveSchedule = async (branchId: string) => {
    const days = scheduleForm[branchId] || 14;
    const existing = auditSchedules.find((s: any) => s.branch_id === branchId);
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + days);
    if (existing) {
      await supabase.from('audit_schedules').update({ frequency_days: days, next_due_date: nextDue.toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('audit_schedules').insert({ branch_id: branchId, frequency_days: days, next_due_date: nextDue.toISOString().split('T')[0] });
    }
    fetchSchedules();
  };

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'Staff', branch: 'All Branches', password: '' });

  const handleAddUser = () => {
    setEditingUserId(null);
    setUserForm({ name: '', email: '', role: 'Staff', branch: 'All Branches', password: '' });
    setUserModalOpen(true);
  };

  const handleEditUser = (user: any) => {
    setEditingUserId(user.id);
    setUserForm({ name: user.name, email: user.email, role: user.role, branch: user.branch, password: '' });
    setUserModalOpen(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm("Remove this user?")) {
      try {
        await supabase.from('profiles').delete().eq('id', id);
        fetchSettingsData();
      } catch (err) {
        console.error('Error deleting user:', err);
      }
    }
  };

  const togglePermission = async (id: string, role: string) => {
    const perm = rolePermissions.find(p => p.id === id);
    if (!perm) return;
    
    // Convert Role name to lowercase column name for DB (e.g. 'Branch Manager' -> 'manager')
    const dbColumn = role.toLowerCase().includes('admin') ? 'admin' : role.toLowerCase().includes('manager') ? 'manager' : 'staff';
    
    const newValue = !perm[dbColumn];
    setRolePermissions(rolePermissions.map(p =>
      p.id === id ? { ...p, [dbColumn]: newValue } : p
    ));
    try {
      await supabase.from('role_permissions').update({ [dbColumn]: newValue }).eq('id', id);
    } catch (err) {
      console.error('Error updating permission:', err);
    }
  };

  const handleUpdateClinicInfo = async () => {
    try {
      // First, find the first available record ID
      const { data: currentInfo } = await supabase.from('clinic_info').select('id').limit(1).single();
      const targetId = currentInfo?.id || 1;

      const { error } = await supabase.from('clinic_info').update({
        name: clinicInfo.name,
        website: clinicInfo.website,
        address: clinicInfo.address,
        updated_at: new Date().toISOString()
      }).eq('id', targetId);
      
      if (error) throw error;
      alert('Clinic information updated successfully! 🏥');
    } catch (err: any) {
      console.error('Error updating clinic info:', err);
      alert('Failed to update clinic info: ' + err.message);
    }
  };

  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [branchForm, setBranchForm] = useState({ name: '', location: '', address: '', manager: '' });

  const handleEditBranch = (branch: any) => {
    setEditingBranch(branch);
    setBranchForm({ name: branch.name, location: branch.location || '', address: branch.address || '', manager: branch.manager || '' });
    setBranchModalOpen(true);
  };

  const handleDeleteAccount = async () => {
    if (window.confirm("Are you sure you want to delete your account? This action is permanent and will remove all your profile data.")) {
      try {
        if (user) {
          await supabase.auth.signOut();
          alert("Account deletion request submitted. You have been signed out.");
        }
      } catch (err: any) {
        console.error("Delete account error:", err);
        alert("Failed to delete account: " + err.message);
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
              { id: 'suppliers', label: 'Suppliers', icon: Globe },
              { id: 'schedules', label: 'Audit Schedule', icon: Bell },
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
                      <img src={user?.user_metadata?.avatar_url || user?.photoURL || "https://picsum.photos/seed/user123/200/200"} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                    <button className="absolute -bottom-2 -right-2 p-2 bg-white rounded-lg shadow-lg text-primary hover:scale-110 transition-transform border border-slate-100">
                      <CloudUpload size={16} />
                    </button>
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    <InputField label="Full Name" icon={User} placeholder="Enter your name" value={profileForm.fullName} onChange={v => setProfileForm(f => ({ ...f, fullName: v }))} />
                    <InputField label="Job Title" icon={Shield} placeholder="Enter your title" value={profileForm.title} onChange={v => setProfileForm(f => ({ ...f, title: v }))} />
                    <InputField label="Email Address" icon={Mail} placeholder="Enter your email" value={user?.email || ''} />
                    <InputField label="Phone Number" icon={Phone} placeholder="Enter your phone" value={profileForm.phone} onChange={v => setProfileForm(f => ({ ...f, phone: v }))} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleSaveProfile} disabled={savingProfile} className="px-6 py-2.5 bg-primary text-white text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-50">
                    {savingProfile ? 'Saving...' : 'Save Profile Changes'}
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
                    <div onClick={onToggleDarkMode} className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${darkMode ? 'bg-primary' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${darkMode ? 'right-1' : 'left-1'}`}></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Compact View</p>
                      <p className="text-[10px] text-slate-400">Show more items in tables with less padding</p>
                    </div>
                    <div onClick={handleToggleCompact} className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${compactView ? 'bg-primary' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${compactView ? 'right-1' : 'left-1'}`}></div>
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
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Clinic Name</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">
                        <Hospital size={16} />
                      </div>
                      <input
                        type="text"
                        value={clinicInfo.name}
                        onChange={(e) => setClinicInfo({ ...clinicInfo, name: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none"
                        placeholder="Enter clinic name"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Website URL</label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">
                        <Globe size={16} />
                      </div>
                      <input
                        type="text"
                        value={clinicInfo.website}
                        onChange={(e) => setClinicInfo({ ...clinicInfo, website: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none"
                        placeholder="Enter website URL"
                      />
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Primary Address (Headquarters)</label>
                    <div className="relative">
                      <div className="absolute left-3 top-3 text-slate-300">
                        <Map size={16} />
                      </div>
                      <textarea
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none min-h-[100px] resize-none"
                        value={clinicInfo.address}
                        onChange={(e) => setClinicInfo({ ...clinicInfo, address: e.target.value })}
                        placeholder="Enter headquarters address"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={handleUpdateClinicInfo}
                    className="px-6 py-2.5 bg-primary text-white text-xs font-bold rounded-lg shadow-md hover:opacity-90 transition-all active:scale-95"
                  >
                    Update Clinic Info
                  </button>
                </div>
              </SettingSection>

              <SettingSection title="Branch Management" description="Configure and manage clinic locations">
                <div className="space-y-3">
                  {branches.map((branch) => (
                    <div key={branch.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-primary/20 transition-all group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">{branch.name}</p>
                          <p className="text-[9px] text-slate-400">{branch.address || 'No address set'}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleEditBranch(branch)}
                        className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline"
                      >
                        Manage
                      </button>
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
                  {profileUsers.map((user) => (
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

              <SettingSection title="Role Configuration" description="Manage and customize system access roles">
                <div className="flex flex-wrap gap-3 mb-6">
                  {customRoles.map(role => (
                    <div key={role} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-primary/30 transition-all group">
                      <div className="flex flex-col">
                        <span className="text-xs font-extrabold text-slate-800">{role}</span>
                        <p className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">
                          {['Admin', 'Branch Manager', 'Staff'].includes(role) ? 'System Role' : 'Custom Role'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            const newName = window.prompt(`Rename role "${role}" to:`, role);
                            if (newName && newName !== role && !customRoles.includes(newName)) {
                              const updated = customRoles.map(r => r === role ? newName : r);
                              saveRoles(updated);
                              
                              // Persist the change to the database for ALL users with this role
                              const baseRole = newName.toLowerCase().includes('admin') ? 'Admin' : 
                                              (newName.toLowerCase().includes('manager') || newName.toLowerCase().includes('user') || newName.toLowerCase().includes('branch')) ? 'Branch Manager' : 
                                              'Staff';
                              
                              const oldBaseRole = role.toLowerCase().includes('admin') ? 'Admin' : 
                                                 (role.toLowerCase().includes('manager') || role.toLowerCase().includes('branch')) ? 'Branch Manager' : 
                                                 'Staff';

                              // Update local state first for instant feedback
                              setProfileUsers(profileUsers.map(u => u.role === role ? { ...u, role: newName } : u));

                              // Update database for ALL users with this role


                              profileUsers.forEach(async (u) => {
                                if (u.role === role) {
                                  const taggedName = `${u.name} [${newName}]`;
                                  await supabase.from('profiles').update({ 
                                    role: baseRole,
                                    full_name: taggedName
                                  }).eq('id', u.id);
                                }
                              });
                              setTimeout(() => fetchSettingsData(), 1000);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-primary transition-colors"
                          title="Rename Role"
                        >
                          <Pencil size={12} />
                        </button>
                        <button 
                          onClick={() => {
                            const count = profileUsers.filter(u => u.role === role).length;
                            if (count > 0) {
                              if (!window.confirm(`Warning: There are ${count} users assigned to the "${role}" role. Deleting this role will leave them without specified access. Proceed?`)) return;
                            } else if (!window.confirm(`Delete the "${role}" role?`)) return;
                            
                            const updated = customRoles.filter(r => r !== role);
                            saveRoles(updated);
                          }}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          title="Delete Role"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      const name = window.prompt("Enter new role name:");
                      if (name && !customRoles.includes(name)) {
                        saveRoles([...customRoles, name]);
                      }
                    }}
                    className="px-4 py-2 border-2 border-dashed border-slate-100 text-slate-400 text-[10px] font-bold uppercase rounded-xl hover:border-primary/40 hover:text-primary transition-all flex items-center gap-2 bg-slate-50/30"
                  >
                    <Plus size={14} />
                    Create New Role
                  </button>
                </div>
              </SettingSection>

              <SettingSection title="Role Permissions" description="Define what each role can see and do">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-50">
                        <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Permission</th>
                        {customRoles.map(role => (
                          <th key={role} className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">{role}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rolePermissions.map((perm) => (
                        <tr key={perm.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-2 text-xs font-medium text-slate-700">{perm.name}</td>
                          {customRoles.map(role => {
                            const dbCol = role.toLowerCase().includes('admin') ? 'admin' : role.toLowerCase().includes('manager') ? 'manager' : 'staff';
                            return (
                              <td key={role} className="py-3 text-center cursor-pointer group" onClick={() => togglePermission(perm.id, role)}>
                                <CheckCircle2 size={16} className={`mx-auto transition-transform group-active:scale-90 ${perm[dbCol] ? 'text-primary' : 'text-slate-200'}`} />
                              </td>
                            );
                          })}
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
                  <InputField label="New Password" icon={Shield} type="password" placeholder="••••••••" value={passwordForm.newPass} onChange={v => setPasswordForm(f => ({ ...f, newPass: v }))} />
                  <InputField label="Confirm New Password" icon={Shield} type="password" placeholder="••••••••" value={passwordForm.confirm} onChange={v => setPasswordForm(f => ({ ...f, confirm: v }))} />
                  <div className="pt-2">
                    <button onClick={handleUpdatePassword} disabled={savingPassword} className="w-full py-2.5 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-md hover:bg-slate-800 transition-all disabled:opacity-50">
                      {savingPassword ? 'Updating...' : 'Update Password'}
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
                    <button onClick={() => alert('Two-Factor Authentication coming soon.')} className="px-4 py-2 bg-amber-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-widest">Enable</button>
                  </div>
                </div>
              </SettingSection>
            </motion.div>
          )}

          {activeTab === 'suppliers' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="Supplier Directory" description="Manage vendor contacts, lead times and notes">
                <div className="flex justify-end mb-4">
                  <button onClick={() => { setEditingSupplier(null); setSupplierForm({ name: '', contact_person: '', phone: '', email: '', lead_time_days: 7, notes: '' }); setSupplierModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all">
                    <Plus size={16} /> Add Supplier
                  </button>
                </div>
                {suppliers.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">No suppliers yet. Add your first supplier.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {suppliers.map(s => (
                      <div key={s.name} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-extrabold text-slate-900">{s.name}</p>
                            {s.contact_person && <p className="text-[10px] text-slate-500">{s.contact_person}</p>}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingSupplier(s); setSupplierForm({ name: s.name, contact_person: s.contact_person || '', phone: s.phone || '', email: s.email || '', lead_time_days: s.lead_time_days || 7, notes: s.notes || '' }); setSupplierModalOpen(true); }}
                              className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-white transition-all"><Pencil size={13} /></button>
                            <button onClick={() => handleDeleteSupplier(s.id, s.name)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white transition-all"><Trash2 size={13} /></button>
                          </div>
                        </div>
                        <div className="space-y-1 text-[11px] text-slate-500">
                          {s.phone && <p className="flex items-center gap-1.5"><Phone size={10} className="text-slate-300" />{s.phone}</p>}
                          {s.email && <p className="flex items-center gap-1.5"><Mail size={10} className="text-slate-300" />{s.email}</p>}
                          <p className="flex items-center gap-1.5"><span className="text-slate-300 font-bold">⏱</span>Lead time: <span className="font-bold text-slate-700">{s.lead_time_days || 7} days</span></p>
                          {s.notes && <p className="text-slate-400 italic mt-1">"{s.notes}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SettingSection>
            </motion.div>
          )}

          {activeTab === 'schedules' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="Audit Schedule" description="Set how often each branch should conduct stock audits">
                <div className="space-y-4">
                  {branches.map(b => {
                    const schedule = auditSchedules.find((s: any) => s.branch_id === b.id);
                    const nextDue = schedule?.next_due_date ? new Date(schedule.next_due_date) : null;
                    const isOverdue = nextDue && nextDue < new Date();
                    return (
                      <div key={b.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl gap-4">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{b.name || b.id}</p>
                          {nextDue ? (
                            <p className={`text-[10px] font-semibold mt-0.5 ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                              {isOverdue ? '⚠ Overdue — was due' : 'Next due:'} {nextDue.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          ) : <p className="text-[10px] text-slate-400">No schedule set</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <input type="number" min={1} max={365}
                            value={scheduleForm[b.id] ?? 14}
                            onChange={e => setScheduleForm(prev => ({ ...prev, [b.id]: parseInt(e.target.value) || 14 }))}
                            className="w-16 text-center bg-white border border-slate-200 rounded-lg text-sm font-bold py-1.5 focus:ring-2 focus:ring-primary/10" />
                          <span className="text-[10px] text-slate-400 font-semibold">days</span>
                          <button onClick={() => handleSaveSchedule(b.id)}
                            className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:opacity-90 transition-all">
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SettingSection>
            </motion.div>
          )}

          {activeTab === 'data' && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <SettingSection title="Export & Backup" description="Download your inventory data for external use">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={handleExportMasterSheet} className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary/30 hover:bg-white transition-all group">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors mb-4 shadow-sm">
                      <Download size={24} />
                    </div>
                    <p className="text-sm font-bold text-slate-900">Export Master Sheet</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Download as .CSV</p>
                  </button>
                  <button onClick={() => alert('Cloud Backup coming soon.')} className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary/30 hover:bg-white transition-all group">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors mb-4 shadow-sm">
                      <CloudUpload size={24} />
                    </div>
                    <p className="text-sm font-bold text-slate-900">Cloud Backup</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Coming Soon</p>
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

      {/* ==================== SUPPLIER MODAL ==================== */}
      <AnimatePresence>
        {supplierModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSupplierModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden z-10">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800">{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
                <button onClick={() => setSupplierModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><Plus size={16} className="rotate-45" /></button>
              </div>
              <form onSubmit={handleSaveSupplier} className="p-5 space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Supplier Name *</label>
                  <input required value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/10" placeholder="e.g. MedSupply Sdn Bhd" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Contact Person</label>
                  <input value={supplierForm.contact_person} onChange={e => setSupplierForm(f => ({ ...f, contact_person: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/10" placeholder="e.g. Ahmad bin Ali" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Phone</label>
                    <input value={supplierForm.phone} onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/10" placeholder="+60 12-345 6789" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email</label>
                    <input type="email" value={supplierForm.email} onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/10" placeholder="orders@supplier.com" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Lead Time (days)</label>
                  <input type="number" min={1} value={supplierForm.lead_time_days} onChange={e => setSupplierForm(f => ({ ...f, lead_time_days: parseInt(e.target.value) || 7 }))}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/10" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notes</label>
                  <textarea value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/10 resize-none" placeholder="Payment terms, preferred contact method..." />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setSupplierModalOpen(false)} className="flex-1 py-2.5 border border-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50">Cancel</button>
                  <button type="submit" className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90">{editingSupplier ? 'Save Changes' : 'Add Supplier'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (editingUserId) {
                    const baseRole = userForm.role.toLowerCase().includes('admin') ? 'Admin' : 
                                    (userForm.role.toLowerCase().includes('manager') || userForm.role.toLowerCase().includes('user') || userForm.role.toLowerCase().includes('branch')) ? 'Branch Manager' : 
                                    'Staff';

                    const taggedName = `${userForm.name} [${userForm.role}]`;
                    let error;
                    // Attempt 1: Branch Manager
                    ({ error } = await supabase.from('profiles').update({
                      full_name: taggedName,
                      email: userForm.email,
                      role: baseRole,
                      assigned_branch: userForm.branch,
                    }).eq('id', editingUserId));
                    
                    if (error && error.message.includes('check constraint')) {
                       // Attempt 2: Manager
                       const fallbackRole = baseRole === 'Branch Manager' ? 'Manager' : 'Staff';
                       ({ error } = await supabase.from('profiles').update({
                         full_name: taggedName,
                         email: userForm.email,
                         role: fallbackRole,
                         assigned_branch: userForm.branch,
                       }).eq('id', editingUserId));

                       // Attempt 3: Ultimate Fallback to Staff
                       if (error && error.message.includes('check constraint')) {
                         ({ error } = await supabase.from('profiles').update({
                           full_name: taggedName,
                           email: userForm.email,
                           role: 'Staff',
                           assigned_branch: userForm.branch,
                         }).eq('id', editingUserId));
                       }
                    }
                    
                    if (error) throw error;

                    // Update password via edge function if provided
                    if (userForm.password) {
                      const { data: { session } } = await supabase.auth.getSession();
                      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-password`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session?.access_token}`,
                        },
                        body: JSON.stringify({ userId: editingUserId, newPassword: userForm.password }),
                      });
                      const result = await res.json();
                      if (!res.ok) throw new Error(result.error || 'Failed to update password');
                    }

                    alert('User profile updated successfully! 🎉');
                  } else {
                    const baseRole = userForm.role.toLowerCase().includes('admin') ? 'Admin' : 
                                    (userForm.role.toLowerCase().includes('manager') || userForm.role.toLowerCase().includes('user') || userForm.role.toLowerCase().includes('branch')) ? 'Branch Manager' : 
                                    'Staff';

                    const { data, error } = await supabaseSecondary.auth.signUp({
                      email: userForm.email,
                      password: userForm.password,
                      options: { 
                        data: { 
                          full_name: userForm.name, 
                          role: baseRole,
                          assigned_branch: userForm.branch
                        } 
                      }
                    });
                    
                    if (error) throw error;
                    
                    if (data.user) {
                      // Small delay to allow trigger to create the profile row
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      
                      const taggedName = `${userForm.name} [${userForm.role}]`;
                      const { error: profileError } = await supabase.from('profiles').upsert({
                        id: data.user.id,
                        full_name: taggedName,
                        email: userForm.email,
                        role: baseRole,
                        assigned_branch: userForm.branch,
                        avatar_url: `https://picsum.photos/seed/${data.user.id}/100/100`
                      });
                      
                      if (profileError) {
                        console.error('Profile Upsert Error:', profileError);
                        // If it fails because of role, try one more time with 'Staff' as ultimate fallback
                        await supabase.from('profiles').upsert({
                          id: data.user.id,
                          full_name: userForm.name,
                          email: userForm.email,
                          role: 'Staff',
                          assigned_branch: userForm.branch
                        });
                      }
                      
                      alert('Invitation sent! The new user has been added.');
                    }
                  }
                  fetchSettingsData();
                } catch (err: any) {
                  console.error('Error saving user:', err);
                  alert('Failed to save user: ' + err.message);
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Password {editingUserId && '(Leave blank to keep current)'}</label>
                    <input 
                      required={!editingUserId} 
                      type="text" 
                      value={userForm.password} 
                      onChange={e => setUserForm({...userForm, password: e.target.value})} 
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all font-mono" 
                      placeholder={editingUserId ? "Optional: Set new password" : "Set temporary password"} 
                    />
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
                      {customRoles.map(r => <option key={r} value={r}>{r}</option>)}
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

      {/* ==================== BRANCH MODAL ==================== */}
      <AnimatePresence>
        {branchModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setBranchModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <MapPin size={18} className="text-primary"/> Manage Branch: {editingBranch?.name}
                </h3>
                <button type="button" onClick={() => setBranchModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-lg border border-slate-100"><Plus size={16} className="rotate-45" /></button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await supabase.from('branches').update({
                    name: branchForm.name,
                    location: branchForm.location,
                    address: branchForm.address,
                    manager: branchForm.manager
                  }).eq('id', editingBranch.id);
                  fetchSettingsData();
                  setBranchModalOpen(false);
                  alert('Branch updated!');
                } catch (err: any) {
                  console.error('Error saving branch:', err);
                  alert('Failed to save branch: ' + err.message);
                }
              }} className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Branch Name</label>
                  <input required value={branchForm.name} onChange={e => setBranchForm({...branchForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Full Mailing Address</label>
                  <textarea 
                    required 
                    value={branchForm.address} 
                    onChange={e => setBranchForm({...branchForm, address: e.target.value})} 
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all min-h-[80px] font-semibold"
                    placeholder="e.g. 123, Jalan Kepong, 52100 Kuala Lumpur"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Manager In Charge</label>
                    <input value={branchForm.manager} onChange={e => setBranchForm({...branchForm, manager: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Building/Area</label>
                    <input value={branchForm.location} onChange={e => setBranchForm({...branchForm, location: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 transition-all" />
                  </div>
                </div>
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setBranchModalOpen(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-lg hover:opacity-90 transition-all text-sm">Save Branch Details</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
