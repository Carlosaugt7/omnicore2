import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

// Compartilhamento hardcoded temporário (Andressa acessando dados do Carlos)
const SHARED_ACCESS: Record<string, string> = {
  'andressanramos@hotmail.com': 'd9919cb5-c4a4-43c3-8614-878495d18c37',
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  originalUserId: string | undefined;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  originalUserId: undefined,
});

export const useAuth = () => {
  return useContext(AuthContext);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Stable modified user — only recomputed when the raw user changes
  const modifiedUser = useMemo(() => {
    if (!user) return null;
    const overrideId = user.email ? SHARED_ACCESS[user.email] : undefined;
    if (overrideId) {
      return { ...user, id: overrideId };
    }
    return user;
  }, [user]);

  const originalUserId = user?.id;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: modifiedUser, session, loading, signOut, originalUserId }}>
      {children}
    </AuthContext.Provider>
  );
}
