import React, { useState, useEffect } from 'react';
import { db, auth } from './firebaseConfig'; 
import { 
  collection, addDoc, onSnapshot, updateDoc, deleteDoc, doc, 
  query, orderBy, setDoc, getDoc, serverTimestamp, 
  writeBatch, getDocs, where 
} from 'firebase/firestore';
import { 
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, updateProfile 
} from 'firebase/auth';

// 🟢 Import ไอคอนครบถ้วน (แก้ปัญหา User is not defined)
import { 
  LayoutDashboard, Megaphone, Map, Zap, Database, Users, Menu, X, Activity, 
  Calendar, CheckCircle2, Circle, Clock, ExternalLink, FileText, Plus, 
  Link as LinkIcon, Trash2, Edit2, ChevronDown, ChevronUp, Filter, RefreshCw, 
  Save, LogOut, Lock, AlertTriangle, Globe, Loader2, Tag, Search, Shield, 
  FileClock, ArrowDownWideNarrow, User, Phone, Mail, MessageCircle, Smartphone,
  ArrowUp, ArrowDown // เพิ่มปุ่มเลื่อนขึ้นลง
} from 'lucide-react';

// --- GLOBAL CONSTANTS ---
const PRESET_TAGS = [
  "Visual Storytelling", "Viral", "Tradition", "Knowledge", "Urgent", "Report", "System", "Event", "Crisis",
  "Quote", "Infographic", "Single Photo"
];

const ASSET_TYPES = ["Own media", "Partner", "NEWS Paper", "NEWS Website", "Fan Club (own)"];
const TASK_STATUSES = ["To Do", "In Progress", "In Review", "Done", "Idea", "Waiting list", "Canceled"];

const DEFAULT_SOP = [
  { text: "1. ทีม Monitor สรุปประเด็น (ใคร? ทำอะไร? กระทบเรายังไง?)", done: false },
  { text: "2. ร่าง Message สั้นๆ (เน้น Fact + จุดยืน)", done: false },
  { text: "3. ขอ Approved ด่วน (Line/โทร)", done: false },
  { text: "4. ผลิตสื่อด่วน (Graphic Quote หรือ คลิปสัมภาษณ์สั้น)", done: false },
  { text: "5. กระจายลง Social Media & ส่งกลุ่มนักข่าว", done: false }
];

const SOP_GUIDE = [
  "1. ทีม Monitor สรุปประเด็น (ใคร? ทำอะไร? กระทบเรายังไง?)",
  "2. ร่าง Message สั้นๆ (เน้น Fact + จุดยืน)",
  "3. ขอ Approved ด่วน (Line/โทร)",
  "4. ผลิตสื่อด่วน (Graphic Quote หรือ คลิปสัมภาษณ์สั้น)",
  "5. กระจายลง Social Media & ส่งกลุ่มนักข่าว"
];

const COLUMN_LABELS = {
    solver: "1. ผลงาน (Solver)",
    principles: "2. จุดยืน (Principles)",
    defender: "3. ตอบโต้ (Defender)",
    expert: "4. ผู้เชี่ยวชาญ (Expert)",
    backoffice: "5. หลังบ้าน (Back Office)"
};

const COL_DESCRIPTIONS = {
    solver: "งานรูทีน, ลงพื้นที่, แก้ปัญหาชาวบ้าน",
    principles: "Quote คำคม, อุดมการณ์, Viral, Brand",
    defender: "ชี้แจงข่าวบิดเบือน, ประเด็นร้อน, Agile",
    expert: "วิเคราะห์เชิงลึก, กฎหมาย, Knowledge",
    backoffice: "เอกสาร, งบประมาณ, ระบบ IT"
};

// --- HELPER FUNCTIONS ---
const formatDate = (val) => {
  if (!val) return "-";
  try {
    const d = val.toDate ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return "-"; }
};

const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
  return `Week ${weekNo}`;
};

const getDomain = (url) => {
  try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return 'External'; }
};

const formatForInput = (val) => {
  if (!val) return '';
  let d;
  if (val && typeof val.toDate === 'function') { d = val.toDate(); } else { d = new Date(val); }
  if (isNaN(d.getTime())) d = new Date();
  const pad = (n) => n < 10 ? '0' + n : n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 🤖 ระบบดูดข่าวอัจฉริยะ (Smart Fetch + Auto Retry + New Key)
const fetchLinkMetadata = async (url) => {
  if (!url) return null;
  let rawHtml = null;

  // 1. ลองใช้ CorsProxy
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    if (res.ok) rawHtml = await res.text();
  } catch (e) { console.warn("CorsProxy failed..."); }

  // 2. ลอง AllOrigins
  if (!rawHtml) {
    try {
      const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData.contents) rawHtml = proxyData.contents;
      }
    } catch (e) { console.warn("All proxies failed."); }
  }

  if (!rawHtml) return null; 

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const getMeta = (prop) => doc.querySelector(`meta[property="${prop}"]`)?.content || doc.querySelector(`meta[name="${prop}"]`)?.content;

  let title = getMeta("og:title") || doc.title || "";
  let image = getMeta("og:image") || "";
  let date = getMeta("article:published_time") || getMeta("date") || getMeta("pubdate") || doc.querySelector("time")?.getAttribute("datetime") || "";

  // ดักจับ Anti-Bot
  if (title.includes("Just a moment") || title.includes("Attention Required") || title.includes("Cloudflare")) {
      title = ""; 
  }

  let result = { title, image, date };

  // --- AI Fallback ---
  if (!result.title || !result.date) {
      const shortHtml = rawHtml.substring(0, 15000); 
      
      // 🔴🔴 สำคัญ: เอา Key ใหม่ที่ได้จาก Google AI Studio มาวางแทนที่ตรงนี้ครับ 🔴🔴
      const GEMINI_API_KEY = "AIzaSyCCddMfY2JHfABUDRALO5Ci8DZHKtPZsY0"; 
      
      // รายชื่อ Model ที่จะวนลูปหา (เพิ่ม gemini-pro ตัวมาตรฐานเข้าไป)
      const modelCandidates = [
          "gemini-1.5-flash",
          "gemini-pro",         // <-- ตัวนี้เสถียรสุด
          "gemini-1.5-pro",
          "gemini-1.0-pro"
      ];

      for (const model of modelCandidates) {
          try {
            // console.log(`Trying AI Model: ${model}...`);
            const prompt = `Extract metadata (title, image, date) from HTML. Return JSON ONLY: {"title": "...", "image": "...", "date": "..."}. HTML: ${shortHtml}`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (response.ok) {
                const aiData = await response.json();
                const textResponse = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textResponse) {
                    const cleanJson = textResponse.replace(/```json|```/g, '').trim();
                    const aiResult = JSON.parse(cleanJson);
                    if (!result.title || result.title.includes("Just a moment")) result.title = aiResult.title;
                    if (!result.image) result.image = aiResult.image;
                    if (!result.date) result.date = aiResult.date; 
                    break; // หยุดลูปเมื่อเจอตัวที่ใช้ได้
                }
            }
          } catch (e) { 
             // console.warn(`Error with ${model}`, e); 
          }
      }
  }
  return result;
};

// --- COMPONENTS ---

const LoadingOverlay = ({ isOpen, message = "กำลังทำงาน..." }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center z-[2000] animate-fadeIn">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-3" />
      <p className="text-slate-600 font-bold animate-pulse">{message}</p>
    </div>
  );
};

// Tag Manager Modal (อัปเกรด: แก้ไข + เลื่อนลำดับ)
const TagManagerModal = ({ isOpen, onClose, existingTags, onSave }) => {
  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");

  useEffect(() => {
    if (isOpen) {
        const initTags = (existingTags && existingTags.length > 0 ? existingTags : [
            { name: "Breaking News", color: "#ef4444" }, 
            { name: "PR News", color: "#3b82f6" },       
            { name: "Event", color: "#10b981" },         
            { name: "Official", color: "#6366f1" }       
        ]).map(t => ({ ...t, originalName: t.name }));
        setTags(initTags);
    }
  }, [isOpen, existingTags]);

  const handleAdd = () => {
    if (!newTagName.trim()) return;
    if (tags.some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase())) {
        alert("ชื่อ Tag นี้มีอยู่แล้ว");
        return;
    }
    setTags([...tags, { name: newTagName.trim(), color: newTagColor, originalName: null }]);
    setNewTagName("");
  };

  const handleDelete = (index) => {
    if(confirm("ต้องการลบ Tag นี้ออกจากระบบ?")) {
        setTags(tags.filter((_, i) => i !== index));
    }
  };

  const moveTag = (index, direction) => {
    const newTags = [...tags];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newTags.length) return;
    const temp = newTags[index];
    newTags[index] = newTags[targetIndex];
    newTags[targetIndex] = temp;
    setTags(newTags);
  };

  const updateTag = (index, field, value) => {
    const newTags = [...tags];
    newTags[index] = { ...newTags[index], [field]: value };
    setTags(newTags);
  };

  const handleSave = () => {
      const cleanTags = tags.map(({ name, color }) => ({ name, color }));
      const renames = tags.filter(t => t.originalName && t.originalName !== t.name).map(t => ({ oldName: t.originalName, newName: t.name }));
      onSave(cleanTags, renames);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1300] p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-start mb-1">
            <h3 className="text-xl font-bold text-slate-800">จัดการแท็ก (Tag Manager)</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400"/></button>
        </div>
        <p className="text-xs text-slate-500 mb-6">แก้ไขชื่อ/สี และจัดลำดับ (เปลี่ยนชื่อจะแก้ในข่าวเก่าให้อัตโนมัติ)</p>

        <div className="flex gap-2 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-sm flex-shrink-0">
            <div className="relative w-10 h-10 flex-shrink-0">
                <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"/>
                <div className="w-full h-full rounded-lg border-2 border-white shadow-sm" style={{backgroundColor: newTagColor}}></div>
            </div>
            <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="ชื่อ Tag ใหม่..." className="flex-1 bg-white border border-slate-300 rounded-lg px-3 text-sm outline-none focus:border-blue-500" onKeyDown={(e) => e.key === 'Enter' && handleAdd()}/>
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold text-xs flex items-center gap-1 shadow-blue-200 shadow-lg active:scale-95 transition-all"><Plus className="w-4 h-4" /> เพิ่ม</button>
        </div>

        <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {tags.map((tag, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 border border-slate-100 rounded-xl bg-white hover:border-blue-200 hover:shadow-sm transition group">
                    <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveTag(idx, -1)} disabled={idx === 0} className={`p-0.5 rounded hover:bg-slate-100 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:text-blue-600'}`}><ArrowUp className="w-3 h-3" /></button>
                        <button onClick={() => moveTag(idx, 1)} disabled={idx === tags.length - 1} className={`p-0.5 rounded hover:bg-slate-100 ${idx === tags.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:text-blue-600'}`}><ArrowDown className="w-3 h-3" /></button>
                    </div>
                    <div className="relative w-8 h-8 flex-shrink-0 group/color cursor-pointer">
                        <input type="color" value={tag.color} onChange={(e) => updateTag(idx, 'color', e.target.value)} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10" title="คลิกเพื่อเปลี่ยนสี"/>
                        <div className="w-full h-full rounded-full border shadow-sm transition-transform group-hover/color:scale-110" style={{backgroundColor: tag.color}}></div>
                    </div>
                    <input type="text" value={tag.name} onChange={(e) => updateTag(idx, 'name', e.target.value)} className="flex-1 text-sm font-bold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 outline-none px-1 py-0.5 transition-colors"/>
                    <button onClick={() => handleDelete(idx)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4"/></button>
                </div>
            ))}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end bg-white">
            <button onClick={handleSave} className="w-full sm:w-auto bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black shadow-xl shadow-slate-200 flex items-center justify-center gap-2 active:scale-95 transition-all"><Save className="w-4 h-4"/> บันทึกการเปลี่ยนแปลง</button>
        </div>
      </div>
    </div>
  );
};

const SearchModal = ({ isOpen, onClose, data, onNavigate }) => {
  const [query, setQuery] = useState("");
  if (!isOpen) return null;
  const results = query.length < 2 ? [] : [
    ...data.tasks.filter(t => t.title?.toLowerCase().includes(query.toLowerCase())).map(t => ({ ...t, type: 'Task', label: t.title, sub: t.status })),
    ...data.media.filter(m => m.name?.toLowerCase().includes(query.toLowerCase())).map(m => ({ ...m, type: 'Media', label: m.name, sub: m.phone })),
    ...data.channels.filter(c => c.name?.toLowerCase().includes(query.toLowerCase())).map(c => ({ ...c, type: 'Channel', label: c.name, sub: c.url })),
  ];
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[1500] p-4 pt-20 animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex items-center gap-3"><Search className="w-6 h-6 text-slate-400" /><input autoFocus className="flex-1 text-lg outline-none text-slate-700 placeholder:text-slate-300" placeholder="ค้นหา..." value={query} onChange={e => setQuery(e.target.value)}/><button onClick={onClose} className="p-1 bg-slate-100 rounded-md text-xs text-slate-500">ESC</button></div>
        <div className="max-h-[60vh] overflow-y-auto bg-slate-50/50">
           {results.length > 0 ? (<div className="p-2">{results.map((res, idx) => (<div key={idx} className="p-3 hover:bg-blue-50 rounded-lg cursor-pointer flex items-center justify-between group transition" onClick={() => { if(res.type === 'Task') onNavigate('strategy'); if(res.type === 'Media' || res.type === 'Channel') onNavigate('assets'); onClose(); }}><div><p className="font-bold text-slate-800 text-sm">{res.label}</p><p className="text-xs text-slate-500">{res.type} • {res.sub}</p></div><span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100">ไปที่หน้า →</span></div>))}</div>) : query.length > 0 ? <div className="p-10 text-center text-slate-400">ไม่พบข้อมูล</div> : <div className="p-10 text-center text-slate-400 text-sm">พิมพ์คำค้นหา...</div>}
        </div>
      </div>
    </div>
  );
};

const FormModal = ({ isOpen, onClose, title, fields, onSave, submitText = "บันทึก", availableTags = [] }) => {
  const [formData, setFormData] = useState({});
  const [tagInput, setTagInput] = useState(""); 

  useEffect(() => {
    if (isOpen) {
      const initialData = {};
      fields.forEach(f => {
        if (f.type === 'tags') initialData[f.key] = f.defaultValue || [];
        else initialData[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
      });
      setFormData(initialData);
      setTagInput("");
    }
  }, [isOpen, fields]);

  const findTagInfo = (name) => availableTags.find(t => t.name === name) || { name, color: '#94a3b8' };

  const handleAddTag = (key, val) => {
    if (!val.trim()) return;
    const currentTags = formData[key] || [];
    if (!currentTags.includes(val.trim())) setFormData({ ...formData, [key]: [...currentTags, val.trim()] });
    setTagInput("");
  };

  const handleRemoveTag = (key, tagToRemove) => {
    const currentTags = formData[key] || [];
    setFormData({ ...formData, [key]: currentTags.filter(t => t !== tagToRemove) });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full transition"><X className="w-5 h-5 text-slate-400" /></button>
        <h3 className="text-xl font-bold text-slate-800 mb-6 pr-8">{title}</h3>
        <div className="space-y-5">
           {fields.map((field) => (
             <div key={field.key}>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase flex items-center gap-2">{field.label}</label>
                {field.type === 'tags' ? (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(formData[field.key] || []).map((t, i) => {
                         const info = findTagInfo(t);
                         return (<span key={i} className="text-white text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm" style={{ backgroundColor: info.color }}>#{t}<button onClick={() => handleRemoveTag(field.key, t)}><X className="w-3 h-3 hover:text-red-200"/></button></span>);
                      })}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddTag(field.key, tagInput); } }} className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500" placeholder="พิมพ์ Tag..." />
                      <button onClick={() => handleAddTag(field.key, tagInput)} className="bg-slate-200 p-2 rounded-lg hover:bg-slate-300"><Plus className="w-4 h-4"/></button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                       {availableTags.map(pt => (<button key={pt.name} onClick={() => handleAddTag(field.key, pt.name)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded-full text-slate-600 hover:brightness-95 transition flex items-center gap-1" style={{ borderLeft: `3px solid ${pt.color}` }}>+ {pt.name}</button>))}
                    </div>
                  </div>
                ) : field.type === 'select' ? (
                   <div className="relative"><select value={formData[field.key]} onChange={(e) => setFormData({...formData, [field.key]: e.target.value})} className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none appearance-none font-medium text-slate-700 transition-all">{field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select><ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none"/></div>
                ) : (
                   <input type={field.type || 'text'} value={formData[field.key]} onChange={(e) => setFormData({...formData, [field.key]: e.target.value})} className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:bg-white focus:border-blue-500 outline-none font-medium text-slate-700 transition-all placeholder:text-slate-300" placeholder={field.placeholder || ''} list={field.type === 'datalist' ? `list-${field.key}` : undefined} />
                )}
                {field.type === 'datalist' && <datalist id={`list-${field.key}`}>{field.options.map(opt => <option key={opt} value={opt} />)}</datalist>}
             </div>
           ))}
        </div>
        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="px-5 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors text-sm">ยกเลิก</button>
          <button onClick={() => onSave(formData)} className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 text-sm">{submitText}</button>
        </div>
      </div>
    </div>
  );
};

const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
    <div><h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">{title}</h2><p className="text-slate-500 text-sm mt-1 font-medium">{subtitle}</p></div>
    <div className="w-full md:w-auto">{action}</div>
  </div>
);

const StatusBadge = ({ status }) => {
  const styles = { "To Do": "bg-slate-100 text-slate-600 border-slate-200", "In Progress": "bg-blue-50 text-blue-600 border-blue-100", "In Review": "bg-purple-50 text-purple-600 border-purple-100", "Done": "bg-emerald-50 text-emerald-600 border-emerald-100", "Idea": "bg-yellow-50 text-yellow-600 border-yellow-100", "Waiting list": "bg-orange-50 text-orange-600 border-orange-100", "Canceled": "bg-gray-50 text-gray-400 border-gray-200 line-through" };
  return <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide font-bold border ${styles[status] || "bg-gray-100"}`}>{status}</span>;
};

const StatusDonutChart = ({ stats }) => {
  const total = stats.total || 1; 
  const donePercent = (stats.done / total) * 100;
  const doingPercent = (stats.doing / total) * 100;
  const circumference = 2 * Math.PI * 40;
  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      <svg className="transform -rotate-90 w-full h-full" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" className="stroke-slate-200" strokeWidth="12" strokeLinecap="round" />
        <circle cx="50" cy="50" r="40" fill="none" className="stroke-blue-500 transition-all duration-1000 ease-out" strokeWidth="12" strokeDasharray={`${(donePercent + doingPercent) / 100 * circumference} ${circumference}`} strokeLinecap="round" />
        <circle cx="50" cy="50" r="40" fill="none" className="stroke-emerald-500 transition-all duration-1000 ease-out" strokeWidth="12" strokeDasharray={`${(donePercent / 100) * circumference} ${circumference}`} strokeLinecap="round" />
      </svg>
      <div className="absolute text-center"><span className="text-4xl font-black text-slate-800">{stats.total}</span><span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">ACTIVE TASKS</span></div>
    </div>
  );
};

const LoginScreen = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleGoogleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const docRef = doc(db, "user_profiles", user.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) { await setDoc(docRef, { phone: "", role: "Member", status: "Active", email: user.email, displayName: user.displayName, photoURL: user.photoURL, createdAt: serverTimestamp() }); }
    } catch (err) { setError("เข้าสู่ระบบไม่สำเร็จ: " + err.message); }
    setLoading(false);
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 font-sans p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-white/50 backdrop-blur-sm text-center relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
         <div className="mb-8"><h1 className="text-4xl font-black text-slate-900 tracking-tight">TEAM TAWEE</h1><p className="text-blue-600 font-bold tracking-widest text-xs uppercase mt-2 bg-blue-50 inline-block px-3 py-1 rounded-full">Stand Together</p></div>
         <h2 className="text-xl font-bold text-slate-800 mb-2">ยินดีต้อนรับสู่ระบบ</h2>
         <p className="text-slate-500 text-sm mb-8">ศูนย์ปฏิบัติการและบริหารงานยุทธศาสตร์</p>
         {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4 font-medium border border-red-100">{error}</div>}
         <button onClick={handleGoogleLogin} disabled={loading} className="w-full bg-white border-2 border-slate-200 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-50 hover:border-blue-300 hover:shadow-md transition-all flex items-center justify-center gap-3 group">
            {loading ? <RefreshCw className="w-5 h-5 animate-spin text-blue-600" /> : "เข้าสู่ระบบด้วย Google"}
         </button>
      </div>
    </div>
  );
};

const PendingScreen = ({ onLogout }) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
            <div className="mx-auto bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mb-4"><Lock className="w-8 h-8 text-amber-600"/></div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">รอการอนุมัติสิทธิ์</h2>
            <p className="text-slate-500 text-sm mb-6">บัญชีของคุณกำลังรอการตรวจสอบจาก Admin</p>
            <button onClick={onLogout} className="text-red-500 font-bold hover:underline text-sm">ออกจากระบบ</button>
        </div>
    </div>
);

const ProfileModal = ({ isOpen, onClose, user, userProfile, onUpdate }) => {
  const [name, setName] = useState(user?.displayName || '');
  const [photo, setPhoto] = useState(user?.photoURL || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  useEffect(() => { if(user) { setName(user.displayName||''); setPhoto(user.photoURL||''); setPhone(userProfile?.phone||''); } }, [user, userProfile]);
  const handleSave = async () => { await onUpdate(name, photo, phone); onClose(); };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-slate-800">แก้ไขข้อมูลส่วนตัว</h3><button onClick={onClose}><X className="w-6 h-6 text-slate-400" /></button></div>
        <div className="space-y-4">
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border p-2.5 rounded-lg" placeholder="ชื่อแสดงผล" />
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full border p-2.5 rounded-lg" placeholder="เบอร์โทรศัพท์" />
            <input type="text" value={photo} onChange={e => setPhoto(e.target.value)} className="w-full border p-2.5 rounded-lg" placeholder="Link รูปโปรไฟล์" />
        </div>
        <button onClick={handleSave} className="w-full mt-6 bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700">บันทึกข้อมูล</button>
        <button onClick={() => signOut(auth)} className="w-full mt-3 text-red-500 font-bold text-sm hover:underline flex items-center justify-center gap-2"><LogOut className="w-4 h-4" /> ออกจากระบบ</button>
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function TeamTaweeApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [media, setMedia] = useState([]);
  const [channels, setChannels] = useState([]); 
  const [publishedLinks, setPublishedLinks] = useState([]); 
  const [usersList, setUsersList] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  const [hideDone, setHideDone] = useState(false);
  const [filterTag, setFilterTag] = useState('All');
  const [sortOrder, setSortOrder] = useState('newest'); 
  const [isGlobalLoading, setIsGlobalLoading] = useState(false); 
  const [isDataLoading, setIsDataLoading] = useState(true); 
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [newsStartDate, setNewsStartDate] = useState('');
  const [newsEndDate, setNewsEndDate] = useState('');
  const [newsFilterTag, setNewsFilterTag] = useState('All'); 
  const [systemTags, setSystemTags] = useState([]);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);

  // --- HELPER IN SCOPE ---
  const navigateTo = (tabId) => { 
    if (activeTab === tabId) return; 
    setActiveTab(tabId); 
    window.history.pushState({ tab: tabId }, '', `#${tabId}`); 
    setIsMobileMenuOpen(false); 
  };

  // --- DATA FETCHING ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const docRef = doc(db, "user_profiles", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setUserProfile(docSnap.data());
      } else setUserProfile(null);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handlePopState = (event) => { if (event.state?.tab) setActiveTab(event.state.tab); else setActiveTab('dashboard'); };
    window.addEventListener('popstate', handlePopState);
    window.history.replaceState({ tab: 'dashboard' }, '', '#dashboard');
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const unsubTags = onSnapshot(doc(db, "settings", "news_config"), (doc) => {
        if (doc.exists()) setSystemTags(doc.data().tags || []);
        else setSystemTags([]); 
    });
    return () => unsubTags();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsubTasks = onSnapshot(collection(db, "tasks"), (s) => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubPlans = onSnapshot(collection(db, "plans"), (s) => setPlans(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubMedia = onSnapshot(collection(db, "media"), (s) => setMedia(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubChannels = onSnapshot(collection(db, "channels"), (s) => setChannels(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    try {
      const unsubLinks = onSnapshot(query(collection(db, "published_links"), orderBy("createdAt", "desc")), (s) => setPublishedLinks(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      let unsubUsers = () => {}, unsubLogs = () => {};
      if (userProfile?.role === 'Admin') {
          unsubUsers = onSnapshot(collection(db, "user_profiles"), (s) => setUsersList(s.docs.map(d => ({ id: d.id, ...d.data() }))));
          unsubLogs = onSnapshot(query(collection(db, "logs"), orderBy("createdAt", "desc")), (s) => setActivityLogs(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      }
      setIsDataLoading(false);
      return () => { unsubTasks(); unsubPlans(); unsubMedia(); unsubChannels(); unsubLinks(); unsubUsers(); unsubLogs(); };
    } catch(e) {
      setIsDataLoading(false);
      return () => { unsubTasks(); unsubPlans(); unsubMedia(); unsubChannels(); };
    }
  }, [currentUser, userProfile]);

  const logActivity = async (action, details) => { try { await addDoc(collection(db, "logs"), { action, details, user: currentUser.displayName || currentUser.email, createdAt: serverTimestamp() }); } catch(e) {} };
  
  // --- STATE FOR MODALS ---
  const [editingTask, setEditingTask] = useState(null);
  const [urgentModal, setUrgentModal] = useState(null); 
  const [formModalConfig, setFormModalConfig] = useState({ isOpen: false, title: '', fields: [], onSave: () => {} });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isSopOpen, setIsSopOpen] = useState(false); 

  // --- ACTIONS ---
  const handleUpdateProfile = async (n, p, ph) => { if(!currentUser)return; setIsGlobalLoading(true); try{ await updateProfile(currentUser, {displayName:n, photoURL:p}); await setDoc(doc(db,"user_profiles",currentUser.uid), {phone:ph}, {merge:true}); setCurrentUser({...currentUser, displayName:n, photoURL:p}); setUserProfile(prev=>({...prev, phone:ph})); }catch(e){alert(e.message);} setIsGlobalLoading(false); };
  
  const openFormModal = (title, fields, onSave, submitText, additionalProps = {}) => 
      setFormModalConfig({ isOpen:true, title, fields, onSave: async(d)=>{ setIsGlobalLoading(true); try{await onSave(d); setFormModalConfig(prev=>({...prev, isOpen:false}));}catch(e){alert(e.message);} setIsGlobalLoading(false); }, submitText, ...additionalProps });

  // 🟢 ฟังก์ชัน Save System Tags แบบใหม่ (แก้ชื่อ + Reorder)
  const saveSystemTags = async (newTags, renames) => {
    setIsGlobalLoading(true);
    try {
        // 1. บันทึก Config ลง Settings
        await setDoc(doc(db, "settings", "news_config"), { tags: newTags }, { merge: true });

        // 2. ถ้ามีการเปลี่ยนชื่อ Tag (Renames) ให้ไล่แก้ในข่าวเก่า
        if (renames && renames.length > 0) {
            const batch = writeBatch(db);
            let batchCount = 0;
            for (const { oldName, newName } of renames) {
                if (oldName === newName) continue;
                const q = query(collection(db, "published_links"), where("tags", "array-contains", oldName));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const updatedTags = (data.tags || []).map(t => t === oldName ? newName : t);
                    const docRef = doc(db, "published_links", docSnap.id);
                    batch.update(docRef, { tags: updatedTags });
                    batchCount++;
                });
            }
            if (batchCount > 0) await batch.commit();
        }
        setIsTagManagerOpen(false);
    } catch (e) {
        alert("บันทึกไม่สำเร็จ: " + e.message);
    }
    setIsGlobalLoading(false);
  };

  const saveTaskChange = async (task) => { if(!task.id)return; setIsGlobalLoading(true); try{ await updateDoc(doc(db,"tasks",task.id), {title:task.title||"", status:task.status||"To Do", tag:task.tag||"", role:task.role||"", link:task.link||"", deadline:task.deadline||"", updatedBy:currentUser.displayName, updatedAt:new Date().toISOString()}); logActivity("Edit Task", task.title); setEditingTask(null); }catch(e){alert(e.message);} setIsGlobalLoading(false); };
  const saveUrgentCase = async (task) => { if(!task.id)return; setIsGlobalLoading(true); try{ await updateDoc(doc(db,"tasks",task.id), {title:task.title||"", status:task.status||"To Do", link:task.link||"", sop:task.sop||[], updatedBy:currentUser.displayName, updatedAt:new Date().toISOString()}); logActivity("Update Urgent", task.title); setUrgentModal(null); }catch(e){alert(e.message);} setIsGlobalLoading(false); };
  
  const addNewTask = (key) => openFormModal("เพิ่มงานใหม่", [{key:'title', label:'ชื่องาน'}, {key:'tag', label:'Tag'}, {key:'role', label:'ผู้รับผิดชอบ'}, {key:'status', label:'สถานะ', type:'select', options: TASK_STATUSES}, {key:'deadline', label:'กำหนดส่ง', type:'date'}, {key:'link', label:'Link ผลงาน'}], async(d)=>{ await addDoc(collection(db,"tasks"), {...d, status:d.status||"To Do", link:d.link||"", columnKey:key, createdBy:currentUser.displayName, createdAt:new Date().toISOString()}); logActivity("Add Task", d.title); });
  const addChannel = () => openFormModal("เพิ่มช่องทาง", [{key:'name', label:'ชื่อ'}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:'Own media'}, {key:'url', label:'URL'}], async(d)=>{ await addDoc(collection(db,"channels"), {...d, count:0}); logActivity("Add Channel", d.name); });
  const updateChannel = (c) => openFormModal("แก้ไขช่องทาง", [{key:'name', label:'ชื่อ', defaultValue:c.name}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:c.type}, {key:'url', label:'URL', defaultValue:c.url}], async(d)=>{ await updateDoc(doc(db,"channels",c.id), d); logActivity("Edit Channel", c.name); });
  const addMedia = () => openFormModal("เพิ่มสื่อ", [{key:'name', label:'ชื่อ'}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:'NEWS Website'}, {key:'phone', label:'เบอร์'}, {key:'line', label:'Line'}], async(d)=>{ await addDoc(collection(db,"media"), {...d, active:true}); logActivity("Add Media", d.name); });
  const editMedia = (c) => openFormModal("แก้ไขสื่อ", [{key:'name', label:'ชื่อ', defaultValue:c.name}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:c.type}, {key:'phone', label:'เบอร์', defaultValue:c.phone}, {key:'line', label:'Line', defaultValue:c.line}], async(d)=>{ await updateDoc(doc(db,"media",c.id), d); logActivity("Edit Media", c.name); });

  const addPublishedLink = async () => {
    const urlInput = prompt("กรุณาวาง Link ข่าวที่ต้องการเพิ่ม:");
    if (!urlInput) return;
    setIsGlobalLoading(true);
    let meta = { title: "", image: "", date: "" };
    try { meta = await fetchLinkMetadata(urlInput) || meta; } catch (e) { alert("ดึงข้อมูลอัตโนมัติไม่สำเร็จ แต่คุณยังกรอกเองได้ครับ"); }
    setIsGlobalLoading(false);

    const defaults = { url: urlInput, title: meta.title || "", imageUrl: meta.image || "", platform: 'Website', customDate: formatForInput(meta.date || new Date()) };
    openFormModal("เพิ่มข่าวประชาสัมพันธ์", [
      {key:'url', label:'URL ข่าว', defaultValue: defaults.url},
      {key:'title', label:'หัวข้อข่าว', defaultValue: defaults.title},
      {key:'imageUrl', label:'Link รูปภาพ', defaultValue: defaults.imageUrl}, 
      {key:'customDate', label:'วันที่ลงข่าว', type:'datetime-local', defaultValue: defaults.customDate},
      {key:'platform', label:'Platform', type:'select', options: ['Website', 'Facebook', 'YouTube', 'TikTok', 'Twitter'], defaultValue: defaults.platform},
      {key:'tags', label:'Tags (เพิ่ม/ลบ)', type:'tags', defaultValue: []} 
    ], async(d)=>{ 
      const finalDate = d.customDate ? new Date(d.customDate) : new Date();
      await addDoc(collection(db,"published_links"), { title: d.title.trim() || "No Title", url: d.url || "", imageUrl: d.imageUrl || "", platform: d.platform || "Website", tags: d.tags || [], createdBy:currentUser.displayName, createdAt: finalDate }); 
      logActivity("Add Link", d.title); 
    }, "บันทึกข้อมูล", { availableTags: systemTags });
  };

  const editPublishedLink = (link) => openFormModal("แก้ไขข่าว", [
    {key:'title', label:'หัวข้อข่าว', defaultValue: link.title},
    {key:'url', label:'URL ข่าว', defaultValue: link.url},
    {key:'imageUrl', label:'Link รูปภาพ', defaultValue: link.imageUrl}, 
    {key:'customDate', label:'วันที่ลงข่าว', type:'datetime-local', defaultValue: formatForInput(link.createdAt)},
    {key:'platform', label:'Platform', type:'select', options: ['Website', 'Facebook', 'YouTube', 'TikTok', 'Twitter'], defaultValue: link.platform},
    {key:'tags', label:'Tags', type:'tags', defaultValue: link.tags || []} 
  ], async(d)=>{ 
    const newDate = d.customDate ? new Date(d.customDate) : null;
    await updateDoc(doc(db,"published_links",link.id), { ...d, tags: d.tags || [], createdAt: newDate || link.createdAt, updatedAt:serverTimestamp() }); 
    logActivity("Edit Link", d.title); 
  }, "บันทึก", { availableTags: systemTags });

  const deleteLink = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"published_links",id)); logActivity("Delete Link", id); }};
  const deleteChannel = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"channels",id)); logActivity("Delete Channel", id); }};
  const deleteMedia = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"media",id)); logActivity("Delete Media", id); }};

  const togglePlanItem = async (pid, idx, items) => { const newItems = [...items]; newItems[idx].completed = !newItems[idx].completed; const progress = Math.round((newItems.filter(i=>i.completed).length/newItems.length)*100); await updateDoc(doc(db,"plans",pid), {items:newItems, progress}); };
  const removePlanItem = async (pid, idx, items) => { if(confirm("ลบ?")) { const newItems = items.filter((_,i)=>i!==idx); const p = Math.round((newItems.filter(i=>i.completed).length/newItems.length)*100)||0; await updateDoc(doc(db,"plans",pid), {items:newItems, progress:p}); }};
  const editPlanItem = (pid, idx, items) => openFormModal("แก้รายการ", [{key:'text', label:'ข้อความ', defaultValue:items[idx].text}], async(d)=> { const newItems=[...items]; newItems[idx].text=d.text; await updateDoc(doc(db,"plans",pid), {items:newItems}); });
  const editPlanTitle = (p) => openFormModal("แก้ชื่อแผน", [{key:'title', label:'ชื่อ', defaultValue:p.title}], async(d)=> updateDoc(doc(db,"plans",p.id), d));
  const addPlan = () => openFormModal("สร้างแผนใหม่", [{key:'title', label:'ชื่อแผน'}], async(d)=> { await addDoc(collection(db,"plans"), {...d, progress:0, items:[]}); logActivity("Create Plan", d.title); });
  const createUrgentCase = () => openFormModal("เปิดเคสด่วน", [{key:'title', label:'หัวข้อ'}, {key:'deadline', label:'เสร็จภายใน', type:'date'}], async(d) => { await addDoc(collection(db,"tasks"), { ...d, status:"To Do", role:"Hunter", tag:"Urgent", link:"", columnKey:"defender", sop:DEFAULT_SOP, createdBy:currentUser.displayName, createdAt:new Date().toISOString() }); alert("เปิดเคสแล้ว!"); logActivity("Open Urgent", d.title); });
  const updateUserStatus = (uid, status, role) => { updateDoc(doc(db, "user_profiles", uid), { status, role }); logActivity("Admin Update", `${uid} -> ${status}`); };

  // --- RENDERING ---
  const sortTasks = (taskList) => {
    if(!taskList) return [];
    return [...taskList].sort((a, b) => {
       const getDateValue = (item) => {
           if (item.deadline) return new Date(item.deadline).getTime();
           if (item.createdAt) return item.createdAt.seconds ? item.createdAt.seconds * 1000 : new Date(item.createdAt).getTime();
           return 0;
       };
       const timeA = getDateValue(a);
       const timeB = getDateValue(b);
       if(sortOrder === 'newest') return timeB - timeA; 
       if(sortOrder === 'oldest') return timeA - timeB; 
       if(sortOrder === 'deadline') {
           if(!a.deadline && !b.deadline) return 0;
           if(!a.deadline) return 1; 
           if(!b.deadline) return -1;
           return a.deadline.localeCompare(b.deadline); 
       }
       return 0;
    });
  };

  const groupedTasks = { solver: sortTasks(tasks.filter(t => t.columnKey === 'solver')), principles: sortTasks(tasks.filter(t => t.columnKey === 'principles')), defender: sortTasks(tasks.filter(t => t.columnKey === 'defender')), expert: sortTasks(tasks.filter(t => t.columnKey === 'expert')), backoffice: sortTasks(tasks.filter(t => t.columnKey === 'backoffice')) };
  const urgentTasks = tasks.filter(t => t.tag === 'Urgent');
  const allTags = ['All', ...new Set([...PRESET_TAGS, ...tasks.map(t => t.tag)].filter(Boolean))];

  const navItems = [
    { id: 'dashboard', title: 'ภาพรวม', subtitle: 'Dashboard', icon: LayoutDashboard },
    { id: 'newsroom', title: 'ห้องข่าว & สื่อ', subtitle: 'Newsroom', icon: Globe, color: 'text-indigo-500' }, 
    { id: 'strategy', title: 'กระดาน 4 แกน', subtitle: 'Strategy', icon: Megaphone },
    { id: 'masterplan', title: 'แผนงานหลัก', subtitle: 'Master Plan', icon: Map },
    { id: 'rapidresponse', title: 'ปฏิบัติการด่วน', subtitle: 'Rapid Response', icon: Zap, color: 'text-red-500' },
    { id: 'assets', title: 'คลังข้อมูลสื่อ', subtitle: 'Media Assets', icon: Database },
  ];
  if(userProfile?.role === 'Admin') navItems.push({ id: 'admin', title: 'ผู้ดูแลระบบ', subtitle: 'Admin & Logs', icon: Shield });

  const renderDashboard = () => {
    const taskStats = { done: 0, doing: 0, waiting: 0, total: 0 };
    tasks.forEach(t => { if (t.status !== 'Canceled') { taskStats.total++; if (t.status === 'Done') taskStats.done++; else if (t.status === 'In Progress' || t.status === 'In Review') taskStats.doing++; else taskStats.waiting++; } });
    return (
      <div className="space-y-6 animate-fadeIn">
        <PageHeader title="ภาพรวมสถานการณ์" subtitle="Overview & Statistics" action={<div className="flex gap-2"><button onClick={() => setIsSearchOpen(true)} className="p-2 bg-white border rounded-lg text-slate-500 hover:bg-slate-50"><Search className="w-5 h-5"/></button><button onClick={() => addNewTask('solver')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700 transition-colors"> + งานทั่วไป </button><button onClick={createUrgentCase} className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors"> แจ้งเหตุด่วน! </button></div>} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center relative overflow-hidden"><p className="text-slate-500 text-xs font-bold uppercase mb-6 w-full text-left">Task Status</p><StatusDonutChart stats={taskStats} /><div className="flex justify-center gap-4 mt-6 text-[10px] font-bold w-full flex-wrap"><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>เสร็จ ({taskStats.done})</div><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div>กำลังทำ ({taskStats.doing})</div><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300"></div>รอ ({taskStats.waiting})</div></div></div>
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col"><h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-500"/> ความเคลื่อนไหวล่าสุด</h3><div className="space-y-3 overflow-y-auto max-h-[300px] custom-scrollbar pr-2">{tasks.sort((a,b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0)).slice(0, 10).map(t => (<div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-50 hover:bg-slate-50 transition cursor-pointer" onClick={() => setEditingTask(t)}><div className="flex items-center gap-3"><div className={`w-2 h-10 rounded-full ${t.status === 'Done' ? 'bg-emerald-500' : t.status === 'In Progress' ? 'bg-blue-500' : 'bg-slate-300'}`}></div><div><p className="font-bold text-sm text-slate-700 line-clamp-1">{t.title}</p><p className="text-[10px] text-slate-400 flex gap-2"><span>{t.role || 'ไม่ระบุผู้รับผิดชอบ'}</span><span>• {t.updatedAt ? formatDate(t.updatedAt) : 'New'}</span></p></div></div><StatusBadge status={t.status} /></div>))}</div></div>
        </div>
        <div className="pt-6 border-t border-slate-200"><div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><Globe className="w-5 h-5 text-indigo-500"/> ข่าวประชาสัมพันธ์ล่าสุด</h3><button onClick={() => navigateTo('newsroom')} className="text-sm text-indigo-600 font-bold hover:underline"> ดูทั้งหมด &rarr;</button></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{publishedLinks.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 4).map(link => (<a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="group bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all flex flex-col"><div className="aspect-video bg-slate-100 relative overflow-hidden">{link.imageUrl ? <img src={link.imageUrl} alt={link.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /> : <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><FileText className="w-8 h-8 mb-1"/><span className="text-[10px]">No Image</span></div>}</div><div className="p-3 flex flex-col flex-1"><span className="text-[9px] font-bold text-indigo-500 uppercase mb-1">{link.platform || 'News'}</span><h4 className="font-bold text-slate-800 text-xs line-clamp-2 mb-2 group-hover:text-indigo-600 transition">{link.title}</h4><div className="text-[9px] text-slate-400 font-medium mb-2 flex items-center gap-1"><LinkIcon className="w-2.5 h-2.5" />{getDomain(link.url)}</div><div className="mt-auto flex items-center gap-1 text-[9px] text-slate-400"><Clock className="w-3 h-3"/> {link.createdAt ? formatDate(link.createdAt).split(' ')[0] : '-'}</div></div></a>))}</div></div>
        {editingTask && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn"><div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"><button onClick={() => setEditingTask(null)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button><h3 className="font-bold text-xl text-slate-800 mb-6">แก้ไขงาน</h3><div className="space-y-4"><input type="text" value={editingTask.title} onChange={e=>setEditingTask({...editingTask, title:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" /><div><input type="text" value={editingTask.tag} onChange={e=>setEditingTask({...editingTask, tag:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="Tag..." /><div className="mt-2 flex flex-wrap gap-2">{PRESET_TAGS.slice(0,5).map(t=><button key={t} onClick={()=>setEditingTask({...editingTask, tag:t})} className="text-[10px] bg-slate-100 px-2 py-1 rounded border hover:bg-blue-100">{t}</button>)}</div></div><input type="text" value={editingTask.role||""} onChange={e=>setEditingTask({...editingTask, role:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="ผู้รับผิดชอบ" /><div className="grid grid-cols-2 gap-4"><select value={editingTask.status} onChange={e=>setEditingTask({...editingTask, status:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm"><option>To Do</option><option>In Progress</option><option>In Review</option><option>Done</option><option>Idea</option><option>Waiting list</option><option>Canceled</option></select><input type="date" value={editingTask.deadline} onChange={e=>setEditingTask({...editingTask, deadline:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm" /></div><input type="text" value={editingTask.link} onChange={e=>setEditingTask({...editingTask, link:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="Link..." /><div className="flex justify-between pt-4"><button onClick={async()=>{if(confirm("ลบ?")){setIsGlobalLoading(true); await deleteDoc(doc(db,"tasks",editingTask.id)); logActivity("Delete Task", editingTask.title); setIsGlobalLoading(false); setEditingTask(null);}}} className="text-red-500 text-sm font-bold flex items-center gap-1"><Trash2 className="w-4 h-4"/> ลบ</button><button onClick={()=>saveTaskChange(editingTask)} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700">บันทึก</button></div></div></div></div>}
      </div>
    );
  };

  const renderStrategy = () => (<div className="h-full flex flex-col"><PageHeader title="กระดานยุทธศาสตร์ 4 แกน" subtitle="Strategy Board & Tasks" action={<div className="flex gap-3"><div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200"><ArrowDownWideNarrow className="w-4 h-4 text-slate-500" /><select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer outline-none"><option value="newest">ล่าสุด (Newest)</option><option value="oldest">เก่าสุด (Oldest)</option><option value="deadline">ใกล้กำหนดส่ง (Deadline)</option></select></div><div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200"><Filter className="w-4 h-4 text-slate-500" /><select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer outline-none"><option value="All">All Tags</option>{allTags.filter(t=>t!=='All').map(tag => <option key={tag} value={tag}>{tag}</option>)}</select></div><button onClick={() => setHideDone(!hideDone)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold border transition ${hideDone ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-300'}`}>{hideDone ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />} {hideDone ? "Show Done" : "Hide Done"}</button></div>} /><div className="overflow-x-auto pb-4 flex-1 custom-scrollbar"><div className="flex flex-col md:flex-row gap-4 min-w-full md:min-w-[1200px] h-full">{['solver', 'principles', 'defender', 'expert', 'backoffice'].map((key) => (<div key={key} className={`w-full md:w-1/5 bg-white rounded-2xl p-4 border border-slate-200 flex flex-col shadow-sm`}><div className="mb-3 pb-2 border-b border-slate-100"><h3 className="font-black text-slate-800 text-sm uppercase tracking-wide truncate">{COLUMN_LABELS[key]}</h3><p className="text-[10px] text-slate-500 line-clamp-1">{COL_DESCRIPTIONS[key]}</p></div><div className="space-y-3 overflow-y-auto max-h-[60vh] pr-1 custom-scrollbar flex-1">{groupedTasks[key]?.filter(t => (!hideDone || t.status !== 'Done') && (filterTag === 'All' || t.tag === filterTag)).map(task => (<div key={task.id} onClick={() => setEditingTask(task)} className={`bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-400 transition-all cursor-pointer relative`}><div className="flex justify-between items-start mb-3"><span className={`text-[9px] font-bold uppercase text-blue-600 bg-blue-50 px-2 py-1 rounded-md`}>{task.tag}</span><StatusBadge status={task.status} /></div><h4 className="text-sm font-bold text-slate-800 mb-2 leading-snug">{task.title}</h4>{task.deadline && <div className="flex items-center gap-1.5 text-[10px] text-red-500 font-bold mt-3"><Clock className="w-3 h-3" /> {task.deadline}</div>}<div className="mt-2 pt-2 border-t border-slate-50 text-[9px] text-slate-400 flex flex-col gap-0.5"><span className="flex items-center gap-1"><User className="w-3 h-3" /> {task.role || task.createdBy}</span>{task.updatedBy && <span className="flex items-center gap-1 text-blue-400"><Edit2 className="w-3 h-3" /> {formatDate(task.updatedAt)}</span>}</div></div>))}<button onClick={() => addNewTask(key)} className="w-full py-3 text-sm text-slate-400 border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl hover:bg-blue-50 transition-all flex items-center justify-center gap-2 font-bold"><Plus className="w-4 h-4" /> เพิ่มงาน</button></div></div>))}</div></div>{editingTask && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn"><div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"><button onClick={() => setEditingTask(null)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button><h3 className="font-bold text-xl text-slate-800 mb-6">แก้ไขงาน</h3><div className="space-y-4"><input type="text" value={editingTask.title} onChange={e=>setEditingTask({...editingTask, title:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" /><div><input type="text" value={editingTask.tag} onChange={e=>setEditingTask({...editingTask, tag:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="Tag..." /><div className="mt-2 flex flex-wrap gap-2">{PRESET_TAGS.slice(0,5).map(t=><button key={t} onClick={()=>setEditingTask({...editingTask, tag:t})} className="text-[10px] bg-slate-100 px-2 py-1 rounded border hover:bg-blue-100">{t}</button>)}</div></div><input type="text" value={editingTask.role||""} onChange={e=>setEditingTask({...editingTask, role:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="ผู้รับผิดชอบ" /><div className="grid grid-cols-2 gap-4"><select value={editingTask.status} onChange={e=>setEditingTask({...editingTask, status:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm"><option>To Do</option><option>In Progress</option><option>In Review</option><option>Done</option><option>Idea</option><option>Waiting list</option><option>Canceled</option></select><input type="date" value={editingTask.deadline} onChange={e=>setEditingTask({...editingTask, deadline:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm" /></div><input type="text" value={editingTask.link} onChange={e=>setEditingTask({...editingTask, link:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="Link..." /><div className="flex justify-between pt-4"><button onClick={async()=>{if(confirm("ลบ?")){setIsGlobalLoading(true); await deleteDoc(doc(db,"tasks",editingTask.id)); logActivity("Delete Task", editingTask.title); setIsGlobalLoading(false); setEditingTask(null);}}} className="text-red-500 text-sm font-bold flex items-center gap-1"><Trash2 className="w-4 h-4"/> ลบ</button><button onClick={()=>saveTaskChange(editingTask)} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700">บันทึก</button></div></div></div></div>}</div>);
  
  const renderMasterPlan = () => (<div className="space-y-6"><PageHeader title="แผนงานหลัก (Master Plan)" subtitle="Long-term Roadmap" action={<button onClick={addPlan} className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2"><Plus className="w-4 h-4" /> สร้างแผนใหม่</button>} /><div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{plans.map((plan) => { const sortedItems = [...(plan.items || [])].map((item, idx) => ({ ...item, originalIndex: idx })).sort((a, b) => Number(a.completed) - Number(b.completed)); return (<div key={plan.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition"><div className="flex justify-between items-start mb-6"><div className="flex items-center gap-2 cursor-pointer" onClick={() => editPlanTitle(plan)}><h3 className="font-bold text-lg text-slate-800">{plan.title}</h3><Edit2 className="w-4 h-4 text-slate-300 hover:text-blue-600" /></div><button onClick={async () => { if(confirm("ลบแผนนี้?")) { await deleteDoc(doc(db, "plans", plan.id)); logActivity("Delete Plan", plan.title); }}} className="text-slate-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div><div className="mb-6"><div className="w-full bg-slate-100 rounded-full h-2.5"><div className="bg-blue-600 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${plan.progress || 0}%` }}></div></div></div><ul className="space-y-1">{sortedItems.map((item, idx) => (<li key={idx} className={`flex items-center justify-between gap-3 text-sm p-2 rounded-lg hover:bg-slate-50 transition ${item.completed ? 'opacity-50' : ''}`}><div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => togglePlanItem(plan.id, item.originalIndex, plan.items)}>{item.completed ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-slate-300" />}<span className={item.completed ? "line-through" : ""}>{item.text}</span></div><div className="flex gap-2 relative z-10"><button onClick={(e) => { e.stopPropagation(); editPlanItem(plan.id, item.originalIndex, plan.items); }}><Edit2 className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" /></button><button onClick={(e) => { e.stopPropagation(); removePlanItem(plan.id, item.originalIndex, plan.items); }}><Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-600" /></button></div></li>))}<li className="pt-2"><button onClick={() => openFormModal("เพิ่มรายการ", [{key:'text', label:'รายการ'}], async(d)=> { const newItems=[...(plan.items||[]), {text:d.text, completed:false}]; await updateDoc(doc(db,"plans",plan.id), {items:newItems, progress:Math.round((newItems.filter(i=>i.completed).length/newItems.length)*100)}); logActivity("Add Plan Item", d.text); })} className="w-full text-center text-xs text-blue-600 font-bold hover:bg-blue-50 py-2 rounded-lg transition border border-dashed border-blue-200">+ เพิ่มรายการ</button></li></ul></div>)})}</div></div>);
  const renderRapidResponse = () => (<div className="space-y-6"><PageHeader title="ปฏิบัติการด่วน" subtitle="Agile Response Unit" action={<button onClick={createUrgentCase} className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-red-700 shadow-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> เปิดเคสด่วน</button>} /><div className="flex flex-col lg:flex-row gap-6"><div className={`lg:w-1/3 bg-white rounded-2xl border border-slate-200 shadow-sm h-fit overflow-hidden`}><div className="p-4 bg-slate-50 font-bold text-slate-800 flex items-center gap-2 cursor-pointer" onClick={()=>setIsSopOpen(!isSopOpen)}><FileText className="w-5 h-5"/> SOP Guide (คู่มือ) <ChevronDown className={`ml-auto transform ${isSopOpen?'rotate-180':''}`}/></div>{isSopOpen && <div className="p-6 space-y-3 text-sm text-slate-600">{SOP_GUIDE.map((s,i)=><p key={i}>{s}</p>)}</div>}</div><div className="lg:w-2/3 space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{urgentTasks.map(task => (<div key={task.id} className="bg-white p-5 rounded-2xl border-l-[6px] border-red-500 shadow-sm hover:shadow-md cursor-pointer" onClick={() => setUrgentModal(task)}><div className="flex justify-between mb-3"><span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded animate-pulse">URGENT</span><StatusBadge status={task.status} /></div><h3 className="font-bold text-slate-800 mb-3 text-lg">{task.title}</h3>{task.deadline && <p className="text-xs text-slate-500 mb-4 flex gap-1"><Clock className="w-3.5 h-3.5"/> {task.deadline}</p>}<div className="pt-3 border-t border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Progress Checklist</p><div className="flex gap-1.5 h-2">{(task.sop && task.sop.length > 0 ? task.sop : Array(5).fill({done:false})).map((s, i) => (<div key={i} className={`flex-1 rounded-full transition-all ${s.done ? 'bg-green-500 shadow-sm' : 'bg-slate-200'}`}></div>))}</div></div></div>))}</div><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-4"><h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">Quick Contacts</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{media.filter(c=>c.active).map((c,i)=><div key={i} className="p-4 border rounded-xl flex justify-between group"><div className="flex flex-col"><p className="font-bold text-sm">{c.name}</p><div className="text-xs text-slate-500 flex flex-col gap-1 mt-1"><span>📞 {c.phone}</span><span>LINE: {c.line}</span></div></div><button onClick={(e)=>{e.stopPropagation(); editMedia(c)}} className="text-slate-300 hover:text-blue-600"><Edit2 className="w-4 h-4"/></button></div>)}</div><button onClick={() => navigateTo('assets')} className="text-xs text-blue-600 font-bold hover:underline mt-4 block w-full text-center border-t border-slate-100 pt-3">ดูรายชื่อทั้งหมด</button></div></div></div>{urgentModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl w-full max-w-lg p-6 relative"><button onClick={()=>setUrgentModal(null)} className="absolute top-4 right-4"><X className="w-6 h-6 text-slate-400"/></button><h3 className="text-xl font-bold text-red-600 mb-6">จัดการเคสด่วน</h3><div className="space-y-4"><input type="text" value={urgentModal.title} onChange={e=>setUrgentModal({...urgentModal, title:e.target.value})} className="w-full border-2 border-slate-200 rounded-xl p-3 font-bold" /><div className="bg-slate-50 p-4 rounded-xl border"><h4 className="font-bold mb-3">Checklist</h4>{(urgentModal.sop || DEFAULT_SOP).map((s,i)=><div key={i} className="flex gap-3 p-2 cursor-pointer" onClick={()=>{const newSop=[...(urgentModal.sop || DEFAULT_SOP)]; newSop[i] = { ...newSop[i], done: !newSop[i].done }; setUrgentModal({...urgentModal, sop:newSop})}}><div className={`w-5 h-5 rounded border flex items-center justify-center ${s.done?'bg-green-500 text-white':'bg-white'}`}>{s.done&&<CheckCircle2 className="w-3.5 h-3.5"/>}</div><span className={s.done?'line-through text-slate-400':''}>{s.text}</span></div>)}</div><div className="flex justify-between mt-6"><button onClick={async()=>{if(confirm("ปิดเคส?")){await deleteDoc(doc(db,"tasks",urgentModal.id)); logActivity("Close Case", urgentModal.title); setUrgentModal(null);}}} className="text-red-500 font-bold">ลบเคส</button><button onClick={()=>saveUrgentCase(urgentModal)} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold">บันทึก</button></div></div></div></div>}</div>);
  const renderAssets = () => (<div className="space-y-6"><PageHeader title="คลังข้อมูลสื่อ" subtitle="Media Assets" /><div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-2xl shadow-lg text-white flex justify-between items-center"><div><h3 className="text-2xl font-black mb-2">Google Drive</h3><p className="text-blue-100">พื้นที่เก็บไฟล์ต้นฉบับ</p></div><a href="https://drive.google.com/drive/folders/0AHTNNQ96Wgq-Uk9PVA" target="_blank" rel="noreferrer" className="bg-white text-blue-700 px-6 py-3 rounded-xl font-bold shadow-xl flex items-center gap-2"><ExternalLink className="w-5 h-5"/> เปิด Drive</a></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="flex justify-between mb-6"><h3 className="font-bold text-lg">Channels</h3><button onClick={addChannel} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold">+ เพิ่ม</button></div><div className="space-y-3">{channels.map(c=><div key={c.id} className="flex justify-between p-4 border rounded-xl hover:shadow-md cursor-pointer" onClick={()=>updateChannel(c)}><div><p className="font-bold text-slate-700">{c.name}</p><span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{c.type}</span></div><button onClick={(e)=>{e.stopPropagation(); deleteChannel(c.id)}}><Trash2 className="w-5 h-5 text-slate-300 hover:text-red-500"/></button></div>)}</div></div><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="flex justify-between mb-6"><h3 className="font-bold text-lg">Media List</h3><button onClick={addMedia} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold">+ เพิ่ม</button></div><div className="space-y-3 overflow-y-auto max-h-[500px]">{media.map(c=><div key={c.id} className="flex justify-between p-4 border rounded-xl hover:shadow-md"><div><p className="font-bold text-slate-700">{c.name}</p><div className="text-xs text-slate-500 mt-1 flex gap-2"><span>📞 {c.phone}</span><span>LINE: {c.line}</span></div></div><div className="flex gap-2"><button onClick={()=>editMedia(c)}><Edit2 className="w-4 h-4 text-slate-300 hover:text-blue-600"/></button><button onClick={()=>deleteMedia(c.id)}><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-500"/></button></div></div>)}</div></div></div></div>);

  // คัดลอกฟังก์ชันนี้ไปทับ renderNewsroom ตัวเดิมได้เลยครับ

  const renderNewsroom = () => {
    const usedTags = new Set(publishedLinks.flatMap(link => link.tags || []));
    systemTags.forEach(t => usedTags.add(t.name));
    const allNewsTags = ['All', ...Array.from(usedTags)].filter(Boolean);
    const tagColorMap = systemTags.reduce((acc, t) => ({ ...acc, [t.name]: t.color }), {});
    const getTagColor = (tagName) => tagColorMap[tagName] || '#64748b';

    let filteredLinks = publishedLinks;
    if (newsStartDate && newsEndDate) {
      const start = new Date(newsStartDate).setHours(0, 0, 0, 0);
      const end = new Date(newsEndDate).setHours(23, 59, 59, 999);
      filteredLinks = filteredLinks.filter(l => {
        if (!l.createdAt) return false;
        const dObj = l.createdAt.toDate ? l.createdAt.toDate() : new Date(l.createdAt);
        const d = dObj.getTime();
        return d >= start && d <= end;
      });
    }
    if (newsFilterTag !== 'All') {
      filteredLinks = filteredLinks.filter(link => (link.tags || []).includes(newsFilterTag));
    }

    const groupedData = {};
    filteredLinks.forEach(link => {
      if (!link.createdAt) return;
      const dateObj = link.createdAt.toDate ? link.createdAt.toDate() : new Date(link.createdAt);
      if (isNaN(dateObj.getTime())) return;
      const weekKey = `${getWeekNumber(dateObj)} (${dateObj.getFullYear()})`;
      const dayKey = dateObj.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
      if (!groupedData[weekKey]) groupedData[weekKey] = {};
      if (!groupedData[weekKey][dayKey]) groupedData[weekKey][dayKey] = [];
      groupedData[weekKey][dayKey].push(link);
    });

    return (
      <div className="space-y-6 animate-fadeIn pb-20 relative">
        <PageHeader title="ห้องข่าว & สื่อประชาสัมพันธ์" subtitle="Newsroom & Public Relations" action={
          <div className="flex flex-wrap items-end gap-3 bg-white p-2 rounded-xl border shadow-sm">
            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold ml-1">ตั้งแต่วันที่</span><input type="date" value={newsStartDate} onChange={e => setNewsStartDate(e.target.value)} className="text-xs border rounded-lg p-1.5 outline-none focus:border-blue-500 text-slate-600" /></div>
            <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold ml-1">ถึงวันที่</span><input type="date" value={newsEndDate} onChange={e => setNewsEndDate(e.target.value)} className="text-xs border rounded-lg p-1.5 outline-none focus:border-blue-500 text-slate-600" /></div>
            <button onClick={() => { setNewsStartDate(''); setNewsEndDate(''); setNewsFilterTag('All'); }} className="p-2 text-slate-400 hover:text-red-500" title="ล้างค่า"><RefreshCw className="w-4 h-4" /></button>
            <div className="w-px h-8 bg-slate-200 mx-1"></div>
            <button onClick={() => setIsTagManagerOpen(true)} className="bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-black shadow-md flex items-center gap-2 h-fit mb-0.5"><Tag className="w-3.5 h-3.5" /> จัดการ Tag</button>
            {/* ปุ่มเดิมข้างบนยังเก็บไว้ หรือจะลบออกก็ได้ครับ */}
            <button onClick={() => addPublishedLink()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-md flex items-center gap-2 h-fit mb-0.5"><Plus className="w-4 h-4" /> เพิ่มข่าว</button>
          </div>
        } />

        {/* --- ส่วนเนื้อหาข่าว --- */}
        <div className="w-full overflow-x-auto pb-2 custom-scrollbar -mt-2">
          <div className="flex items-center gap-2 min-w-max px-1">
            <Tag className="w-4 h-4 text-slate-400 mr-2" />
            {allNewsTags.map(tag => {
              const color = getTagColor(tag);
              const isActive = newsFilterTag === tag;
              return (
                <button key={tag} onClick={() => setNewsFilterTag(tag)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 border flex items-center gap-1.5 ${isActive ? 'text-white border-transparent shadow-md scale-105' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`} style={isActive ? { backgroundColor: tag === 'All' ? '#2563eb' : color } : {}}>
                  {tag !== 'All' && <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : ''}`} style={!isActive ? { backgroundColor: color } : {}}></div>}
                  {tag === 'All' ? 'ทั้งหมด' : tag}
                </button>
              );
            })}
          </div>
        </div>
        {Object.keys(groupedData).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400"><Globe className="w-12 h-12 mb-3 opacity-20" /><p>ไม่พบข้อมูลข่าว</p></div>
        ) : (
          Object.keys(groupedData).sort((a, b) => b.localeCompare(a)).map(week => (
            <div key={week} className="bg-white/50 rounded-3xl p-6 border border-slate-200/60 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 bg-blue-600 text-white text-xs font-black px-4 py-1.5 rounded-br-2xl shadow-sm z-10">{week}</div>
              <div className="space-y-8 mt-4">
                {Object.keys(groupedData[week]).sort((a, b) => {
                  const getLinkDate = (dayKey) => { const link = groupedData[week][dayKey][0]; return link.createdAt.toDate ? link.createdAt.toDate().getTime() : new Date(link.createdAt).getTime(); };
                  return getLinkDate(b) - getLinkDate(a);
                }).map(day => (
                  <div key={day}>
                    <h3 className="flex items-center gap-2 text-slate-700 font-bold mb-4 pb-2 border-b border-slate-200"><Calendar className="w-4 h-4 text-blue-500" /> {day}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {groupedData[week][day].map(link => (
                        <div key={link.id} className="group bg-white rounded-xl overflow-hidden border border-slate-100 hover:border-blue-300 hover:shadow-xl transition-all duration-300 flex flex-col h-full">
                          <div className="aspect-video bg-slate-100 relative overflow-hidden group-hover:shadow-inner">
                            {link.imageUrl ? <img src={`https://wsrv.nl/?url=${encodeURIComponent(link.imageUrl)}&w=400&q=75`} alt={link.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" onError={(e) => { e.target.onerror = null; if (e.target.src.includes('wsrv.nl')) { e.target.src = link.imageUrl; } else { e.target.src = "https://placehold.co/600x400?text=No+Image"; } }} /> : <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><FileText className="w-10 h-10 mb-1" /><span className="text-[10px]">No Image</span></div>}
                            <a href={link.url} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"><ExternalLink className="w-8 h-8 text-white drop-shadow-md" /></a>
                          </div>
                          <div className="p-4 flex flex-col flex-1">
                            <div className="flex flex-wrap gap-1 mb-2.5">
                              {(link.tags || []).map((tag, idx) => (
                                <span key={idx} className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm transition hover:opacity-80" style={{ backgroundColor: getTagColor(tag) }}>#{tag}</span>
                              ))}
                            </div>
                            <div className="flex justify-between items-start mb-2"><span className="bg-blue-50 text-blue-600 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">{link.platform || 'News'}</span><div className="flex gap-2 opacity-0 group-hover:opacity-100 transition"><button onClick={() => editPublishedLink(link)} className="text-slate-300 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => deleteLink(link.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></div></div>
                            <a href={link.url} target="_blank" rel="noreferrer" className="font-bold text-slate-800 text-sm leading-snug line-clamp-2 hover:text-blue-600 transition mb-2">{link.title}</a>
                            <div className="text-[10px] text-slate-400 font-medium mb-3 flex items-center gap-1"><LinkIcon className="w-3 h-3" />{getDomain(link.url)}</div>
                            <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400"><span>{formatDate(link.createdAt)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* 🟢 🟢 🟢 ส่วนที่เพิ่มใหม่: ปุ่ม Floating Button ลอยอยู่ขวาล่าง 🟢 🟢 🟢 */}
        <button
          onClick={() => addPublishedLink()}
          className="fixed bottom-8 right-8 z-[50] bg-blue-600 text-white w-14 h-14 rounded-full shadow-2xl hover:bg-blue-700 hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center group"
          title="เพิ่มข่าวประชาสัมพันธ์"
          style={{ boxShadow: '0 4px 20px rgba(37, 99, 235, 0.5)' }} // เพิ่มแสงเงาให้ดูเด่น
        >
          <Plus className="w-8 h-8" />
          {/* Tooltip เล็กๆ เวลาชี้ */}
          <span className="absolute right-16 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            เพิ่มข่าวใหม่
          </span>
        </button>
        
        <TagManagerModal isOpen={isTagManagerOpen} onClose={() => setIsTagManagerOpen(false)} existingTags={systemTags} onSave={saveSystemTags} />
      </div>
    );
  };

  const renderContent = () => {
    if (isDataLoading) return <div className="flex h-64 items-center justify-center text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mr-2"/> Loading Database...</div>;
    switch (activeTab) {
      case 'dashboard': return renderDashboard();
      case 'admin':
        if(userProfile?.role !== 'Admin') return <div className="p-10 text-center text-red-500">Access Denied</div>;
        return (
          <div className="space-y-6 animate-fadeIn">
              <PageHeader title="ผู้ดูแลระบบ (Admin)" subtitle="User Management & System Logs" />
              <div className="flex flex-col lg:flex-row gap-6">
                 <div className="w-full lg:w-1/2 space-y-6">
                     <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                         <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Users className="w-5 h-5"/> สมาชิก ({usersList.length})</h3>
                         <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                             {usersList.map(u => (
                                 <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                                     <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">{u.displayName?.[0] || "U"}</div><div><p className="text-sm font-bold">{u.displayName || u.email}</p><p className="text-xs text-slate-500">{u.email} • {u.role}</p></div></div>
                                     <div className="flex gap-2">{u.status === 'Pending' && <button onClick={()=>updateUserStatus(u.id, 'Active', 'Member')} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-bold hover:bg-green-200">อนุมัติ</button>}{u.role !== 'Admin' && <button onClick={()=>updateUserStatus(u.id, 'Active', 'Admin')} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-bold hover:bg-blue-200">ตั้งเป็น Admin</button>}</div>
                                 </div>
                             ))}
                         </div>
                     </div>
                 </div>
                 <div className="w-full lg:w-1/2 bg-slate-900 text-slate-300 p-6 rounded-xl border border-slate-800 shadow-sm h-fit">
                     <h3 className="font-bold text-white mb-4 flex items-center gap-2"><FileClock className="w-5 h-5"/> Activity Logs</h3>
                     <div className="space-y-2 text-xs font-mono max-h-96 overflow-y-auto custom-scrollbar">
                         {activityLogs.map(log => (
                             <div key={log.id} className="border-b border-slate-800 pb-2 mb-2 last:border-0"><span className="text-slate-500">{log.createdAt ? formatDate(log.createdAt) : '-'}</span><p className="text-white font-bold mt-0.5">[{log.user}] {log.action}</p><p className="opacity-70">{log.details}</p></div>
                         ))}
                     </div>
                 </div>
              </div>
          </div>
        );
      case 'strategy': return renderStrategy();
      case 'masterplan': return renderMasterPlan();
      case 'rapidresponse': return renderRapidResponse();
      case 'assets': return renderAssets();
      case 'newsroom': return renderNewsroom();
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row">
      <LoadingOverlay isOpen={isGlobalLoading} />
      <FormModal {...formModalConfig} onClose={() => setFormModalConfig(prev => ({ ...prev, isOpen: false }))} />
      <SearchModal isOpen={isSearchOpen} onClose={()=>setIsSearchOpen(false)} data={{tasks, media, channels}} onNavigate={navigateTo} />
      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} userProfile={userProfile} onUpdate={handleUpdateProfile} />
      <aside className={`bg-slate-900 text-white w-full md:w-64 flex-shrink-0 transition-all duration-300 fixed md:sticky top-0 z-30 h-screen ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} flex flex-col`}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center"><div><h1 className="text-xl font-black tracking-wider text-white">TEAM TAWEE</h1><p className="text-[10px] text-blue-400 font-bold tracking-widest uppercase mt-1">Stand Together</p></div><button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400"><X /></button></div>
        <nav className="p-4 space-y-2 overflow-y-auto flex-1">{navItems.map(item => (<button key={item.id} onClick={() => navigateTo(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-left ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg translate-x-1' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><item.icon className={`w-5 h-5 flex-shrink-0 ${item.color || ''}`} /><div className="flex flex-col"><span className="font-bold text-sm leading-tight">{item.title}</span><span className="text-[10px] opacity-80 font-medium">({item.subtitle})</span></div></button>))}</nav>
        <div className="p-4 border-t border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => setShowProfileModal(true)}><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden border-2 border-slate-700">{currentUser?.photoURL ? <img src={currentUser.photoURL} alt="User" className="w-full h-full object-cover" /> : <span className="font-bold text-white">{currentUser?.displayName?.[0] || "U"}</span>}</div><div className="overflow-hidden"><p className="text-sm font-bold truncate">{currentUser?.displayName || "User"}</p><p className="text-[10px] text-slate-400">Edit Profile</p></div></div></div>
      </aside>
      <main className="flex-1 md:ml-0 min-h-screen overflow-y-auto w-full">
        <div className="md:hidden bg-white p-4 flex justify-between items-center shadow-sm sticky top-0 z-20 border-b border-slate-100"><div><h2 className="font-black text-slate-900">TEAM TAWEE</h2><p className="text-[10px] text-slate-500">Stand Together</p></div><button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-100 rounded-lg"><Menu className="text-slate-600 w-5 h-5" /></button></div>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">{renderContent()}</div>
      </main>
    </div>
  );
}