import React, { useState } from 'react';
import {
  User, Shield, Globe, Database, Mail, Phone, Map,
  Users, Lock, UserPlus, Hospital, Bell, MapPin, Plus,
  Pencil, Trash2, Search, CloudUpload, Download,
  Sparkles, PartyPopper, Smile, Star, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabase';

export function SettingsView({ mockUsers, setMockUsers, user }: { mockUsers: any[], setMockUsers: any, user: any }) {
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
                    <InputField label="Full Name" icon={User} placeholder="Enter your name" defaultValue={user?.user_metadata?.full_name || user?.displayName || "System Manager"} />
                    <InputField label="Job Title" icon={Shield} placeholder="Enter your title" defaultValue="Clinic Administrator" />
                    <InputField label="Email Address" icon={Mail} placeholder="Enter your email" defaultValue={user?.email || "admin@bigdental.com"} />
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
