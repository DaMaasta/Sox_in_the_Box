import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setToken, clearToken, isLoggedIn } from '../config/api';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, refreshUser: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUser() {
    if (!isLoggedIn()) { setLoading(false); return; }
    try {
      const data = await api.get<{ userId: string; email: string; displayName: string; photoURL: string }>('/auth/me');
      setUser({ uid: data.userId, email: data.email, displayName: data.displayName, photoURL: data.photoURL ?? '' });
    } catch {
      clearToken();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUser(); }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { setToken };
