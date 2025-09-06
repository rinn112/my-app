// context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{error?: string}>;
  signUp: (email: string, password: string) => Promise<{error?: string}>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{error?: string}>;
};

const AuthContext = createContext<AuthContextType>({} as any);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message };
  };
  const signOut = async () => { await supabase.auth.signOut(); };
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'fukuapp://reset',
    });
    return { error: error?.message };
  };

  return <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut, resetPassword }}>
    {children}
  </AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
