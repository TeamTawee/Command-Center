import React, { useState, useEffect } from 'react';
import { X, Plus, ArrowUp, ArrowDown, Trash2, Save, Search, ChevronDown, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';

export const TagManagerModal = ({ isOpen, onClose, existingTags, onSave }) => {
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

export const SearchModal = ({ isOpen, onClose, data, onNavigate }) => {
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

export const FormModal = ({ isOpen, onClose, title, fields, onSave, submitText = "บันทึก", availableTags = [] }) => {
  const [formData, setFormData] = useState({});
  const [tagInput, setTagInput] = useState(""); 
  const [openDropdown, setOpenDropdown] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const initialData = {};
      fields.forEach(f => {
        if (f.type === 'tags' || f.type === 'multiselect-dropdown') {
            initialData[f.key] = f.defaultValue || [];
        } else {
            // จุดที่ 1: กำหนดค่า Default เป็น '' เสมอถ้าไม่มีค่า
            initialData[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
        }
      });
      setFormData(initialData);
      setTagInput("");
      setOpenDropdown(null);
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1200] p-4 animate-fadeIn overflow-y-auto" onClick={() => setOpenDropdown(null)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100 relative max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-full transition"><X className="w-5 h-5 text-slate-400" /></button>
        <h3 className="text-xl font-bold text-slate-800 mb-6 pr-8">{title}</h3>
        <div className="space-y-5">
           {fields.map((field) => (
             <div key={field.key}>
                <label className="text-xs font-bold text-slate-500 mb-1.5 uppercase flex items-center gap-2">{field.label}</label>
                
                {/* กรณี Multi-select Dropdown */}
                {field.type === 'multiselect-dropdown' ? (
                  <div className="relative">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === field.key ? null : field.key); }} className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-left font-medium text-slate-700 transition-all flex justify-between items-center">
                      <span className="line-clamp-1">{(formData[field.key] || []).length > 0 ? (formData[field.key] || []).join(', ') : 'เลือก Tags...'}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openDropdown === field.key ? 'rotate-180' : ''}`} />
                    </button>
                    {openDropdown === field.key && (
                        <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto custom-scrollbar">
                            {field.options.map(option => {
                                const optionName = typeof option === 'string' ? option : option.name;
                                const optionColor = (typeof option === 'object' && option.color) ? option.color : '#cbd5e1'; 
                                return (
                                <label key={optionName} className="flex items-center gap-3 p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        checked={(formData[field.key] || []).includes(optionName)}
                                        onChange={(e) => {
                                            const current = formData[field.key] || [];
                                            const newTags = e.target.checked
                                                ? [...current, optionName]
                                                : current.filter(t => t !== optionName);
                                            setFormData({...formData, [field.key]: newTags});
                                        }}
                                    />
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: optionColor }}></div>
                                    <span className="font-medium text-sm text-slate-700">{optionName}</span>
                                </label>
                            )})}
                        </div>
                    )}
                  </div>

                /* กรณี Tags แบบเดิม */
                ) : field.type === 'tags' ? (
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

                /* กรณี Select Dropdown */
                ) : field.type === 'select' ? (
                   <div className="relative">
                        <select 
                            value={formData[field.key] || ''}  // จุดที่ 2: ใส่ || '' เพื่อแก้ Warning
                            onChange={(e) => setFormData({...formData, [field.key]: e.target.value})} 
                            className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none appearance-none font-medium text-slate-700 transition-all"
                        >
                            {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none"/>
                   </div>

                /* กรณี Input ทั่วไป (Text, Date, Link) */
                ) : (
                   <input 
                        type={field.type || 'text'} 
                        value={formData[field.key] || ''} // จุดที่ 3: ใส่ || '' เพื่อแก้ Warning
                        onChange={(e) => setFormData({...formData, [field.key]: e.target.value})} 
                        className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:bg-white focus:border-blue-500 outline-none font-medium text-slate-700 transition-all placeholder:text-slate-300" 
                        placeholder={field.placeholder || ''} 
                        list={field.type === 'datalist' ? `list-${field.key}` : undefined} 
                   />
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

export const ProfileModal = ({ isOpen, onClose, user, userProfile, onUpdate }) => {
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