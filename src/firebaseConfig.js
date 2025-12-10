import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // 1. เพิ่มบรรทัดนี้

// --- เอากุญแจ (Config) ของคุณมาวางทับตรงนี้ ---
const firebaseConfig = {
  apiKey: "AIzaSyA4XZFXnb68A5BPYV7wMUon_9PphflRh4g",
  authDomain: "team-tawee-command-center.firebaseapp.com",
  projectId: "team-tawee-command-center",
  storageBucket: "team-tawee-command-center.firebasestorage.app",
  messagingSenderId: "1094944636986",
  appId: "1:1094944636986:web:e2f25cb3db139b3a1af503",
  measurementId: "G-KVQCW6HZYE"
};
// -------------------------------------------

const app = initializeApp(firebaseConfig);

// Export ตัวแปรออกไปให้ App ใช้
export const db = getFirestore(app);
export const auth = getAuth(app); // 2. เพิ่มบรรทัดนี้