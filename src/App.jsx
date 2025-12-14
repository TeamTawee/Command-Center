import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from './firebaseConfig'; 
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, 
  query, orderBy, setDoc, getDoc, serverTimestamp, 
  writeBatch, getDocs, where, 
  onSnapshot 
} from 'firebase/firestore'; 
import { 
  onAuthStateChanged, updateProfile 
} from 'firebase/auth';

import { 
  LayoutDashboard, Megaphone, Map as MapIcon, Zap, Database, Users, Menu, X, Activity, 
  Calendar, CheckCircle2, Circle, Clock, ExternalLink, FileText, Plus, 
  Link as LinkIcon, Trash2, Edit2, ChevronDown, ChevronUp, Filter, RefreshCw, 
  LogOut, Lock, AlertTriangle, Globe, Loader2, Tag, Search, Shield, 
  FileClock, ArrowDownWideNarrow, User
} from 'lucide-react';

// --- IMPORTS FROM SUB-FILES ---
import { LoginScreen } from './LoginScreen.jsx';
import { LoadingOverlay, PageHeader, StatusBadge, StatusDonutChart } from './UI.jsx';
import { TagManagerModal, SearchModal, FormModal, ProfileModal } from './Modals.jsx';
import { 
    formatDate, getWeekNumber, getDomain, formatForInput, fetchLinkMetadata 
} from './utils.js';
import { 
    PRESET_TAGS, ASSET_TYPES, TASK_STATUSES, DEFAULT_SOP, SOP_GUIDE, 
    COLUMN_LABELS, COL_DESCRIPTIONS 
} from './constants.js';

// --- Multi-select Tag Component for Strategy Board ---
const MultiTagSelector = ({ availableTags, selectedTags, onTagsChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const dropdownRef = React.useRef(null);

  const filteredTags = availableTags.filter(tag => 
    tag.toLowerCase().includes(searchTerm.toLowerCase()) && !selectedTags.includes(tag)
  );

  const toggleTag = (tag) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    onTagsChange(newTags);
  };

  const handleAddNewTag = () => {
    const newTag = searchTerm.trim();
    if (newTag && !availableTags.includes(newTag) && !selectedTags.includes(newTag)) {
      onTagsChange([...selectedTags, newTag]);
      setSearchTerm('');
    }
  };
  
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-sm font-bold text-slate-600 mb-2 block">Tags</label>
      <div className="w-full border-2 border-slate-200 rounded-lg p-2 flex flex-wrap gap-2 items-center cursor-text min-h-[44px]" onClick={() => {setIsOpen(true); dropdownRef.current.querySelector('input').focus();}}>
        {selectedTags.map(tag => (
          <span key={tag} className="bg-blue-500 text-white px-2 py-1 rounded-md text-xs flex items-center gap-1.5 animate-fadeIn">
            {tag}
            <button onClick={(e) => { e.stopPropagation(); toggleTag(tag); }} className="text-white/70 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input 
          type="text"
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); if (!isOpen) setIsOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleAddNewTag(); }
            else if (e.key === 'Backspace' && searchTerm === '' && selectedTags.length > 0) { toggleTag(selectedTags[selectedTags.length - 1]); }
          }}
          className="flex-grow outline-none bg-transparent text-sm p-1"
          placeholder={selectedTags.length === 0 ? 'เพิ่ม Tag...' : ''}
          onFocus={() => setIsOpen(true)}
        />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-full bg-white border border-slate-300 mt-1 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {filteredTags.length > 0 && filteredTags.map(tag => (
            <div key={tag} onClick={() => toggleTag(tag)} className="px-4 py-2 hover:bg-slate-100 cursor-pointer text-sm">{tag}</div>
          ))}
          {searchTerm && !availableTags.map(t=>t.toLowerCase()).includes(searchTerm.trim().toLowerCase()) && (
            <div onClick={handleAddNewTag} className="px-4 py-2 hover:bg-blue-100 cursor-pointer text-sm font-bold text-blue-600">
              + สร้าง Tag ใหม่ "{searchTerm.trim()}"
            </div>
          )}
        </div>
      )}
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
  const [strategyTags, setStrategyTags] = useState([]); // Tags from Settings
  const [isStrategyTagManagerOpen, setIsStrategyTagManagerOpen] = useState(false);

  // --- 1. CALCULATE RAW TAG LIST (For Dropdowns & Filtering) ---
  const strategyBoardAllTags = useMemo(() => {
    const all = new Set(['All', ...PRESET_TAGS]);
    // Tags from DB Settings
    if (strategyTags) strategyTags.forEach(t => all.add(t.name));
    // Tags from Existing Tasks (สำคัญ: ดึงจาก Task จริงที่โชว์ในภาพ Screenshot)
    tasks.forEach(t => {
      if (Array.isArray(t.tags)) t.tags.forEach(tag => all.add(tag));
      else if (t.tag) t.tag.split(',').map(s => s.trim()).filter(Boolean).forEach(tag => all.add(tag));
    });
    return Array.from(all).filter(Boolean);
  }, [tasks, strategyTags]);

  // --- 2. CALCULATE TAG OBJECTS FOR MANAGER (Fix: Syncs Dropdown with Manager) ---
  // ส่วนนี้จะรวม Tag ที่เซฟไว้ในระบบ เข้ากับ Tag ที่ลอยอยู่ใน Task เพื่อให้หน้าจัดการ Tag เห็นครบทุกตัว
  const tagsForStrategyManager = useMemo(() => {
    // สร้าง Map ของ Tag ที่บันทึกไว้แล้ว (มีสี มีค่า config)
    const savedMap = new Map(strategyTags.map(t => [t.name, t]));
    
    // วนลูปดู Tag ทั้งหมดที่มีบนกระดานตอนนี้ (ตัดคำว่า All ออก)
    const mergedList = strategyBoardAllTags
      .filter(t => t !== 'All') 
      .map(tagName => {
        // ถ้ามีใน Config ให้ใช้ค่า Config (จะได้สีที่ตั้งไว้)
        if (savedMap.has(tagName)) {
          return savedMap.get(tagName);
        }
        // ถ้าเป็น Tag ใหม่ที่เพิ่งพิมพ์ในงาน (เช่น Visual Storytelling) ให้สร้าง Object สีเทาตั้งต้น
        return { name: tagName, color: '#64748b' }; 
      });

    return mergedList;
  }, [strategyTags, strategyBoardAllTags]);


  // --- HELPER IN SCOPE ---
  const navigateTo = (tabId) => { 
    if (activeTab === tabId) return; 
    setActiveTab(tabId); 
    window.history.pushState({ tab: tabId }, '', `#${tabId}`); 
    setIsMobileMenuOpen(false); 
  };

  const refreshData = async () => {
    if (!currentUser) return;
    try {
        const [plansSnap, mediaSnap, channelsSnap, linksSnap, settingsSnap, strategySettingsSnap] = await Promise.all([
            getDocs(collection(db, "plans")),
            getDocs(collection(db, "media")),
            getDocs(collection(db, "channels")),
            getDocs(query(collection(db, "published_links"), orderBy("createdAt", "desc"))),
            getDoc(doc(db, "settings", "news_config")),
            getDoc(doc(db, "settings", "strategy_config"))
        ]);
        
        setPlans(plansSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setMedia(mediaSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setChannels(channelsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setPublishedLinks(linksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (settingsSnap.exists()) setSystemTags(settingsSnap.data().tags || []);
        if (strategySettingsSnap.exists()) setStrategyTags(strategySettingsSnap.data().tags || []);

        if (userProfile?.role === 'Admin') {
            const usersSnap = await getDocs(collection(db, "user_profiles"));
            const logsSnap = await getDocs(query(collection(db, "logs"), orderBy("createdAt", "desc")));
            setUsersList(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setActivityLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
    setIsDataLoading(false);
  };

  // --- DATA FETCHING (Load Once) ---
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
      if (currentUser) {
          refreshData();
      }
  }, [currentUser, userProfile]);

  useEffect(() => {
    if (!currentUser) return; 
    const q = query(collection(db, "tasks"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(liveTasks);
    });
    return () => unsubscribe();
  }, [currentUser]); 

  const logActivity = async (action, details) => { try { await addDoc(collection(db, "logs"), { action, details, user: currentUser.displayName || currentUser.email, createdAt: serverTimestamp() }); } catch(e) {} };
  
  // --- STATE FOR MODALS ---
  const [editingTask, setEditingTask] = useState(null);
  const [urgentModal, setUrgentModal] = useState(null); 
  const [formModalConfig, setFormModalConfig] = useState({ isOpen: false, title: '', fields: [], onSave: () => {} });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isSopOpen, setIsSopOpen] = useState(false); 

  // --- ACTIONS ---
  const handleUpdateProfile = async (n, p, ph) => { if(!currentUser)return; setIsGlobalLoading(true); try{ await updateProfile(currentUser, {displayName:n, photoURL:p}); await setDoc(doc(db,"user_profiles",currentUser.uid), {phone:ph}, {merge:true}); setCurrentUser({...currentUser, displayName:n, photoURL:p}); setUserProfile(prev=>({...prev, phone:ph})); refreshData(); }catch(e){alert(e.message);} setIsGlobalLoading(false); };
  
  const openFormModal = (title, fields, onSave, submitText, additionalProps = {}) => 
      setFormModalConfig({ isOpen:true, title, fields, onSave: async(d)=>{ setIsGlobalLoading(true); try{await onSave(d); setFormModalConfig(prev=>({...prev, isOpen:false})); refreshData(); }catch(e){alert(e.message);} setIsGlobalLoading(false); }, submitText, ...additionalProps });

  const saveSystemTags = async (newTags, renames) => {
    setIsGlobalLoading(true);
    try {
        await setDoc(doc(db, "settings", "news_config"), { tags: newTags }, { merge: true });
        if (renames && renames.length > 0) {
            const batch = writeBatch(db);
            for (const { oldName, newName } of renames) {
                if (oldName === newName) continue;
                const q = query(collection(db, "published_links"), where("tags", "array-contains", oldName));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const updatedTags = (data.tags || []).map(t => t === oldName ? newName : t);
                    const docRef = doc(db, "published_links", docSnap.id);
                    batch.update(docRef, { tags: updatedTags });
                });
            }
            if (batch.count > 0) await batch.commit();
        }
        setIsTagManagerOpen(false);
        refreshData();
    } catch (e) {
        alert("บันทึกไม่สำเร็จ: " + e.message);
    }
    setIsGlobalLoading(false);
  };

  const saveStrategyTags = async (newTags, renames) => {
    setIsGlobalLoading(true);
    try {
        // Save to Global Settings
        await setDoc(doc(db, "settings", "strategy_config"), { tags: newTags }, { merge: true });
        
        // Handle Renames in Existing Tasks
        if (renames && renames.length > 0) {
            const batch = writeBatch(db);
            for (const { oldName, newName } of renames) {
                if (oldName === newName) continue;
                const q = query(collection(db, "tasks"), where("tags", "array-contains", oldName));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const updatedTags = (data.tags || []).map(t => t === oldName ? newName : t);
                    batch.update(docSnap.ref, { tags: updatedTags, tag: updatedTags.join(', ') });
                });
            }
            await batch.commit();
        }
        setIsStrategyTagManagerOpen(false);
        setStrategyTags(newTags); // Update local state immediately
    } catch (e) {
        alert("บันทึก Tag ไม่สำเร็จ: " + e.message);
    }
    setIsGlobalLoading(false);
  };

  const saveTaskChange = async (task) => {
    if (!task.id) return;
    setIsGlobalLoading(true);
    try {
      const finalTags = (task.tags || []).filter(Boolean).map(t => t.trim());
      const dataToUpdate = {
        title: task.title || "",
        status: task.status || "To Do",
        tags: finalTags,
        tag: finalTags.join(', '), // For legacy compatibility
        role: task.role || "",
        link: task.link || "",
        deadline: task.deadline || "",
        updatedBy: currentUser.displayName,
        updatedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, "tasks", task.id), dataToUpdate);
      logActivity("Edit Task", task.title);
      setEditingTask(null);
    } catch (e) {
      alert(e.message);
    }
    setIsGlobalLoading(false);
  };
  const saveUrgentCase = async (task) => { if(!task.id)return; setIsGlobalLoading(true); try{ await updateDoc(doc(db,"tasks",task.id), {title:task.title||"", status:task.status||"To Do", link:task.link||"", sop:task.sop||[], updatedBy:currentUser.displayName, updatedAt:new Date().toISOString()}); logActivity("Update Urgent", task.title); setUrgentModal(null); refreshData(); }catch(e){alert(e.message);} setIsGlobalLoading(false); };
  
  // --- UPDATED ADD NEW TASK (With Dropdown) ---
  const addNewTask = (key) => openFormModal("เพิ่มงานใหม่", [
      {key:'title', label:'ชื่องาน'}, 
      {key:'tags', label:'Tag', type:'multiselect-dropdown', options: strategyBoardAllTags.filter(t=>t!=='All'), defaultValue: []}, 
      {key:'role', label:'ผู้รับผิดชอบ', defaultValue: currentUser.displayName}, 
      {key:'status', label:'สถานะ', type:'select', options: TASK_STATUSES}, 
      {key:'deadline', label:'กำหนดส่ง', type:'date'}, 
      {key:'link', label:'Link ผลงาน'}
    ], async(d)=>{ 
      const tagsArray = d.tags || [];
      await addDoc(collection(db,"tasks"), {
          ...d, 
          tags: tagsArray,
          tag: tagsArray.join(', '),
          role: d.role || currentUser.displayName, 
          status:d.status||"To Do", 
          link:d.link||"", 
          columnKey:key, 
          createdBy:currentUser.displayName, 
          createdAt:new Date().toISOString()
      }); 
      logActivity("Add Task", d.title); 
      refreshData(); 
  }, "สร้างงาน", { availableTags: strategyBoardAllTags.filter(t=>t!=='All') });

  const addChannel = () => openFormModal("เพิ่มช่องทาง", [{key:'name', label:'ชื่อ'}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:'Own media'}, {key:'url', label:'URL'}], async(d)=>{ await addDoc(collection(db,"channels"), {...d, count:0}); logActivity("Add Channel", d.name); refreshData(); });
  const updateChannel = (c) => openFormModal("แก้ไขช่องทาง", [{key:'name', label:'ชื่อ', defaultValue:c.name}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:c.type}, {key:'url', label:'URL', defaultValue:c.url}], async(d)=>{ await updateDoc(doc(db,"channels",c.id), d); logActivity("Edit Channel", c.name); refreshData(); });
  const addMedia = () => openFormModal("เพิ่มสื่อ", [{key:'name', label:'ชื่อ'}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:'NEWS Website'}, {key:'phone', label:'เบอร์'}, {key:'line', label:'Line'}], async(d)=>{ await addDoc(collection(db,"media"), {...d, active:true}); logActivity("Add Media", d.name); refreshData(); });
  const editMedia = (c) => openFormModal("แก้ไขสื่อ", [{key:'name', label:'ชื่อ', defaultValue:c.name}, {key:'type', label:'ประเภท', type:'select', options: ASSET_TYPES, defaultValue:c.type}, {key:'phone', label:'เบอร์', defaultValue:c.phone}, {key:'line', label:'Line', defaultValue:c.line}], async(d)=>{ await updateDoc(doc(db,"media",c.id), d); logActivity("Edit Media", c.name); refreshData(); });

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
      {key:'tags', label:'Tags', type:'multiselect-dropdown', options: systemTags, defaultValue: []} 
    ], async(d)=>{ 
      const finalDate = d.customDate ? new Date(d.customDate) : new Date();
      await addDoc(collection(db,"published_links"), { title: d.title.trim() || "No Title", url: d.url || "", imageUrl: d.imageUrl || "", platform: d.platform || "Website", tags: d.tags || [], createdBy:currentUser.displayName, createdAt: finalDate }); 
      logActivity("Add Link", d.title); 
      refreshData();
    }, "บันทึกข้อมูล", { availableTags: systemTags });
  };

  const editPublishedLink = (link) => openFormModal("แก้ไขข่าว", [
    {key:'title', label:'หัวข้อข่าว', defaultValue: link.title},
    {key:'url', label:'URL ข่าว', defaultValue: link.url},
    {key:'imageUrl', label:'Link รูปภาพ', defaultValue: link.imageUrl}, 
    {key:'customDate', label:'วันที่ลงข่าว', type:'datetime-local', defaultValue: formatForInput(link.createdAt)},
    {key:'platform', label:'Platform', type:'select', options: ['Website', 'Facebook', 'YouTube', 'TikTok', 'Twitter'], defaultValue: link.platform},
    {key:'tags', label:'Tags', type:'multiselect-dropdown', options: systemTags, defaultValue: link.tags || []} 
  ], async(d)=>{ 
    const newDate = d.customDate ? new Date(d.customDate) : null;
    await updateDoc(doc(db,"published_links",link.id), { ...d, tags: d.tags || [], createdAt: newDate || link.createdAt, updatedAt:serverTimestamp() }); 
    logActivity("Edit Link", d.title); 
    refreshData();
  }, "บันทึก", { availableTags: systemTags });

  const deleteLink = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"published_links",id)); logActivity("Delete Link", id); refreshData(); }};
  const deleteChannel = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"channels",id)); logActivity("Delete Channel", id); refreshData(); }};
  const deleteMedia = async (id) => { if(confirm("ลบ?")) { await deleteDoc(doc(db,"media",id)); logActivity("Delete Media", id); refreshData(); }};

  const togglePlanItem = async (pid, idx, items) => { const newItems = [...items]; newItems[idx].completed = !newItems[idx].completed; const progress = Math.round((newItems.filter(i=>i.completed).length/newItems.length)*100); await updateDoc(doc(db,"plans",pid), {items:newItems, progress}); refreshData(); };
  const removePlanItem = async (pid, idx, items) => { if(confirm("ลบ?")) { const newItems = items.filter((_,i)=>i!==idx); const p = Math.round((newItems.filter(i=>i.completed).length/newItems.length)*100)||0; await updateDoc(doc(db,"plans",pid), {items:newItems, progress:p}); refreshData(); }};
  const editPlanItem = (pid, idx, items) => openFormModal("แก้รายการ", [{key:'text', label:'ข้อความ', defaultValue:items[idx].text}], async(d)=> { const newItems=[...items]; newItems[idx].text=d.text; await updateDoc(doc(db,"plans",pid), {items:newItems}); refreshData(); });
  const editPlanTitle = (p) => openFormModal("แก้ชื่อแผน", [{key:'title', label:'ชื่อ', defaultValue:p.title}], async(d)=> { await updateDoc(doc(db,"plans",p.id), d); refreshData(); });
  const addPlan = () => openFormModal("สร้างแผนใหม่", [{key:'title', label:'ชื่อแผน'}], async(d)=> { await addDoc(collection(db,"plans"), {...d, progress:0, items:[]}); logActivity("Create Plan", d.title); refreshData(); });
  const createUrgentCase = () => openFormModal("เปิดเคสด่วน", [{key:'title', label:'หัวข้อ'}, {key:'deadline', label:'เสร็จภายใน', type:'date'}], async(d) => { await addDoc(collection(db,"tasks"), { ...d, status:"To Do", role:"Hunter", tag:"Urgent", link:"", columnKey:"defender", sop:DEFAULT_SOP, createdBy:currentUser.displayName, createdAt:new Date().toISOString() }); alert("เปิดเคสแล้ว!"); logActivity("Open Urgent", d.title); refreshData(); });
  const updateUserStatus = (uid, status, role) => { updateDoc(doc(db, "user_profiles", uid), { status, role }); logActivity("Admin Update", `${uid} -> ${status}`); refreshData(); };

  // --- RENDERING ---
  const sortTasks = (taskList) => {
    if(!taskList) return [];
    return [...taskList].sort((a, b) => {
       const getDateValue = (item) => {
           if (item.deadline) return new Date(item.deadline).getTime();
           return 0;
       };
       const timeA = getDateValue(a);
       const timeB = getDateValue(b);
       if(sortOrder === 'newest') return timeB - timeA; 
       if(sortOrder === 'oldest') return timeA - timeB; 
       return 0;
    });
  };

  const groupedTasks = { solver: sortTasks(tasks.filter(t => t.columnKey === 'solver')), principles: sortTasks(tasks.filter(t => t.columnKey === 'principles')), defender: sortTasks(tasks.filter(t => t.columnKey === 'defender')), expert: sortTasks(tasks.filter(t => t.columnKey === 'expert')), backoffice: sortTasks(tasks.filter(t => t.columnKey === 'backoffice')) };
  const urgentTasks = tasks.filter(t => t.tag === 'Urgent');
  
  const navItems = [
    { id: 'dashboard', title: 'ภาพรวม', subtitle: 'Dashboard', icon: LayoutDashboard },
    { id: 'newsroom', title: 'ห้องข่าว & สื่อ', subtitle: 'Newsroom', icon: Globe, color: 'text-indigo-500' }, 
    { id: 'strategy', title: 'กระดาน 4 แกน', subtitle: 'Strategy', icon: Megaphone },
    { id: 'masterplan', title: 'แผนงานหลัก', subtitle: 'Master Plan', icon: MapIcon }, // <-- ใช้ MapIcon ตรงนี้
    { id: 'rapidresponse', title: 'ปฏิบัติการด่วน', subtitle: 'Rapid Response', icon: Zap, color: 'text-red-500' },
    { id: 'assets', title: 'คลังข้อมูลสื่อ', subtitle: 'Media Assets', icon: Database },
  ];
  if(userProfile?.role === 'Admin') navItems.push({ id: 'admin', title: 'ผู้ดูแลระบบ', subtitle: 'Admin & Logs', icon: Shield });

  const getInitials = (name) => {
    if (!name) return '';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const renderDashboard = () => {
    const taskStats = { done: 0, doing: 0, waiting: 0, total: 0 };
    tasks.forEach(t => { if (t.status !== 'Canceled') { taskStats.total++; if (t.status === 'Done') taskStats.done++; else if (t.status === 'In Progress' || t.status === 'In Review') taskStats.doing++; else taskStats.waiting++; } });
    return (
      <div className="space-y-6 animate-fadeIn">
        <PageHeader title="ภาพรวมสถานการณ์" subtitle="Overview & Statistics" action={<div className="flex gap-2"><button onClick={() => setIsSearchOpen(true)} className="p-2 bg-white border rounded-lg text-slate-500 hover:bg-slate-50"><Search className="w-5 h-5"/></button><button onClick={() => addNewTask('solver')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700 transition-colors"> + งานทั่วไป </button><button onClick={addPublishedLink} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"> เพิ่มข่าว </button></div>} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center relative overflow-hidden"><p className="text-slate-500 text-xs font-bold uppercase mb-6 w-full text-left">Task Status</p><StatusDonutChart stats={taskStats} /><div className="flex justify-center gap-4 mt-6 text-[10px] font-bold w-full flex-wrap"><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>เสร็จ ({taskStats.done})</div><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div>กำลังทำ ({taskStats.doing})</div><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300"></div>รอ ({taskStats.waiting})</div></div></div>
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-blue-500"/>
                พรีวิว 4 แกน
              </h3>
              <button onClick={() => navigateTo('strategy')} className="text-sm text-blue-600 font-bold hover:underline">
                ไปที่กระดาน &rarr;
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['solver', 'principles', 'defender', 'expert'].map(key => (
                <div key={key} className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                  <h4 className="font-black text-slate-700 text-xs uppercase truncate mb-2">{COLUMN_LABELS[key]}</h4>
                  <div className="space-y-2">
                    {groupedTasks[key].slice(0, 3).map(task => (
                      <div key={task.id} onClick={() => { const taskToEdit = {...task}; if (!Array.isArray(taskToEdit.tags)) { taskToEdit.tags = taskToEdit.tag && typeof taskToEdit.tag === 'string' ? taskToEdit.tag.split(',').map(t=>t.trim()).filter(Boolean) : []}; setEditingTask(taskToEdit); }} className="bg-white p-2.5 rounded-md shadow-sm border border-slate-100 cursor-pointer hover:border-blue-400 transition-all group">
                        <p className="text-xs font-bold text-slate-600 line-clamp-2 group-hover:text-blue-600">{task.title}</p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                          <StatusBadge status={task.status} />
                          <span className="text-[10px] text-slate-400 font-medium">{getInitials(task.role || task.createdBy)}</span>
                        </div>
                      </div>
                    ))}
                    {groupedTasks[key].length === 0 && (
                      <div className="flex flex-col items-center justify-center text-center py-4 bg-white rounded-md border border-slate-100">
                          <p className="text-xs text-slate-400">ไม่มีงาน</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="pt-6 border-t border-slate-200"><div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><Globe className="w-5 h-5 text-indigo-500"/> ข่าวประชาสัมพันธ์ล่าสุด</h3><button onClick={() => navigateTo('newsroom')} className="text-sm text-indigo-600 font-bold hover:underline"> ดูทั้งหมด &rarr;</button></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{publishedLinks.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 4).map(link => (<a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="group bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all flex flex-col"><div className="aspect-video bg-slate-100 relative overflow-hidden">{link.imageUrl ? <img src={link.imageUrl} alt={link.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /> : <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><FileText className="w-8 h-8 mb-1"/><span className="text-[10px]">No Image</span></div>}</div><div className="p-3 flex flex-col flex-1"><span className="text-[9px] font-bold text-indigo-500 uppercase mb-1">{link.platform || 'News'}</span><h4 className="font-bold text-slate-800 text-xs line-clamp-2 mb-2 group-hover:text-indigo-600 transition">{link.title}</h4><div className="text-[9px] text-slate-400 font-medium mb-2 flex items-center gap-1"><LinkIcon className="w-2.5 h-2.5" />{getDomain(link.url)}</div><div className="mt-auto flex items-center gap-1 text-[9px] text-slate-400"><Clock className="w-3 h-3"/> {link.createdAt ? formatDate(link.createdAt).split(' ')[0] : '-'}</div></div></a>))}</div></div>
        
        {urgentModal && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn"><div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative"><button onClick={() => setUrgentModal(null)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button><h3 className="font-bold text-xl text-slate-800 mb-6 flex items-center gap-2"><AlertTriangle className="text-red-500"/> แก้ไขเคสด่วน</h3><div className="space-y-4"><input type="text" value={urgentModal.title} onChange={e=>setUrgentModal({...urgentModal, title:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" /><div className="flex gap-4"><select value={urgentModal.status} onChange={e=>setUrgentModal({...urgentModal, status:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm"><option>To Do</option><option>In Progress</option><option>In Review</option><option>Done</option><option>Canceled</option></select></div><div><p className="text-sm font-bold text-slate-600 mb-2">Checklist ความคืบหน้า</p><div className="space-y-2">{urgentModal.sop?.map((item, idx) => (<div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"><label htmlFor={`sop-${idx}`} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" id={`sop-${idx}`} checked={item.done} onChange={()=>{ const newSop = [...urgentModal.sop]; newSop[idx].done = !newSop[idx].done; setUrgentModal({...urgentModal, sop: newSop}); }} />{item.text}</label></div>))}</div></div><input type="text" value={urgentModal.link} onChange={e=>setUrgentModal({...urgentModal, link:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm" placeholder="Link ผลงาน" /></div><div className="mt-6 flex justify-end gap-3"><button onClick={() => setUrgentModal(null)} className="px-4 py-2 rounded-lg text-slate-600 border border-slate-300 hover:bg-slate-100">ยกเลิก</button><button onClick={() => saveUrgentCase(urgentModal)} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700">บันทึก</button></div></div></div>}
      </div>
    );
  };

  const renderStrategy = () => {
      return (
        <div className="h-full flex flex-col">
          <PageHeader title="กระดานยุทธศาสตร์ 4 แกน" subtitle="Strategy Board & Tasks" action={<div className="flex flex-wrap gap-3"><div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200"><ArrowDownWideNarrow className="w-4 h-4 text-slate-500" /><select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer outline-none"><option value="newest">ล่าสุด (Newest)</option><option value="oldest">เก่าสุด (Oldest)</option></select></div><div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200"><Filter className="w-4 h-4 text-slate-500" /><select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="bg-transparent text-sm border-none focus:ring-0 cursor-pointer outline-none"><option value="All">All Tags</option>{strategyBoardAllTags.filter(t=>t!=='All').map(tag => <option key={tag} value={tag}>{tag}</option>)}</select></div><button onClick={() => setHideDone(!hideDone)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold border transition ${hideDone ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-300'}`}>{hideDone ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />} {hideDone ? "Show Done" : "Hide Done"}</button><button onClick={() => setIsStrategyTagManagerOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold border transition bg-slate-800 text-white hover:bg-black border-slate-600"><Tag className="w-4 h-4" /> จัดการ Tag</button></div>} />
          <div className="overflow-x-auto pb-4 flex-1 custom-scrollbar">
            <div className="flex flex-col md:flex-row gap-4 min-w-full md:min-w-[1200px] h-full">
              {['solver', 'principles', 'defender', 'expert', 'backoffice'].map((key) => {
                const filteredAndSorted = groupedTasks[key].filter(t => {
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
                      <button onClick={() => addNewTask(key)} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-blue-600 hover:text-white transition"><Plus className="w-5 h-5"/></button>
                    </div>
                    <div className="space-y-3 overflow-y-auto flex-1 -mr-2 pr-2 custom-scrollbar">
                      {filteredAndSorted.map(task => {
                        const taskTags = Array.isArray(task.tags) ? task.tags : (task.tag ? task.tag.split(',').map(s=>s.trim()).filter(Boolean) : []);
                        return (
                          <div key={task.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group relative">
                            <div className="flex justify-between items-start" onClick={() => { const taskToEdit = {...task}; if (!Array.isArray(taskToEdit.tags)) { taskToEdit.tags = taskToEdit.tag && typeof taskToEdit.tag === 'string' ? taskToEdit.tag.split(',').map(t=>t.trim()).filter(Boolean) : []}; setEditingTask(taskToEdit); }}>
                              <p className="text-sm font-bold text-slate-800 line-clamp-3 pr-4 group-hover:text-blue-700">{task.title}</p>
                              <StatusBadge status={task.status} />
                            </div>
                            {taskTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {taskTags.map(t => (
                                  <span key={t} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">{t}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-end justify-between mt-3 pt-3 border-t border-slate-100">
                              <div className="flex items-center gap-2 text-xs text-slate-500">
  {task.deadline && (
    <div className="flex items-center gap-1">
      <Clock className="w-3.5 h-3.5"/>
      <span>
        {new Date(task.deadline).toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'short',
          year: '2-digit'
        })}
      </span>
    </div>
  )}
</div>
                              <div className="flex items-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); const taskToEdit = {...task}; if (!Array.isArray(taskToEdit.tags)) { taskToEdit.tags = taskToEdit.tag && typeof taskToEdit.tag === 'string' ? taskToEdit.tag.split(',').map(t=>t.trim()).filter(Boolean) : []}; setEditingTask(taskToEdit); }} className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs border-2 border-white shadow-sm font-bold">{getInitials(task.role || task.createdBy)}</div>
                              </div>
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

  const renderRapidResponse = () => (
    <div className="space-y-6">
      <PageHeader title="ปฏิบัติการด่วน" subtitle="Agile Response Unit" action={<button onClick={createUrgentCase} className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-red-700 shadow-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> เปิดเคสด่วน</button>} />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className={`lg:w-1/3 bg-white rounded-2xl border border-slate-200 shadow-sm h-fit overflow-hidden`}>
          <div className="p-4 bg-slate-50 font-bold text-slate-800 flex items-center gap-2 cursor-pointer" onClick={()=>setIsSopOpen(!isSopOpen)}>
            <FileText className="w-5 h-5"/> SOP Guide (คู่มือ) <ChevronDown className={`ml-auto transform ${isSopOpen?'rotate-180':''}`}/>
          </div>
          {isSopOpen && <div className="p-6 space-y-3 text-sm text-slate-600">{SOP_GUIDE.map((s,i)=><p key={i}>{s}</p>)}</div>}
        </div>
        <div className="lg:w-2/3 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {urgentTasks.map(task => (
              <div key={task.id} className="bg-white p-5 rounded-2xl border-l-[6px] border-red-500 shadow-sm hover:shadow-md cursor-pointer" onClick={() => setUrgentModal(task)}>
                <div className="flex justify-between mb-3">
                  <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded animate-pulse">URGENT</span>
                  <StatusBadge status={task.status} />
                </div>
                <h3 className="font-bold text-slate-800 mb-3 text-lg">{task.title}</h3>
                {task.deadline && <p className="text-xs text-slate-500 mb-4 flex gap-1"><Clock className="w-3.5 h-3.5"/> {task.deadline}</p>}
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Progress Checklist</p>
                  <div className="flex gap-1.5 h-2">
                    {(task.sop && task.sop.length > 0 ? task.sop : Array(5).fill({done:false})).map((s, i) => (
                      <div key={i} className={`flex-1 rounded-full transition-all ${s.done ? 'bg-green-500 shadow-sm' : 'bg-slate-200'}`}></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold mb-4">Backoffice (งานสนับสนุน)</h3>
            <div className="space-y-2">
              {groupedTasks.backoffice.map(t=>(
                <div key={t.id} onClick={() => { const taskToEdit = {...t}; if (!Array.isArray(taskToEdit.tags)) { taskToEdit.tags = taskToEdit.tag && typeof taskToEdit.tag === 'string' ? taskToEdit.tag.split(',').map(tag=>tag.trim()).filter(Boolean) : []}; setEditingTask(taskToEdit); }} className="flex justify-between items-center p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                  <div>
                    <p className="font-bold">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                  <StatusBadge status={t.status}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAssets = () => (
    <div className="space-y-6">
      <PageHeader title="คลังข้อมูลสื่อ" subtitle="Media Assets" />
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-2xl shadow-lg text-white flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-black mb-2">Google Drive</h3>
          <p className="text-blue-100">พื้นที่เก็บไฟล์ต้นฉบับ</p>
        </div>
        <a href="https://drive.google.com/drive/folders/0AHTNNQ96Wgq-Uk9PVA" target="_blank" rel="noreferrer" className="bg-white text-blue-700 px-6 py-3 rounded-xl font-bold shadow-xl flex items-center gap-2">
          <ExternalLink className="w-5 h-5"/> เปิด Drive
        </a>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between mb-6">
            <h3 className="font-bold text-lg">Channels</h3>
            <button onClick={addChannel} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold">+ เพิ่ม</button>
          </div>
          <div className="space-y-3">
            {channels.map(c => (
              <div key={c.id} className="flex justify-between p-4 border rounded-xl hover:shadow-md cursor-pointer" onClick={() => updateChannel(c)}>
                <div>
                  <p className="font-bold text-slate-700">{c.name}</p>
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{c.type}</span>
                </div>
                <button onClick={(e) => {e.stopPropagation(); deleteChannel(c.id)}}>
                  <Trash2 className="w-5 h-5 text-slate-300 hover:text-red-500"/>
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between mb-6">
            <h3 className="font-bold text-lg">Media List</h3>
            <button onClick={addMedia} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold">+ เพิ่ม</button>
          </div>
          <div className="space-y-3 overflow-y-auto max-h-[500px]">
            {media.map(c => (
              <div key={c.id} className="flex justify-between p-4 border rounded-xl hover:shadow-md">
                <div onClick={() => editMedia(c)} className="flex-1 cursor-pointer">
                  <p className="font-bold text-slate-700">{c.name}</p>
                  <div className="text-xs text-slate-500 mt-1 flex gap-4">
                    <span>{c.type}</span>
                    <span>{c.phone}</span>
                    <span>{c.line}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => {e.stopPropagation(); deleteMedia(c.id)}}>
                    <Trash2 className="w-5 h-5 text-slate-300 hover:text-red-500"/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

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
            <button onClick={() => addPublishedLink()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-md flex items-center gap-2 h-fit mb-0.5"><Plus className="w-4 h-4" /> เพิ่มข่าว</button>
          </div>
        } />

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
                            <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400"><span>
  {link.createdAt ? (link.createdAt.toDate ? link.createdAt.toDate() : new Date(link.createdAt)).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }) + ' น.' : '-'}
</span></div>
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

        <button
          onClick={() => addPublishedLink()}
          className="fixed bottom-8 right-8 z-[50] bg-blue-600 text-white w-14 h-14 rounded-full shadow-2xl hover:bg-blue-700 hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center group"
          title="เพิ่มข่าวประชาสัมพันธ์"
          style={{ boxShadow: '0 4px 20px rgba(37, 99, 235, 0.5)' }} 
        >
          <Plus className="w-8 h-8" />
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

  // --- FINAL RETURN WITH AUTH CHECKS ---
  if (authLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-blue-600"/></div>;
  if (!currentUser) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row">
      <LoadingOverlay isOpen={isGlobalLoading} />
      
      {/* --- MOVED MODAL TO ROOT LEVEL --- */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={() => setEditingTask(null)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full">
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <h3 className="font-bold text-xl text-slate-800 mb-6">แก้ไขงาน</h3>
            <div className="space-y-4">
              <input type="text" value={editingTask.title} onChange={e=>setEditingTask({...editingTask, title:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="ชื่องาน" />
              
              <MultiTagSelector 
                availableTags={strategyBoardAllTags.filter(t => t !== 'All')}
                selectedTags={editingTask.tags || (editingTask.tag ? editingTask.tag.split(',').map(t=>t.trim()).filter(Boolean) : [])}
                onTagsChange={(newTags) => {
                  setEditingTask({...editingTask, tags: newTags, tag: newTags.join(', ') });
                }}
              />
              
              <input type="text" value={editingTask.role||""} onChange={e=>setEditingTask({...editingTask, role:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" placeholder="ผู้รับผิดชอบ" />
              <div className="grid grid-cols-2 gap-4">
                <select value={editingTask.status} onChange={e=>setEditingTask({...editingTask, status:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm">
                  {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="date" value={editingTask.deadline} onChange={e=>setEditingTask({...editingTask, deadline:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm" />
              </div>
              <input type="text" value={editingTask.link} onChange={e=>setEditingTask({...editingTask, link:e.target.value})} className="w-full border-2 border-slate-200 rounded-lg p-2.5 text-sm" placeholder="Link ผลงาน" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditingTask(null)} className="px-4 py-2 rounded-lg text-slate-600 border border-slate-300 hover:bg-slate-100">ยกเลิก</button>
              <button onClick={() => saveTaskChange(editingTask)} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      <FormModal {...formModalConfig} onClose={() => setFormModalConfig(prev => ({ ...prev, isOpen: false }))} />
      <SearchModal isOpen={isSearchOpen} onClose={()=>setIsSearchOpen(false)} data={{tasks, media, channels}} onNavigate={navigateTo} />
      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} user={currentUser} userProfile={userProfile} onUpdate={handleUpdateProfile} />
      
      {/* --- UPDATED TAG MANAGER ---
         ตอนนี้ส่ง tagsForStrategyManager เข้าไปแทน strategyTags เดิม
         ทำให้เห็น Tag ครบถ้วนตามหน้ากระดาน 
      */}
      <TagManagerModal 
        isOpen={isStrategyTagManagerOpen} 
        onClose={() => setIsStrategyTagManagerOpen(false)} 
        existingTags={tagsForStrategyManager} 
        onSave={saveStrategyTags}
        title="จัดการ Tag (กระดาน 4 แกน)"
      />

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