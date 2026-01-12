import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from './firebaseConfig';
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, setDoc, getDoc, 
  serverTimestamp, writeBatch, getDocs, where, onSnapshot, arrayUnion 
} from 'firebase/firestore';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { 
  LayoutDashboard, Megaphone, Map as MapIcon, Zap, Database, Users, Menu, X, Activity, 
  Calendar, CheckCircle2, Circle, Clock, ExternalLink, FileText, Plus, Link as LinkIcon, 
  Trash2, Edit2, ChevronDown, ChevronUp, Filter, RefreshCw, LogOut, Lock, AlertTriangle, 
  Globe, Loader2, Tag, Search, Shield, FileClock, ArrowDownWideNarrow, User, Download, FileDown
} from 'lucide-react';

// --- IMPORTS FROM SUB-FILES ---
import { LoginScreen } from './LoginScreen.jsx';
import { LoadingOverlay, PageHeader, StatusBadge, StatusDonutChart } from './UI.jsx';
import { TagManagerModal, SearchModal, FormModal, ProfileModal } from './Modals.jsx';
import { formatDate, getWeekNumber, getDomain, formatForInput, fetchLinkMetadata } from './utils.js';
import { PRESET_TAGS, ASSET_TYPES, TASK_STATUSES, DEFAULT_SOP, SOP_GUIDE, COLUMN_LABELS, COL_DESCRIPTIONS } from './constants.js';

// --- Multi-select Tag Component ---
const MultiTagSelector = ({ availableTags, selectedTags, onTagsChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  const filteredTags = availableTags.filter(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()) && !selectedTags.includes(tag));

  const toggleTag = (tag) => onTagsChange(selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]);

  const handleAddNewTag = () => {
    const newTag = searchTerm.trim();
    if (newTag && !availableTags.includes(newTag) && !selectedTags.includes(newTag)) {
      onTagsChange([...selectedTags, newTag]);
      setSearchTerm('');
    }
  };
   
  useEffect(() => {
    const handleClickOutside = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-sm font-bold text-slate-600 mb-2 block">Tags</label>
      <div className="w-full border-2 border-slate-200 rounded-lg p-2 flex flex-wrap gap-2 items-center cursor-text min-h-[44px]" onClick={() => {setIsOpen(true); dropdownRef.current.querySelector('input').focus();}}>
        {selectedTags.map(tag => (
          <span key={tag} className="bg-blue-500 text-white px-2 py-1 rounded-md text-xs flex items-center gap-1.5 animate-fadeIn">
            {tag} <button onClick={(e) => { e.stopPropagation(); toggleTag(tag); }} className="text-white/70 hover:text-white"><X className="w-3 h-3" /></button>
          </span>
        ))}
        <input type="text" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); if (!isOpen) setIsOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleAddNewTag(); }
            else if (e.key === 'Backspace' && searchTerm === '' && selectedTags.length > 0) toggleTag(selectedTags[selectedTags.length - 1]);
          }}
          className="flex-grow outline-none bg-transparent text-sm p-1" placeholder={selectedTags.length === 0 ? 'เพิ่ม Tag...' : ''} onFocus={() => setIsOpen(true)}
        />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-full bg-white border border-slate-300 mt-1 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {filteredTags.map(tag => <div key={tag} onClick={() => toggleTag(tag)} className="px-4 py-2 hover:bg-slate-100 cursor-pointer text-sm">{tag}</div>)}
          {searchTerm && !availableTags.map(t=>t.toLowerCase()).includes(searchTerm.trim().toLowerCase()) && (
            <div onClick={handleAddNewTag} className="px-4 py-2 hover:bg-blue-100 cursor-pointer text-sm font-bold text-blue-600">+ สร้าง Tag ใหม่ "{searchTerm.trim()}"</div>
          )}
        </div>
      )}
    </div>
  );
};

// --- NewsTagSelector ---
const NewsTagSelector = ({ availableTags, selectedTags, onTagsChange, systemTagColors }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const tagList = availableTags.map(t => typeof t === 'string' ? {name: t} : t);

  const getTagColor = (name) => tagList.find(t => t.name === name)?.color || systemTagColors?.[name] || '#64748b';
  const handleAddTag = (tagName) => { if (!selectedTags.includes(tagName)) onTagsChange([...selectedTags, tagName]); setSearchTerm(''); };
  const handleRemoveTag = (tagName) => onTagsChange(selectedTags.filter(t => t !== tagName));
  const handleCreateTag = () => { if (searchTerm.trim() && !selectedTags.includes(searchTerm.trim())) { onTagsChange([...selectedTags, searchTerm.trim()]); setSearchTerm(''); }};

  const suggestions = tagList.filter(t => !selectedTags.includes(t.name) && t.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-3">
        <label className="text-sm font-bold text-slate-600 block">Tags (หมวดหมู่ข่าว)</label>
        <div className="relative">
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag(); }}}
                className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500 pl-9" placeholder="ค้นหา หรือ พิมพ์เพื่อเพิ่ม Tag ใหม่..." />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            {searchTerm && !tagList.some(t => t.name.toLowerCase() === searchTerm.toLowerCase().trim()) && (
                <button onClick={handleCreateTag} className="absolute right-2 top-2 bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-md font-bold hover:bg-indigo-200">+ เพิ่ม "{searchTerm}"</button>
            )}
        </div>
        {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-xs text-slate-400 font-bold w-full mb-1">ที่เลือกไว้:</span>
                {selectedTags.map(tag => (
                    <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-2 transition hover:scale-105" style={{ backgroundColor: getTagColor(tag) }}>
                        {tag} <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-200 bg-black/10 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                    </span>
                ))}
            </div>
        )}
        <div className="mt-2">
            <p className="text-xs text-slate-400 mb-2">คลิกเพื่อเพิ่ม Tag:</p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                {suggestions.map(tag => (
                    <button key={tag.name} onClick={() => handleAddTag(tag.name)} className="px-3 py-1 rounded-full text-xs border border-slate-300 text-slate-600 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition bg-white">+ {tag.name}</button>
                ))}
                {suggestions.length === 0 && searchTerm === '' && <span className="text-xs text-slate-300 italic">เลือกครบแล้ว</span>}
            </div>
        </div>
    </div>
  );
};

// --- MAIN APP ---
export default function TeamTaweeApp() {
  // --- STATE: Auth & User ---
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- STATE: UI & Navigation ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // --- STATE: Data Collections ---
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [media, setMedia] = useState([]);
  const [channels, setChannels] = useState([]); 
  const [publishedLinks, setPublishedLinks] = useState([]); 
  const [usersList, setUsersList] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  // --- STATE: Filters & Controls ---
  const [hideDone, setHideDone] = useState(false);
  const [filterTag, setFilterTag] = useState('All');
  const [sortOrder, setSortOrder] = useState('newest'); 
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // --- STATE: Newsroom & Tags ---
  const [newsStartDate, setNewsStartDate] = useState('');
  const [newsEndDate, setNewsEndDate] = useState('');
  const [newsFilterTag, setNewsFilterTag] = useState('All'); 
  const [systemTags, setSystemTags] = useState([]);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [strategyTags, setStrategyTags] = useState([]); 
  const [isStrategyTagManagerOpen, setIsStrategyTagManagerOpen] = useState(false);

  // --- STATE: Modals ---
  const [newsModal, setNewsModal] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [urgentModal, setUrgentModal] = useState(null); 
  const [formModalConfig, setFormModalConfig] = useState({ isOpen: false, title: '', fields: [], onSave: () => {} });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isSopOpen, setIsSopOpen] = useState(false); 

  // --- MEMOS ---
  const strategyBoardAllTags = useMemo(() => {
    const all = new Set(['All', ...PRESET_TAGS]);
    if (strategyTags) strategyTags.forEach(t => all.add(t.name));
    tasks.forEach(t => {
      if (Array.isArray(t.tags)) t.tags.forEach(tag => all.add(tag));
      else if (t.tag) t.tag.split(',').map(s => s.trim()).filter(Boolean).forEach(tag => all.add(tag));
    });
    return Array.from(all).filter(Boolean);
  }, [tasks, strategyTags]);

  const tagsForStrategyManager = useMemo(() => {
    const savedMap = new Map(strategyTags.map(t => [t.name, t]));
    return strategyBoardAllTags.filter(t => t !== 'All').map(tagName => savedMap.get(tagName) || { name: tagName, color: '#64748b' });
  }, [strategyTags, strategyBoardAllTags]);

  // --- UTILS & DATA FETCHING ---
  const navigateTo = (tabId) => { if (activeTab !== tabId) { setActiveTab(tabId); window.history.pushState({ tab: tabId }, '', `#${tabId}`); setIsMobileMenuOpen(false); }};
  const logActivity = async (action, details) => { try { await addDoc(collection(db, "logs"), { action, details, user: currentUser.displayName || currentUser.email, createdAt: serverTimestamp() }); } catch(e) {} };

  const refreshData = async () => {
    if (!currentUser) return;
    setIsDataLoading(true); 
    try {
        const [plansS, mediaS, chanS, linkS, setS, stratS] = await Promise.all([
            getDocs(collection(db, "plans")), getDocs(collection(db, "media")), getDocs(collection(db, "channels")),
            getDocs(query(collection(db, "published_links"), orderBy("createdAt", "desc"))),
            getDoc(doc(db, "settings", "news_config")), getDoc(doc(db, "settings", "strategy_config"))
        ]);
        setPlans(plansS.docs.map(d => ({ id: d.id, ...d.data() })));
        setMedia(mediaS.docs.map(d => ({ id: d.id, ...d.data() })));
        setChannels(chanS.docs.map(d => ({ id: d.id, ...d.data() })));
        setPublishedLinks(linkS.docs.map(d => ({ id: d.id, ...d.data() })));
        if (setS.exists()) setSystemTags(setS.data().tags || []);
        if (stratS.exists()) setStrategyTags(stratS.data().tags || []);

        if (userProfile?.role === 'Admin') {
            const [usersS, logsS] = await Promise.all([getDocs(collection(db, "user_profiles")), getDocs(query(collection(db, "logs"), orderBy("createdAt", "desc")))]);
            setUsersList(usersS.docs.map(d => ({ id: d.id, ...d.data() })));
            setActivityLogs(logsS.docs.map(d => ({ id: d.id, ...d.data() })));
        }
    } catch (e) { console.error("Fetch Error:", e); }
    setTimeout(() => setIsDataLoading(false), 500); 
  };

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const snap = await getDoc(doc(db, "user_profiles", user.uid));
        if (snap.exists()) setUserProfile(snap.data());
      } else setUserProfile(null);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => { if (currentUser) refreshData(); }, [currentUser, userProfile]);

  useEffect(() => {
    if (!currentUser) return; 
    const unsub = onSnapshot(query(collection(db, "tasks")), (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [currentUser]); 

  // --- ACTIONS: Common ---
  const handleUpdateProfile = async (n, p, ph) => { if(!currentUser)return; setIsGlobalLoading(true); try{ await updateProfile(currentUser, {displayName:n, photoURL:p}); await setDoc(doc(db,"user_profiles",currentUser.uid), {phone:ph}, {merge:true}); setCurrentUser({...currentUser, displayName:n, photoURL:p}); setUserProfile(prev=>({...prev, phone:ph})); refreshData(); }catch(e){alert(e.message);} setIsGlobalLoading(false); };
  const openFormModal = (title, fields, onSave, submitText, extraProps = {}) => setFormModalConfig({ isOpen:true, title, fields, onSave: async(d)=>{ setIsGlobalLoading(true); try{await onSave(d); setFormModalConfig(p=>({...p, isOpen:false})); refreshData(); }catch(e){alert(e.message);} setIsGlobalLoading(false); }, submitText, ...extraProps });

  // --- ACTIONS: Tags & Tasks ---
  const saveSystemTags = async (newTags, renames) => {
    setIsGlobalLoading(true);
    try {
        await setDoc(doc(db, "settings", "news_config"), { tags: newTags }, { merge: true });
        if (renames?.length) {
            const batch = writeBatch(db);
            for (const { oldName, newName } of renames) {
                if (oldName === newName) continue;
                (await getDocs(query(collection(db, "published_links"), where("tags", "array-contains", oldName)))).forEach(ds => {
                   batch.update(doc(db, "published_links", ds.id), { tags: (ds.data().tags || []).map(t => t === oldName ? newName : t) });
                });
            }
            if (batch.count > 0) await batch.commit();
        }
        setIsTagManagerOpen(false); refreshData();
    } catch (e) { alert("Error: " + e.message); }
    setIsGlobalLoading(false);
  };

  const saveStrategyTags = async (newTags, renames) => {
    setIsGlobalLoading(true);
    try {
        await setDoc(doc(db, "settings", "strategy_config"), { tags: newTags }, { merge: true });
        if (renames?.length) {
            const batch = writeBatch(db);
            for (const { oldName, newName } of renames) {
                if (oldName === newName) continue;
                (await getDocs(query(collection(db, "tasks"), where("tags", "array-contains", oldName)))).forEach(ds => {
                    const updatedTags = (ds.data().tags || []).map(t => t === oldName ? newName : t);
                    batch.update(ds.ref, { tags: updatedTags, tag: updatedTags.join(', ') });
                });
            }
            await batch.commit();
        }
        setIsStrategyTagManagerOpen(false); setStrategyTags(newTags); 
    } catch (e) { alert("Error: " + e.message); }
    setIsGlobalLoading(false);
  };

  const saveTaskChange = async (task) => {
    if (!task.id) return;
    setIsGlobalLoading(true);
    try {
      const finalTags = (task.tags || []).filter(Boolean).map(t => t.trim());
      await updateDoc(doc(db, "tasks", task.id), { title: task.title||"", status: task.status||"To Do", tags: finalTags, tag: finalTags.join(', '), role: task.role||"", link: task.link||"", deadline: task.deadline||"", updatedBy: currentUser.displayName, updatedAt: new Date().toISOString() });
      logActivity("Edit Task", task.title); setEditingTask(null);
    } catch (e) { alert(e.message); }
    setIsGlobalLoading(false);
  };

  const saveUrgentCase = async (task) => { if(!task.id)return; setIsGlobalLoading(true); try{ await updateDoc(doc(db,"tasks",task.id), {title:task.title||"", status:task.status||"To Do", link:task.link||"", sop:task.sop||[], updatedBy:currentUser.displayName, updatedAt:new Date().toISOString()}); logActivity("Update Urgent", task.title); setUrgentModal(null); refreshData(); }catch(e){alert(e.message);} setIsGlobalLoading(false); };
  const addNewTask = (key, owner = 'tawee') => openFormModal("เพิ่มงานใหม่", [{key:'title', label:'ชื่องาน'}, {key:'tags', label:'Tag', type:'multiselect-dropdown', options: strategyBoardAllTags.filter(t=>t!=='All'), defaultValue: []}, {key:'role', label:'ผู้รับผิดชอบ', defaultValue: currentUser.displayName}, {key:'status', label:'สถานะ', type:'select', options: TASK_STATUSES}, {key:'deadline', label:'กำหนดส่ง', type:'date'}, {key:'link', label:'Link ผลงาน'}], async(d)=>{ 
      const tagsArray = d.tags || []; 
      await addDoc(collection(db,"tasks"), { 
          ...d, 
          tags: tagsArray, 
          tag: tagsArray.join(', '), 
          role: d.role || currentUser.displayName, 
          status:d.status||"To Do", 
          link:d.link||"", 
          columnKey:key, 
          owner: owner, // บันทึกว่างานนี้เป็นของใคร
          createdBy:currentUser.displayName, 
          createdAt:new Date().toISOString() 
      }); 
      logActivity("Add Task", d.title); refreshData(); 
  }, "สร้างงาน", { availableTags: strategyBoardAllTags.filter(t=>t!=='All') });

  // --- ACTIONS: Assets & Links ---
  const addChannel = () => openFormModal("เพิ่มช่องทาง", [{key:'name', label:'ชื่อ'}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:'Own media'}, {key:'url', label:'URL'}], async(d)=>{ await addDoc(collection(db,"channels"), {...d, count:0}); logActivity("Add Channel", d.name); refreshData(); });
  const updateChannel = (c) => openFormModal("แก้ไขช่องทาง", [{key:'name', label:'ชื่อ', defaultValue:c.name}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:c.type}, {key:'url', label:'URL', defaultValue:c.url}], async(d)=>{ await updateDoc(doc(db,"channels",c.id), d); logActivity("Edit Channel", c.name); refreshData(); });
  const addMedia = () => openFormModal("เพิ่มสื่อ", [{key:'name', label:'ชื่อ'}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:'NEWS Website'}, {key:'phone', label:'เบอร์'}, {key:'line', label:'Line'}], async(d)=>{ await addDoc(collection(db,"media"), {...d, active:true}); logActivity("Add Media", d.name); refreshData(); });
  const editMedia = (c) => openFormModal("แก้ไขสื่อ", [{key:'name', label:'ชื่อ', defaultValue:c.name}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:c.type}, {key:'phone', label:'เบอร์', defaultValue:c.phone}, {key:'line', label:'Line', defaultValue:c.line}], async(d)=>{ await updateDoc(doc(db,"media",c.id), d); logActivity("Edit Media", c.name); refreshData(); });
  const deleteLink = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"published_links",id)); logActivity("Delete Link", id); refreshData(); }};
  const deleteChannel = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"channels",id)); logActivity("Delete Channel", id); refreshData(); }};
  const deleteMedia = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"media",id)); logActivity("Delete Media", id); refreshData(); }};
  const deleteTask = async (id) => { 
    if(confirm("ต้องการลบงานนี้ใช่หรือไม่?")) { 
      try {
        await deleteDoc(doc(db, "tasks", id)); 
        logActivity("Delete Task", id); 
      } catch (e) { alert(e.message); }
    }
  };

  const addPublishedLink = async (owner = 'tawee') => {
    const urlInput = prompt("กรุณาวาง Link ข่าวที่ต้องการเพิ่ม:"); if (!urlInput) return;
    setIsGlobalLoading(true);
    let meta = { title: "", image: "", date: "" };
    try { meta = await fetchLinkMetadata(urlInput) || meta; } catch (e) { alert("ดึงข้อมูลอัตโนมัติไม่สำเร็จ แต่คุณยังกรอกเองได้ครับ"); }
    setIsGlobalLoading(false);
    setNewsModal({ isOpen: true, isEdit: false, owner: owner, data: { url: urlInput, title: meta.title||"", imageUrl: meta.image||"", platform: 'Website', customDate: formatForInput(meta.date || new Date()), tags: [] }});
  };

  const editPublishedLink = (link) => setNewsModal({ isOpen: true, isEdit: true, data: { ...link, customDate: formatForInput(link.createdAt), tags: link.tags || [] } });

  const saveNewsItem = async () => {
      if (!newsModal?.data) return;
      setIsGlobalLoading(true);
      try {
          const d = newsModal.data;
          const finalDate = d.customDate ? new Date(d.customDate) : new Date();
          const baseData = { 
            title: d.title||"No Title", 
            url: d.url||"", 
            imageUrl: d.imageUrl||"", 
            platform: d.platform||"Website", 
            tags: d.tags||[],
            owner: newsModal.owner || d.owner || 'tawee' // เพิ่มฟิลด์เจ้าของข่าว
          };
          
          if (newsModal.isEdit) {
              await updateDoc(doc(db, "published_links", d.id), { ...baseData, createdAt: finalDate, updatedAt: serverTimestamp() });
              logActivity("Edit Link", d.title);
          } else {
              await addDoc(collection(db, "published_links"), { ...baseData, createdBy: currentUser.displayName, createdAt: finalDate });
              logActivity("Add Link", d.title);
          }
          setNewsModal(null); refreshData();
      } catch (e) { alert("Error: " + e.message); }
      setIsGlobalLoading(false);
  };

  // --- ACTIONS: Plans & Others ---
  const togglePlanItem = async (pid, idx, items) => { const newItems = [...items]; newItems[idx].completed = !newItems[idx].completed; await updateDoc(doc(db,"plans",pid), {items:newItems, progress: Math.round((newItems.filter(i=>i.completed).length/newItems.length)*100)}); refreshData(); };
  const removePlanItem = async (pid, idx, items) => { if(confirm("ลบ?")) { const newItems = items.filter((_,i)=>i!==idx); await updateDoc(doc(db,"plans",pid), {items:newItems, progress: Math.round((newItems.filter(i=>i.completed).length/newItems.length)*100)||0}); refreshData(); }};
  const editPlanItem = (pid, idx, items) => openFormModal("แก้รายการ", [{key:'text', label:'ข้อความ', defaultValue:items[idx].text}], async(d)=> { const newItems=[...items]; newItems[idx].text=d.text; await updateDoc(doc(db,"plans",pid), {items:newItems}); refreshData(); });
  const editPlanTitle = (p) => openFormModal("แก้ชื่อแผน", [{key:'title', label:'ชื่อ', defaultValue:p.title}], async(d)=> { await updateDoc(doc(db,"plans",p.id), d); refreshData(); });
  const addPlan = () => openFormModal("สร้างแผนใหม่", [{key:'title', label:'ชื่อแผน'}], async(d)=> { await addDoc(collection(db,"plans"), {...d, progress:0, items:[]}); logActivity("Create Plan", d.title); refreshData(); });
  const createUrgentCase = () => openFormModal("เปิดเคสด่วน", [{key:'title', label:'หัวข้อ'}, {key:'deadline', label:'เสร็จภายใน', type:'date'}], async(d) => { await addDoc(collection(db,"tasks"), { ...d, status:"To Do", role:"Hunter", tag:"Urgent", link:"", columnKey:"defender", sop:DEFAULT_SOP, createdBy:currentUser.displayName, createdAt:new Date().toISOString() }); alert("เปิดเคสแล้ว!"); logActivity("Open Urgent", d.title); refreshData(); });
  const updateUserStatus = (uid, status, role) => { updateDoc(doc(db, "user_profiles", uid), { status, role }); logActivity("Admin Update", `${uid} -> ${status}`); refreshData(); };

  // --- RENDERING HELPERS ---
  const sortTasks = (taskList) => {
    if(!taskList) return [];
    return [...taskList].sort((a, b) => {
       const timeA = a.deadline ? new Date(a.deadline).getTime() : 0;
       const timeB = b.deadline ? new Date(b.deadline).getTime() : 0;
       return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
  };

  const groupedTasks = { solver: sortTasks(tasks.filter(t => t.columnKey === 'solver')), principles: sortTasks(tasks.filter(t => t.columnKey === 'principles')), defender: sortTasks(tasks.filter(t => t.columnKey === 'defender')), expert: sortTasks(tasks.filter(t => t.columnKey === 'expert')), backoffice: sortTasks(tasks.filter(t => t.columnKey === 'backoffice')) };
  const urgentTasks = tasks.filter(t => t.tag === 'Urgent');
   
  const navItems = [
    { id: 'dashboard', title: 'ภาพรวม', subtitle: 'Dashboard', icon: LayoutDashboard },
    { id: 'newsroom_tawee', title: 'ห้องข่าว ท่านทวี', subtitle: 'พ.ต.อ.ทวี สอดส่อง', icon: Globe, color: 'text-indigo-500' }, 
    { id: 'newsroom_ravit', title: 'ห้องข่าว คุณรวิศ', subtitle: 'คุณรวิศ สอดส่อง', icon: Globe, color: 'text-blue-500' },
    
    // --- จุดที่แก้ไข: ลบอันเก่าทิ้ง แล้วใส่อันใหม่ 2 อันนี้แทน ---
    { id: 'strategy_tawee', title: 'กระดาน 4 แกน (ท่านทวี)', subtitle: 'Strategy Tawee', icon: Megaphone, color: 'text-indigo-600' },
    { id: 'strategy_ravit', title: 'กระดาน 4 แกน (คุณรวิศ)', subtitle: 'Strategy Ravit', icon: Megaphone, color: 'text-blue-500' },
    // --------------------------------------------------------

    { id: 'masterplan', title: 'แผนงานหลัก', subtitle: 'Master Plan', icon: MapIcon }, 
    { id: 'rapidresponse', title: 'ปฏิบัติการด่วน', subtitle: 'Agile Response Unit', icon: Zap, color: 'text-red-500' },
    { id: 'assets', title: 'คลังข้อมูลสื่อ', subtitle: 'Media Assets', icon: Database },
  ];
  if(userProfile?.role === 'Admin') navItems.push({ id: 'admin', title: 'ผู้ดูแลระบบ', subtitle: 'Admin & Logs', icon: Shield });

  const getInitials = (name) => {
    if (!name) return '';
    const parts = name.trim().split(' ').filter(Boolean);
    return parts.length === 1 ? parts[0].substring(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // แทนที่ฟังก์ชัน renderDashboard เดิมด้วยอันนี้
  const renderDashboard = () => {
    return (
      <div className="space-y-8 animate-fadeIn">
        <PageHeader 
          title="ศูนย์รวมข่าวสาร (News Center)" 
          subtitle="Real-time News Monitoring" 
          action={
            <div className="flex gap-2">
              <button onClick={() => addPublishedLink('tawee')} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"> 
                <Plus className="w-4 h-4" /> ข่าวท่านทวี 
              </button>
              <button onClick={() => addPublishedLink('ravit')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"> 
                <Plus className="w-4 h-4" /> ข่าวคุณรวิศ 
              </button>
            </div>
          } 
        />

        {/* --- ส่วนที่ 1: ข่าวประชาสัมพันธ์ (ท่านทวี) --- */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-50">
            <h3 className="font-black text-xl text-slate-800 flex items-center gap-3">
              <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                <Globe className="w-6 h-6"/>
              </div>
              ข่าวประชาสัมพันธ์ (ท่านทวี)
            </h3>
            <button onClick={() => navigateTo('newsroom_tawee')} className="text-sm text-indigo-600 font-bold hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
              ดูทั้งหมด &rarr;
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {publishedLinks
              .filter(link => (link.owner || 'tawee') === 'tawee')
              .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
              .slice(0, 10) // เพิ่มจำนวนแสดงผลเป็น 10 ข่าว
              .map(link => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="group bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-400 hover:shadow-xl transition-all duration-300 flex flex-col h-full">
                  <div className="aspect-video bg-slate-100 relative overflow-hidden">
                    {link.imageUrl ? (
                      <img src={`https://wsrv.nl/?url=${encodeURIComponent(link.imageUrl)}&w=400&q=75`} alt={link.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/600x400?text=No+Image"; }} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                        <FileText className="w-8 h-8 mb-1"/>
                        <span className="text-[10px]">No Image</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase mb-2 tracking-wide">{link.platform || 'News'}</span>
                    <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-3 mb-3 group-hover:text-indigo-600 transition">{link.title}</h4>
                    <div className="mt-auto pt-3 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1"><LinkIcon className="w-3 h-3" /> {getDomain(link.url)}</div>
                      <div className="flex items-center gap-1"><Clock className="w-3 h-3"/> {link.createdAt ? formatDate(link.createdAt).split(' ')[0] : '-'}</div>
                    </div>
                  </div>
                </a>
              ))}
              {publishedLinks.filter(link => (link.owner || 'tawee') === 'tawee').length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-400 bg-slate-50 rounded-xl border-dashed border-2 border-slate-200">
                  ไม่พบข้อมูลข่าว
                </div>
              )}
          </div>
        </div>

        {/* --- ส่วนที่ 2: ข่าวประชาสัมพันธ์ (คุณรวิศ) --- */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-50">
            <h3 className="font-black text-xl text-slate-800 flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                <Globe className="w-6 h-6"/>
              </div>
              ข่าวประชาสัมพันธ์ (คุณรวิศ)
            </h3>
            <button onClick={() => navigateTo('newsroom_ravit')} className="text-sm text-blue-600 font-bold hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
              ดูทั้งหมด &rarr;
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {publishedLinks
              .filter(link => link.owner === 'ravit')
              .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
              .slice(0, 10) // เพิ่มจำนวนแสดงผลเป็น 10 ข่าว
              .map(link => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="group bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-blue-400 hover:shadow-xl transition-all duration-300 flex flex-col h-full">
                  <div className="aspect-video bg-slate-100 relative overflow-hidden">
                    {link.imageUrl ? (
                      <img src={`https://wsrv.nl/?url=${encodeURIComponent(link.imageUrl)}&w=400&q=75`} alt={link.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/600x400?text=No+Image"; }} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                        <FileText className="w-8 h-8 mb-1"/>
                        <span className="text-[10px]">No Image</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <span className="text-[10px] font-bold text-blue-500 uppercase mb-2 tracking-wide">{link.platform || 'News'}</span>
                    <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-3 mb-3 group-hover:text-blue-600 transition">{link.title}</h4>
                    <div className="mt-auto pt-3 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1"><LinkIcon className="w-3 h-3" /> {getDomain(link.url)}</div>
                      <div className="flex items-center gap-1"><Clock className="w-3 h-3"/> {link.createdAt ? formatDate(link.createdAt).split(' ')[0] : '-'}</div>
                    </div>
                  </div>
                </a>
              ))}
              {publishedLinks.filter(link => link.owner === 'ravit').length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-400 bg-slate-50 rounded-xl border-dashed border-2 border-slate-200">
                  ไม่พบข้อมูลข่าว
                </div>
              )}
          </div>
        </div>

      </div>
    );
  };

  // แทนที่ renderStrategy ตัวเดิมด้วยอันนี้
  const renderStrategy = (ownerType = 'tawee') => { 
      const ownerTasks = tasks.filter(t => {
    const owner = t.owner || 'tawee';
    // ถ้าดูห้อง ravit ให้เอาทั้ง 'ravit' และคำผิด 'rawit' มาแสดง
    if (ownerType === 'ravit') return owner === 'ravit' || owner === 'rawit';
    return owner === ownerType;
});

      const localGroupedTasks = { 
          solver: sortTasks(ownerTasks.filter(t => t.columnKey === 'solver')), 
          principles: sortTasks(ownerTasks.filter(t => t.columnKey === 'principles')), 
          defender: sortTasks(ownerTasks.filter(t => t.columnKey === 'defender')), 
          expert: sortTasks(ownerTasks.filter(t => t.columnKey === 'expert')), 
          backoffice: sortTasks(ownerTasks.filter(t => t.columnKey === 'backoffice')) 
      };

      return (
          <div className="h-full flex flex-col">
              <PageHeader 
                  title={ownerType === 'tawee' ? "ท่านทวี" : "คุณรวิศ"} 
                  subtitle="Strategy Board & Tasks" 
                  action={
                      <div className="flex flex-wrap gap-3">
                          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                              <ArrowDownWideNarrow className="w-4 h-4 text-slate-500" />
                              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer outline-none"><option value="newest">ล่าสุด (Newest)</option><option value="oldest">เก่าสุด (Oldest)</option></select>
                          </div>
                          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                              <Filter className="w-4 h-4 text-slate-500" />
                              <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer outline-none"><option value="All">All Tags</option>{strategyBoardAllTags.filter(t=>t!=='All').map(tag => <option key={tag} value={tag}>{tag}</option>)}</select>
                          </div>
                          <button onClick={() => setHideDone(!hideDone)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold border transition ${hideDone ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-300'}`}>{hideDone ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />} {hideDone ? "Show Done" : "Hide Done"}</button>
                          <button onClick={() => setIsStrategyTagManagerOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold border transition bg-slate-800 text-white hover:bg-black border-slate-600"><Tag className="w-4 h-4" /> จัดการ Tag</button>
                      </div>
                  } 
              />
              <div className="overflow-x-auto pb-4 flex-1 custom-scrollbar">
                  <div className="flex flex-col md:flex-row gap-4 min-w-full md:min-w-[1200px] h-full">
                      {['solver', 'principles', 'defender', 'expert', 'backoffice'].map((key) => { 
                          const filteredAndSorted = localGroupedTasks[key].filter(t => { 
                              const taskTags = Array.isArray(t.tags) && t.tags.length > 0 ? t.tags : (t.tag ? t.tag.split(',').map(s=>s.trim()).filter(Boolean) : []); 
                              const matchesTag = filterTag === 'All' || taskTags.includes(filterTag); 
                              const isDone = t.status === 'Done'; 
                              return matchesTag && (!hideDone || !isDone); 
                          }); 
                          return (
                              <div key={key} className={`w-full md:w-1/5 bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col h-full`}>
                                  <div className="flex justify-between items-center mb-4">
                                      <div className="w-full">
                                          <h3 className="font-black text-slate-800 text-sm uppercase flex items-center">{COLUMN_LABELS[key]}<span className="ml-2 text-xs bg-slate-200 text-slate-600 font-bold w-6 h-6 flex items-center justify-center rounded-full">{filteredAndSorted.length}</span></h3>
                                          <p className="text-[11px] text-slate-400 mt-1">{COL_DESCRIPTIONS[key]}</p>
                                      </div>
                                      <button onClick={() => addNewTask(key, ownerType)} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-blue-600 hover:text-white transition"><Plus className="w-5 h-5"/></button>
                                  </div>
                                  <div className="space-y-3 overflow-y-auto flex-1 -mr-2 pr-2 custom-scrollbar">
                                      {filteredAndSorted.map(task => { 
                                          const taskTags = Array.isArray(task.tags) ? task.tags : (task.tag ? task.tag.split(',').map(s=>s.trim()).filter(Boolean) : []); 
                                          return (
                                              <div key={task.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group relative">
                                                  <div className="flex justify-between items-start" onClick={() => { const taskToEdit = {...task}; if (!Array.isArray(taskToEdit.tags)) { taskToEdit.tags = taskToEdit.tag && typeof taskToEdit.tag === 'string' ? taskToEdit.tag.split(',').map(t=>t.trim()).filter(Boolean) : []}; setEditingTask(taskToEdit); }}>
                                                      <p className="text-sm font-bold text-slate-800 line-clamp-3 pr-4 group-hover:text-blue-700 flex-1">{task.title}</p>
                                                      <div className="flex flex-col items-end gap-1 ml-2">
                                                        <StatusBadge status={task.status} />
                                                        {/* ปุ่มลบงาน */}
                                                        <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="ลบงาน">
                                                          <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                      </div>
                                                  </div>
                                                  {taskTags.length > 0 && (<div className="flex flex-wrap gap-1 mt-2">{taskTags.map(t => (<span key={t} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">{t}</span>))}</div>)}
                                                  <div className="flex items-end justify-between mt-3 pt-3 border-t border-slate-100">
                                                      <div className="flex items-center gap-2 text-xs text-slate-500">
                                                          {task.deadline && (<div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/><span>{new Date(task.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span></div>)}
                                                      </div>
                                                      <div className="flex items-center gap-1"><div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs border-2 border-white shadow-sm font-bold">{getInitials(task.role || task.createdBy)}</div></div>
                                                  </div>
                                                  {task.link && <a href={task.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="absolute top-2 right-2 p-1 rounded-full bg-slate-100 text-slate-500 opacity-0 group-hover:opacity-100 transition hover:bg-blue-100"><LinkIcon className="w-3.5 h-3.5"/></a>}
                                              </div>
                                          );
                                      })}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          </div>
      ); 
  };
  const renderMasterPlan = () => (<div className="space-y-6"><PageHeader title="แผนงานหลัก (Master Plan)" subtitle="Long-term Roadmap" action={<button onClick={addPlan} className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2"><Plus className="w-4 h-4" /> สร้างแผนใหม่</button>} /><div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{plans.map((plan) => { const sortedItems = [...(plan.items || [])].map((item, idx) => ({ ...item, originalIndex: idx })).sort((a, b) => Number(a.completed) - Number(b.completed)); return (<div key={plan.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition"><div className="flex justify-between items-start mb-6"><div className="flex items-center gap-2 cursor-pointer" onClick={() => editPlanTitle(plan)}><h3 className="font-bold text-lg text-slate-800">{plan.title}</h3><Edit2 className="w-4 h-4 text-slate-300 hover:text-blue-600" /></div><button onClick={async () => { if(confirm("ลบแผนนี้?")) { await deleteDoc(doc(db, "plans", plan.id)); logActivity("Delete Plan", plan.title); refreshData(); }}} className="text-slate-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div><div className="mb-6"><div className="w-full bg-slate-100 rounded-full h-2.5"><div className="bg-blue-600 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${plan.progress || 0}%` }}></div></div></div><ul className="space-y-1">{sortedItems.map((item) => (<li key={item.originalIndex} className={`flex items-center justify-between gap-3 text-sm p-2 rounded-lg hover:bg-slate-50 transition ${item.completed ? 'opacity-50' : ''}`}><div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => togglePlanItem(plan.id, item.originalIndex, plan.items)}>{item.completed ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-slate-300" />}<span className={item.completed ? "line-through" : ""}>{item.text}</span></div><div className="flex items-center gap-2"><button onClick={() => editPlanItem(plan.id, item.originalIndex, plan.items)}><Edit2 className="w-4 h-4 text-slate-300 hover:text-blue-600"/></button><button onClick={() => removePlanItem(plan.id, item.originalIndex, plan.items)}><Trash2 className="w-4 h-4 text-slate-300 hover:text-red-600"/></button></div></li>))}</ul><div className="mt-4"><button onClick={() => openFormModal("เพิ่มรายการ", [{key:'text', label:'ข้อความ'}], async(d) => { const newItems = [...(plan.items || []), {text: d.text, completed: false}]; const p = Math.round((newItems.filter(i=>i.completed).length/newItems.length)*100); await updateDoc(doc(db, "plans", plan.id), {items: newItems, progress: p}); refreshData(); })} className="w-full text-center py-2 bg-slate-50 rounded-lg text-slate-600 hover:bg-slate-100 transition text-sm">+ เพิ่มรายการ</button></div></div>); })}</div></div>);
  const renderRapidResponse = () => (<div className="space-y-6"><PageHeader title="ปฏิบัติการด่วน" subtitle="Agile Response Unit" action={<button onClick={createUrgentCase} className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-red-700 shadow-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> เปิดเคสด่วน</button>} /><div className="flex flex-col lg:flex-row gap-6"><div className={`lg:w-1/3 bg-white rounded-2xl border border-slate-200 shadow-sm h-fit overflow-hidden`}><div className="p-4 bg-slate-50 font-bold text-slate-800 flex items-center gap-2 cursor-pointer" onClick={()=>setIsSopOpen(!isSopOpen)}><FileText className="w-5 h-5"/> SOP Guide (คู่มือ) <ChevronDown className={`ml-auto transform ${isSopOpen?'rotate-180':''}`}/></div>{isSopOpen && <div className="p-6 space-y-3 text-sm text-slate-600">{SOP_GUIDE.map((s,i)=><p key={i}>{s}</p>)}</div>}</div><div className="lg:w-2/3 space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{urgentTasks.map(task => (<div key={task.id} className="bg-white p-5 rounded-2xl border-l-[6px] border-red-500 shadow-sm hover:shadow-md cursor-pointer" onClick={() => setUrgentModal(task)}><div className="flex justify-between mb-3"><span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded animate-pulse">URGENT</span><StatusBadge status={task.status} /></div><h3 className="font-bold text-slate-800 mb-3 text-lg">{task.title}</h3>{task.deadline && <p className="text-xs text-slate-500 mb-4 flex gap-1"><Clock className="w-3.5 h-3.5"/> {task.deadline}</p>}<div className="pt-3 border-t border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Progress Checklist</p><div className="flex gap-1.5 h-2">{(task.sop && task.sop.length > 0 ? task.sop : Array(5).fill({done:false})).map((s, i) => (<div key={i} className={`flex-1 rounded-full transition-all ${s.done ? 'bg-green-500 shadow-sm' : 'bg-slate-200'}`}></div>))}</div></div></div>))}</div><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h3 className="font-bold mb-4">Backoffice (งานสนับสนุน)</h3><div className="space-y-2">{groupedTasks.backoffice.map(t=>(<div key={t.id} onClick={() => { const taskToEdit = {...t}; if (!Array.isArray(taskToEdit.tags)) { taskToEdit.tags = taskToEdit.tag && typeof taskToEdit.tag === 'string' ? taskToEdit.tag.split(',').map(tag=>tag.trim()).filter(Boolean) : []}; setEditingTask(taskToEdit); }} className="flex justify-between items-center p-3 border rounded-lg hover:bg-slate-50 cursor-pointer"><div><p className="font-bold">{t.title}</p><p className="text-xs text-slate-500">{t.role}</p></div><StatusBadge status={t.status}/></div>))}</div></div></div></div></div>);
  const renderAssets = () => (<div className="space-y-6"><PageHeader title="คลังข้อมูลสื่อ" subtitle="Media Assets" /><div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-2xl shadow-lg text-white flex justify-between items-center"><div><h3 className="text-2xl font-black mb-2">Google Drive</h3><p className="text-blue-100">พื้นที่เก็บไฟล์ต้นฉบับ</p></div><a href="https://drive.google.com/drive/folders/0AHTNNQ96Wgq-Uk9PVA" target="_blank" rel="noreferrer" className="bg-white text-blue-700 px-6 py-3 rounded-xl font-bold shadow-xl flex items-center gap-2"><ExternalLink className="w-5 h-5"/> เปิด Drive</a></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="flex justify-between mb-6"><h3 className="font-bold text-lg">Channels</h3><button onClick={addChannel} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold">+ เพิ่ม</button></div><div className="space-y-3">{channels.map(c => (<div key={c.id} className="flex justify-between p-4 border rounded-xl hover:shadow-md cursor-pointer" onClick={() => updateChannel(c)}><div><p className="font-bold text-slate-700">{c.name}</p><span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{c.type}</span></div><button onClick={(e) => {e.stopPropagation(); deleteChannel(c.id)}}><Trash2 className="w-5 h-5 text-slate-300 hover:text-red-500"/></button></div>))}</div></div><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="flex justify-between mb-6"><h3 className="font-bold text-lg">Media List</h3><button onClick={addMedia} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold">+ เพิ่ม</button></div><div className="space-y-3 overflow-y-auto max-h-[500px]">{media.map(c => (<div key={c.id} className="flex justify-between p-4 border rounded-xl hover:shadow-md"><div onClick={() => editMedia(c)} className="flex-1 cursor-pointer"><p className="font-bold text-slate-700">{c.name}</p><div className="text-xs text-slate-500 mt-1 flex gap-4"><span>{c.type}</span><span>{c.phone}</span><span>{c.line}</span></div></div><div className="flex items-center gap-2"><button onClick={(e) => {e.stopPropagation(); deleteMedia(c.id)}}><Trash2 className="w-5 h-5 text-slate-300 hover:text-red-500"/></button></div></div>))}</div></div></div></div>);

  const renderNewsroom = (ownerType = 'tawee') => {
    const usedTags = new Set(publishedLinks.flatMap(link => link.tags || []));
    systemTags.forEach(t => usedTags.add(t.name));
    const allNewsTags = ['All', ...Array.from(usedTags)].filter(Boolean);
    const tagColorMap = systemTags.reduce((acc, t) => ({ ...acc, [t.name]: t.color }), {});
    const getTagColor = (tagName) => tagColorMap[tagName] || '#64748b';

    let filteredLinks = publishedLinks.filter(link => {
    const owner = link.owner || 'tawee';
    // ถ้าดูห้อง ravit ให้เอาทั้ง 'ravit' และคำผิด 'rawit' มาแสดง
    if (ownerType === 'ravit') return owner === 'ravit' || owner === 'rawit';
    return owner === ownerType;
});
    
    if (newsStartDate && newsEndDate) {
      const start = new Date(newsStartDate).setHours(0, 0, 0, 0);
      const end = new Date(newsEndDate).setHours(23, 59, 59, 999);
      filteredLinks = filteredLinks.filter(l => {
        if (!l.createdAt) return false;
        const d = (l.createdAt.toDate ? l.createdAt.toDate() : new Date(l.createdAt)).getTime();
        return d >= start && d <= end;
      });
    }
    if (newsFilterTag !== 'All') filteredLinks = filteredLinks.filter(link => (link.tags || []).includes(newsFilterTag));

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
        <PageHeader 
          title={ownerType === 'tawee' ? "ห้องข่าว ท่านทวี สอดส่อง" : "ห้องข่าว คุณรวิศ สอดส่อง"} 
          subtitle="Newsroom & Public Relations" 
          action={
            <div className="flex flex-wrap items-end gap-3 bg-white p-2 rounded-xl border shadow-sm">
              <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold ml-1">ตั้งแต่วันที่</span><input type="date" value={newsStartDate} onChange={e => setNewsStartDate(e.target.value)} className="text-xs border rounded-lg p-1.5 outline-none focus:border-blue-500 text-slate-600" /></div>
              <div className="flex flex-col"><span className="text-[10px] text-slate-400 font-bold ml-1">ถึงวันที่</span><input type="date" value={newsEndDate} onChange={e => setNewsEndDate(e.target.value)} className="text-xs border rounded-lg p-1.5 outline-none focus:border-blue-500 text-slate-600" /></div>
              <button onClick={() => { setNewsStartDate(''); setNewsEndDate(''); setNewsFilterTag('All'); }} className="p-2 rounded-full text-slate-400 transition-all duration-300 group relative hover:text-white hover:bg-red-500" title="ล้างค่า">
                  <RefreshCw className="w-4 h-4" />
              </button>
              <div className="w-px h-8 bg-slate-200 mx-1"></div>
              <button onClick={() => setIsTagManagerOpen(true)} className="bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-black flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
                <Tag className="w-3.5 h-3.5" /> จัดการ Tag
              </button>
              <button onClick={() => addPublishedLink(ownerType)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
                <Plus className="w-4 h-4" /> เพิ่มข่าว{ownerType === 'tawee' ? 'ท่านทวี' : 'คุณรวิศ'}
              </button>
            </div>
          } 
        />
        
        <div className="w-full overflow-x-auto pb-2 custom-scrollbar -mt-2">
          <div className="flex items-center gap-2 min-w-max px-1">
            <Tag className="w-4 h-4 text-slate-400 mr-2" />
            {allNewsTags.map(tag => {
              const color = getTagColor(tag); const isActive = newsFilterTag === tag;
              return (
                <button key={tag} onClick={() => setNewsFilterTag(tag)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 border flex items-center gap-1.5 ${isActive ? 'text-white border-transparent shadow-md scale-105' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`} style={isActive ? { backgroundColor: tag === 'All' ? '#2563eb' : color } : {}}>
                  {tag !== 'All' && <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : ''}`} style={!isActive ? { backgroundColor: color } : {}}></div>} {tag === 'All' ? 'ทั้งหมด' : tag}
                </button>
              );
            })}
          </div>
        </div>
        
        {Object.keys(groupedData).length === 0 ? <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400"><Globe className="w-12 h-12 mb-3 opacity-20" /><p>ไม่พบข้อมูลข่าว</p></div> : 
          Object.keys(groupedData).sort((a, b) => b.localeCompare(a)).map(week => (
            <div key={week} className="bg-white/50 rounded-3xl p-6 border border-slate-200/60 shadow-sm relative overflow-hidden mb-6">
              <div className="absolute top-0 left-0 bg-blue-600 text-white text-xs font-black px-4 py-1.5 rounded-br-2xl shadow-sm z-10">{week}</div>
              <div className="space-y-8 mt-4">
                {Object.keys(groupedData[week]).sort((a, b) => { const getLinkDate = (k) => { const l = groupedData[week][k][0]; return (l.createdAt.toDate ? l.createdAt.toDate() : new Date(l.createdAt)).getTime(); }; return getLinkDate(b) - getLinkDate(a); }).map(day => (
                  <div key={day}>
                    <h3 className="flex items-center gap-2 text-slate-700 font-bold mb-4 pb-2 border-b border-slate-200"><Calendar className="w-4 h-4 text-blue-500" /> {day}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {groupedData[week][day].map(link => (
                        <div key={link.id} className="group bg-white rounded-xl overflow-hidden border border-slate-100 hover:border-blue-300 hover:shadow-xl transition-all duration-300 flex flex-col h-full">
                          <div className="aspect-video bg-slate-100 relative overflow-hidden group-hover:shadow-inner">
                            {link.imageUrl ? <img src={`https://wsrv.nl/?url=${encodeURIComponent(link.imageUrl)}&w=400&q=75`} alt={link.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /> : <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><FileText className="w-10 h-10 mb-1" /><span className="text-[10px]">No Image</span></div>}
                            <a href={link.url} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"><ExternalLink className="w-8 h-8 text-white drop-shadow-md" /></a>
                          </div>
                          <div className="p-4 flex flex-col flex-1">
                            <div className="flex flex-wrap gap-1 mb-2.5">{(link.tags || []).map((tag, idx) => <span key={idx} className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: getTagColor(tag) }}>#{tag}</span>)}</div>
                            <div className="flex justify-between items-start mb-2">
                                <span className="bg-blue-50 text-blue-600 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">{link.platform || 'News'}</span>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => editPublishedLink(link)} className="text-slate-300 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => deleteLink(link.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                            <a href={link.url} target="_blank" rel="noreferrer" className="font-bold text-slate-800 text-sm leading-snug line-clamp-2 hover:text-blue-600 transition mb-2">{link.title}</a>
                            
                            {/* --- เพิ่มส่วนแสดงแหล่งที่มา (Domain) ตรงนี้ครับ --- */}
                            <div className="text-[10px] text-slate-400 font-medium mb-3 flex items-center gap-1 bg-slate-50 p-1 rounded w-fit">
                                <LinkIcon className="w-3 h-3" />
                                <span className="truncate max-w-[150px]">{getDomain(link.url)}</span>
                            </div>
                            {/* ------------------------------------------- */}

                            <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400"><span>{link.createdAt ? formatDate(link.createdAt).split(' ')[0] : '-'}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        }
        
        <button onClick={() => addPublishedLink(ownerType)} className="fixed bottom-8 right-8 z-[50] bg-blue-600 text-white w-14 h-14 rounded-full shadow-2xl hover:bg-blue-700 hover:scale-110 active:scale-95 transition-all flex items-center justify-center">
          <Plus className="w-8 h-8" />
        </button>
      </div>
    );
  };

  const renderContent = () => {
    if (activeTab === 'dashboard') return renderDashboard();
    
    // ห้องข่าว
    if (activeTab === 'newsroom_tawee') return renderNewsroom('tawee'); 
    if (activeTab === 'newsroom_ravit') return renderNewsroom('ravit');
    
    // กระดาน 4 แกน (แยกใหม่)
    if (activeTab === 'strategy_tawee') return renderStrategy('tawee');
    if (activeTab === 'strategy_ravit') return renderStrategy('ravit');
    if (activeTab === 'strategy') return renderStrategy('tawee'); // Fallback สำหรับอันเดิม

    if (activeTab === 'masterplan') return renderMasterPlan();
    if (activeTab === 'rapidresponse') return renderRapidResponse();
    if (activeTab === 'assets') return renderAssets();
    if (activeTab === 'newsroom') return renderNewsroom('tawee'); 
    
    // ส่วน admin คงเดิม...
    if (activeTab === 'admin') {
      if(userProfile?.role !== 'Admin') return <div className="p-10 text-center text-red-500">Access Denied</div>;
      return (
        <div className="space-y-6 animate-fadeIn">
            <PageHeader title="ผู้ดูแลระบบ (Admin)" subtitle="User Management & System Logs" />
            <div className="flex flex-col lg:flex-row gap-6">
               <div className="w-full lg:w-1/2 space-y-6">
                   <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                       <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Users className="w-5 h-5"/> สมาชิก ({usersList.length})</h3>
                       <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">{usersList.map(u => (<div key={u.id} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">{u.displayName?.[0] || "U"}</div><div><p className="text-sm font-bold">{u.displayName || u.email}</p><p className="text-xs text-slate-500">{u.email} • {u.role}</p></div></div><div className="flex gap-2">{u.status === 'Pending' && <button onClick={()=>updateUserStatus(u.id, 'Active', 'Member')} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-bold hover:bg-green-200">อนุมัติ</button>}{u.role !== 'Admin' && <button onClick={()=>updateUserStatus(u.id, 'Active', 'Admin')} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-bold hover:bg-blue-200">ตั้งเป็น Admin</button>}</div></div>))}</div>
                   </div>
               </div>
               <div className="w-full lg:w-1/2 bg-slate-900 text-slate-300 p-6 rounded-xl border border-slate-800 shadow-sm h-fit">
                   <h3 className="font-bold text-white mb-4 flex items-center gap-2"><FileClock className="w-5 h-5"/> Activity Logs</h3>
                   <div className="space-y-2 text-xs font-mono max-h-96 overflow-y-auto custom-scrollbar">{activityLogs.map(log => (<div key={log.id} className="border-b border-slate-800 pb-2 mb-2 last:border-0"><span className="text-slate-500">{log.createdAt ? formatDate(log.createdAt) : '-'}</span><p className="text-white font-bold mt-0.5">[{log.user}] {log.action}</p><p className="opacity-70">{log.details}</p></div>))}</div>
               </div>
            </div>
        </div>
      );
    }
    return null;
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-blue-600"/></div>;
  if (!currentUser) return <LoginScreen />;

  return (
    <div className="fixed inset-0 bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row overflow-hidden">
      <LoadingOverlay isOpen={isGlobalLoading} />
      {/* Modals */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={() => setEditingTask(null)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button>
            <h3 className="font-bold text-xl text-slate-800 mb-6">แก้ไขงาน</h3>
            <div className="space-y-4">
              <input type="text" value={editingTask.title} onChange={e=>setEditingTask({...editingTask, title:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="ชื่องาน" />
              <MultiTagSelector availableTags={strategyBoardAllTags.filter(t => t !== 'All')} selectedTags={editingTask.tags || (editingTask.tag ? editingTask.tag.split(',').map(t=>t.trim()).filter(Boolean) : [])} onTagsChange={(newTags) => { setEditingTask({...editingTask, tags: newTags, tag: newTags.join(', ') }); }} />
              <input type="text" value={editingTask.role||""} onChange={e=>setEditingTask({...editingTask, role:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="ผู้รับผิดชอบ" />
              <div className="grid grid-cols-2 gap-4"><select value={editingTask.status} onChange={e=>setEditingTask({...editingTask, status:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm">{TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select><input type="date" value={editingTask.deadline} onChange={e=>setEditingTask({...editingTask, deadline:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm" /></div>
              <input type="text" value={editingTask.link} onChange={e=>setEditingTask({...editingTask, link:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm" placeholder="Link ผลงาน" />
            </div>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setEditingTask(null)} className="px-4 py-2 rounded-lg text-slate-600 border border-slate-300 hover:bg-slate-100">ยกเลิก</button><button onClick={() => saveTaskChange(editingTask)} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700">บันทึก</button></div>
          </div>
        </div>
      )}
      {newsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative flex flex-col max-h-[90vh]">
            <button onClick={() => setNewsModal(null)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full z-10"><X className="w-5 h-5 text-slate-400" /></button>
            <h3 className="font-bold text-xl text-slate-800 mb-4 flex-shrink-0">{newsModal.isEdit ? 'แก้ไขข่าวประชาสัมพันธ์' : 'เพิ่มข่าวใหม่'}</h3>
            <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                <div><label className="text-sm font-bold text-slate-600 mb-1 block">หัวข้อข่าว</label><input type="text" value={newsModal.data.title} onChange={e=>setNewsModal({...newsModal, data: {...newsModal.data, title: e.target.value}})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500" /></div>
                <div><label className="text-sm font-bold text-slate-600 mb-1 block">URL ข่าว</label><input type="text" value={newsModal.data.url} onChange={e=>setNewsModal({...newsModal, data: {...newsModal.data, url: e.target.value}})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500 text-slate-500" /></div>
                <div><label className="text-sm font-bold text-slate-600 mb-1 block">URL รูปภาพ</label><input type="text" value={newsModal.data.imageUrl} onChange={e=>setNewsModal({...newsModal, data: {...newsModal.data, imageUrl: e.target.value}})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-indigo-500 text-slate-500" /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-bold text-slate-600 mb-1 block">Platform</label><select value={newsModal.data.platform} onChange={e=>setNewsModal({...newsModal, data: {...newsModal.data, platform: e.target.value}})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm">{['Website', 'Facebook', 'YouTube', 'TikTok', 'Twitter'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                    <div><label className="text-sm font-bold text-slate-600 mb-1 block">วันที่ลงข่าว</label><input type="datetime-local" value={newsModal.data.customDate} onChange={e=>setNewsModal({...newsModal, data: {...newsModal.data, customDate: e.target.value}})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm" /></div>
                </div>
                <div className="border-t pt-4 mt-2"><NewsTagSelector availableTags={systemTags} selectedTags={newsModal.data.tags || []} onTagsChange={(newTags) => setNewsModal({...newsModal, data: {...newsModal.data, tags: newTags}})} systemTagColors={systemTags.reduce((acc, t) => ({...acc, [t.name]: t.color}), {})} /></div>
            </div>
            <div className="mt-6 flex justify-end gap-3 pt-4 border-t flex-shrink-0"><button onClick={() => setNewsModal(null)} className="px-4 py-2 rounded-lg text-slate-600 border border-slate-300 hover:bg-slate-100">ยกเลิก</button><button onClick={saveNewsItem} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700">บันทึก</button></div>
          </div>
        </div>
      )}
      <FormModal {...formModalConfig} onClose={() => setFormModalConfig(prev => ({ ...prev, isOpen: false }))} />
      <SearchModal isOpen={isSearchOpen} onClose={()=>setIsSearchOpen(false)} data={{tasks, media, channels}} onNavigate={navigateTo} />
      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} userProfile={userProfile} onUpdate={handleUpdateProfile} />
      <TagManagerModal isOpen={isStrategyTagManagerOpen} onClose={() => setIsStrategyTagManagerOpen(false)} existingTags={tagsForStrategyManager} onSave={saveStrategyTags} title="จัดการ Tag (กระดาน 4 แกน)" />
        {/* เพิ่มบรรทัดด้านล่างนี้ */}
<TagManagerModal isOpen={isTagManagerOpen} onClose={() => setIsTagManagerOpen(false)} existingTags={systemTags} onSave={saveSystemTags} title="จัดการ Tag (ห้องข่าว)" />

      {/* --- SIDEBAR --- */}
      <aside className={`bg-slate-900 text-white w-full md:w-64 flex-shrink-0 transition-all duration-300 fixed md:relative z-30 h-screen md:h-full flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
            <div><h1 className="text-xl font-black tracking-wider text-white">TEAM TAWEE</h1><p className="text-[10px] text-blue-400 font-bold tracking-widest uppercase mt-1">Stand Together</p></div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400"><X /></button>
        </div>
        <nav className="p-4 space-y-2 overflow-y-auto flex-1 custom-scrollbar">
            {navItems.map(item => (
                <button key={item.id} onClick={() => navigateTo(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-left ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg translate-x-1' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${item.color || ''}`} />
                    <div className="flex flex-col"><span className="font-bold text-sm leading-tight">{item.title}</span><span className="text-[10px] opacity-80 font-medium">({item.subtitle})</span></div>
                </button>
            ))}
        </nav>
        <div className="p-4 border-t border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors flex-shrink-0" onClick={() => setShowProfileModal(true)}>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden border-2 border-slate-700">{currentUser?.photoURL ? <img src={currentUser.photoURL} alt="User" className="w-full h-full object-cover" /> : <span className="font-bold text-white">{currentUser?.displayName?.[0] || "U"}</span>}</div>
                <div className="overflow-hidden"><p className="text-sm font-bold truncate">{currentUser?.displayName || "User"}</p><p className="text-[10px] text-slate-400">Edit Profile</p></div>
            </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 md:ml-0 h-full overflow-y-auto w-full relative custom-scrollbar bg-slate-50">
        <div className="bg-white/90 backdrop-blur-sm p-4 flex justify-between items-center shadow-sm sticky top-0 z-20 border-b border-slate-100 h-16 transition-all">
            <div className="flex items-center gap-3">
                <div className="md:hidden"><h2 className="font-black text-slate-900 leading-none">TEAM TAWEE</h2><p className="text-[9px] text-slate-500 font-bold tracking-wider uppercase">Stand Together</p></div>
                <div className="hidden md:flex items-center gap-3 animate-fadeIn">
                    {(() => { const currentItem = navItems.find(i => i.id === activeTab) || navItems[0]; return (<> <div className={`p-2 rounded-xl ${currentItem.color ? 'bg-opacity-10 ' + currentItem.color.replace('text-', 'bg-') : 'bg-slate-100 text-slate-500'}`}><currentItem.icon className={`w-5 h-5 ${currentItem.color || ''}`} /></div><div className="flex flex-col"><h2 className="font-bold text-slate-800 leading-none text-sm">{currentItem.title}</h2><span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{currentItem.subtitle}</span></div> </>); })()}
                </div>
            </div>
            <div className="flex gap-2 ml-auto">
                <button onClick={refreshData} disabled={isDataLoading} className={`relative p-2 rounded-xl transition-all duration-500 ease-out overflow-hidden ${isDataLoading ? 'bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.6)] scale-110 -rotate-12 ring-2 ring-white/50' : 'bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600 active:scale-90 active:bg-slate-200' }`}>
                    <RefreshCw className={`w-5 h-5 transition-all duration-500 ${isDataLoading ? 'animate-spin drop-shadow-md' : 'active:-rotate-180'}`} />
                    {isDataLoading && (<><span className="absolute inset-0 rounded-xl bg-white opacity-30 animate-ping"></span><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div></>)}
                </button>
                <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden group relative p-2 rounded-xl transition-all duration-300 ease-in-out bg-slate-100 text-slate-600 border border-transparent hover:bg-slate-900 hover:text-white hover:rotate-90 hover:scale-110 hover:shadow-[0_0_15px_rgba(15,23,42,0.5)] hover:border-slate-800 active:scale-90 active:rotate-[180deg]">
                  <Menu className="w-5 h-5" /><span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white opacity-0 group-hover:opacity-100 group-hover:animate-bounce transition-opacity"></span>
                </button>
            </div>
        </div>
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full">
            {renderContent()}
        </div>
      </main>
    </div>
  );
}