// utils.js

// --- Date Formatting ---
export const formatDate = (val) => {
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

// --- Week Calculation ---
export const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
  return `Week ${weekNo}`;
};

// --- Domain Extraction ---
export const getDomain = (url) => {
  try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return 'External'; }
};

// --- Date Input Format ---
export const formatForInput = (val) => {
  if (!val) return '';
  let d;
  if (val && typeof val.toDate === 'function') { d = val.toDate(); } else { d = new Date(val); }
  if (isNaN(d.getTime())) d = new Date();
  const pad = (n) => n < 10 ? '0' + n : n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 🤖 ระบบดูดข่าวอัจฉริยะ (Full Option + Safety Check)
export const fetchLinkMetadata = async (url) => {
  if (!url) return null;
  let rawHtml = null;

  // 1. ลองดึงผ่าน Proxy ตัวที่ 1
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    if (res.ok) rawHtml = await res.text();
  } catch (e) { /* เงียบไว้ */ }

  // 2. ถ้าไม่ได้ ลองตัวที่ 2 (AllOrigins)
  if (!rawHtml) {
    try {
      const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData.contents) rawHtml = proxyData.contents;
      }
    } catch (e) { /* เงียบไว้ */ }
  }

  // ถ้าดึง HTML ไม่ได้เลย ให้จบ
  if (!rawHtml) return { title: "", image: "", date: "" }; 

  // 3. แกะข้อมูลพื้นฐานจาก HTML (วิธีมาตรฐาน)
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const getMeta = (prop) => doc.querySelector(`meta[property="${prop}"]`)?.content || doc.querySelector(`meta[name="${prop}"]`)?.content;

  let title = getMeta("og:title") || doc.title || "";
  let image = getMeta("og:image") || "";
  let date = getMeta("article:published_time") || getMeta("date") || getMeta("pubdate") || doc.querySelector("time")?.getAttribute("datetime") || "";

  // กรอง Title ที่ไม่สื่อความหมาย (พวก Cloudflare block)
  if (title.includes("Just a moment") || title.includes("Attention Required") || title.includes("Cloudflare")) {
      title = ""; 
  }

  let result = { title, image, date };

  // 4. ใช้ AI ช่วยแกะ (ถ้าข้อมูลไม่ครบ)
  if (!result.title || !result.date) {
      
      // --- จุดที่เพิ่มเพื่อแก้ Error 404: เช็คว่ามี Key จริงไหม ---
      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
      if (!GEMINI_API_KEY) {
          // ถ้าไม่มี Key ให้ส่งค่าที่แกะได้เท่าที่มีกลับไปเลย (ไม่ยิงไปให้ Error)
          return result;
      }
      
      const shortHtml = rawHtml.substring(0, 15000); // ตัด HTML ให้สั้นลง
      
      // รายชื่อโมเดลที่จะวนใช้ (ตามโค้ดเดิมที่คุณต้องการ)
      const modelCandidates = ["gemini-1.5-flash", "gemini-pro", "gemini-1.5-pro", "gemini-1.0-pro"];

      for (const model of modelCandidates) {
          try {
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
                    // อัปเดตข้อมูลถ้า AI หาเจอ
                    if ((!result.title || result.title.includes("Just a moment")) && aiResult.title) result.title = aiResult.title;
                    if (!result.image && aiResult.image) result.image = aiResult.image;
                    if (!result.date && aiResult.date) result.date = aiResult.date; 
                    break; // ถ้าสำเร็จแล้ว ให้หยุดวนลูป
                }
            }
          } catch (e) { 
            // เงียบไว้ แล้วลองโมเดลถัดไป
          }
      }
  }
  return result;
};