import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { RefreshCw } from 'lucide-react';
import { auth, db } from './firebaseConfig';

export const LoginScreen = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError(''); 
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // เช็คว่ามีข้อมูล User ใน Firestore หรือยัง ถ้าไม่มีให้สร้างใหม่
      const docRef = doc(db, "user_profiles", user.uid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) { 
        await setDoc(docRef, { 
          phone: "", 
          role: "Member", 
          status: "Active", 
          email: user.email, 
          displayName: user.displayName, 
          photoURL: user.photoURL, 
          createdAt: serverTimestamp() 
        }); 
      }
    } catch (err) { 
      setError("เข้าสู่ระบบไม่สำเร็จ: " + err.message); 
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 font-sans p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-white/50 backdrop-blur-sm text-center relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
         <div className="mb-8">
           <h1 className="text-4xl font-black text-slate-900 tracking-tight">TEAM TAWEE</h1>
           <p className="text-blue-600 font-bold tracking-widest text-xs uppercase mt-2 bg-blue-50 inline-block px-3 py-1 rounded-full">Stand Together</p>
         </div>
         <h2 className="text-xl font-bold text-slate-800 mb-2">ยินดีต้อนรับสู่ระบบ</h2>
         <p className="text-slate-500 text-sm mb-8">ศูนย์ปฏิบัติการและบริหารงานยุทธศาสตร์</p>
         
         {error && (
           <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4 font-medium border border-red-100">
             {error}
           </div>
         )}
         
         <button onClick={handleGoogleLogin} disabled={loading} className="w-full bg-white border-2 border-slate-200 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-50 hover:border-blue-300 hover:shadow-md transition-all flex items-center justify-center gap-3 group">
            {loading ? <RefreshCw className="w-5 h-5 animate-spin text-blue-600" /> : "เข้าสู่ระบบด้วย Google"}
         </button>
      </div>
    </div>
  );
};