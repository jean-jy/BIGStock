import React, { useState } from 'react';
import { Hospital, Mail, Lock, LogIn, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';

export const LoginView = ({ onLoginError }: { onLoginError?: (msg: string) => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Try sign in first
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        throw error;
      }
      // Success — onAuthStateChange in App handles setting the user
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
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
