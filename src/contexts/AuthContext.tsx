import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  adminEmail: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  useEffect(() => {
    // Check localStorage for existing session
    const storedAuth = localStorage.getItem('cft_auth');
    if (storedAuth) {
      const { email } = JSON.parse(storedAuth);
      setIsAuthenticated(true);
      setAdminEmail(email);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Mock authentication - in production, this would call Supabase
    // For demo: any email with password "admin123" works
    if (password === 'admin123' && email.includes('@')) {
      localStorage.setItem('cft_auth', JSON.stringify({ email }));
      setIsAuthenticated(true);
      setAdminEmail(email);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('cft_auth');
    setIsAuthenticated(false);
    setAdminEmail(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, adminEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
