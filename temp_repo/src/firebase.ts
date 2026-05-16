import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAhrrcPdo6a4afaVN80Zh66cQt8pAVJqJI",
  authDomain: "vefa-25826.firebaseapp.com",
  projectId: "vefa-25826",
  storageBucket: "vefa-25826.firebasestorage.app",
  messagingSenderId: "1003070932720",
  appId: "1:1003070932720:web:158866f87a120410b3e435",
  measurementId: "G-6TB03Y2W1W"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
