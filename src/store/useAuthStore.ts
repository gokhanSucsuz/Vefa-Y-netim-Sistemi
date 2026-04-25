import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SystemUser } from '../types';

interface AuthState {
  user: SystemUser | null;
  firebaseUser: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: SystemUser | null) => void;
  setFirebaseUser: (user: any | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      firebaseUser: null,
      isAuthenticated: false,
      isLoading: true,
      setAuth: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
      setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, isAuthenticated: false, firebaseUser: null }),
    }),
    {
      name: 'vefa-auth-storage',
      // We don't persist firebaseUser directly, just system user
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
