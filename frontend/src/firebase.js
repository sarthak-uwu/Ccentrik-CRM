import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // 1. Firestore import kiya

const firebaseConfig = {
  apiKey: "AIzaSyAiJrt5Ar6pypMMvCmDIEOyPj_Ze07PYIU",
  authDomain: "ccentrik-crm.web.app",
  projectId: "ccentrik-crm",
  storageBucket: "ccentrik-crm.firebasestorage.app",
  messagingSenderId: "322666375136",
  appId: "1:322666375136:web:f26d0d59792c49b758ad85"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize & Export Services
export const auth = getAuth(app);
export const db = getFirestore(app); // 2. Firestore instance ko export kiya (Build error fix)

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  hd: "ccentrik.com",
  prompt: "select_account"
});

export default app;