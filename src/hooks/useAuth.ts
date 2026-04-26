import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

export function useAuth() {
  const { user, firebaseUser, isAuthenticated, isLoading, setAuth, setFirebaseUser, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentFirebaseUser) => {
      setFirebaseUser(currentFirebaseUser);
      
      // Only logout if it's a definitive "not signed in" and we were previously initializing
      // or if we strictly require a firebaseUser to exist.
      if (currentFirebaseUser === null) {
        // If firebase definitely logged out, we should clear the system user
        // But only if we are not in the middle of some other state change
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
