import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingOverlay = ({ isOpen, message = "กำลังทำงาน..." }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center z-[2000] animate-fadeIn">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-3" />
      <p className="text-slate-600 font-bold animate-pulse">{message}</p>
    </div>
  );
};

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
    <div><h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">{title}</h2><p className="text-slate-500 text-sm mt-1 font-medium">{subtitle}</p></div>
    <div className="w-full md:w-auto">{action}</div>
  </div>
);

export const StatusBadge = ({ status }) => {
  const styles = { "To Do": "bg-slate-100 text-slate-600 border-slate-200", "In Progress": "bg-blue-50 text-blue-600 border-blue-100", "In Review": "bg-purple-50 text-purple-600 border-purple-100", "Done": "bg-emerald-50 text-emerald-600 border-emerald-100", "Idea": "bg-yellow-50 text-yellow-600 border-yellow-100", "Waiting list": "bg-orange-50 text-orange-600 border-orange-100", "Canceled": "bg-gray-50 text-gray-400 border-gray-200 line-through" };
  return <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wide font-bold border ${styles[status] || "bg-gray-100"}`}>{status}</span>;
};

export const StatusDonutChart = ({ stats }) => {
  const total = stats.total || 1; 
  const donePercent = (stats.done / total) * 100;
  const doingPercent = (stats.doing / total) * 100;
  const circumference = 2 * Math.PI * 40;
  return (
    <div className="relative w-48 h-48 flex items-center justify-center"><svg className="transform -rotate-90 w-full h-full" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" className="stroke-slate-200" strokeWidth="12" strokeLinecap="round" /><circle cx="50" cy="50" r="40" fill="none" className="stroke-blue-500 transition-all duration-1000 ease-out" strokeWidth="12" strokeDasharray={`${(donePercent + doingPercent) / 100 * circumference} `} strokeLinecap="round" /><circle cx="50" cy="50" r="40" fill="none" className="stroke-emerald-500 transition-all duration-1000 ease-out" strokeWidth="12" strokeDasharray={`${(donePercent / 100) * circumference} `} strokeLinecap="round" /></svg><div className="absolute text-center"><span className="text-4xl font-black text-slate-800">{stats.total}</span><span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">ACTIVE TASKS</span></div></div>
  );
};