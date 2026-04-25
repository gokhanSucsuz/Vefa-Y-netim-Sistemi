import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

export function useAuth() {
  const { user, firebaseUser, isAuthenticated, isLoading, setAuth, setFirebaseUser, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentFirebaseUser) => {
      setFirebaseUser(currentFirebaseUser);
      if (!currentFirebaseUser) {
        // If firebase logged out, clear system user too
        logout();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setFirebaseUser, logout, setLoading]);

  return {
    user,
    firebaseUser,
    isAuthenticated,
    isLoading,
    login: setAuth,
    logout
  };
}
