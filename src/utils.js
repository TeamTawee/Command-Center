// utils.js

// --- 1. Date Formatting (คงเดิม) ---
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

// --- 2. Week Calculation (คงเดิม) ---
export const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
  return `Week ${weekNo}`;
};

// --- 3. Domain Extraction (คงเดิม) ---
export const getDomain = (url) => {
  try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return 'External'; }
};

// --- 4. Date Input Format (คงเดิม) ---
export const formatForInput = (val) => {
  if (!val) return '';
  let d;
  if (val && typeof val.toDate === 'function') { d = val.toDate(); } else { d = new Date(val); }
  if (isNaN(d.getTime())) d = new Date();
  const pad = (n) => n < 10 ? '0' + n : n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// --- 5. Helper: Logic การแปลงวันที่ (Universal Thai Date Parser) ---
const parseSmartDate = (text) => {
  if (!text) return null;
  text = text.toString().trim();
  if (text.length > 150 || text.length < 4) return null; // ลด min length ลงรองรับเคสสั้นๆ

  // 1. Timestamp
  if (/^\d{10,13}$/.test(text)) {
    let ts = parseInt(text);
    if (text.length === 10) ts *= 1000;
    let d = new Date(ts);
    return !isNaN(d.getTime()) ? d.toISOString() : null;
  }

  // 2. ISO Date
  if (/^["']?\d{4}-\d{2}-\d{2}/.test(text)) {
    let cleanISO = text.replace(/["'\\]/g, '');
    let d = new Date(cleanISO);
    return !isNaN(d.getTime()) ? d.toISOString() : null;
  }

  // 3. Clean Text (Thai & Special Chars)
  // เพิ่มการ Clean อักขระพิเศษที่อาจติดมาจาก Description
  let cleanText = text.replace(/วัน(จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)/g, '') 
                      .replace(/ที่|พ\.ศ\.|น\.|,|\||\-/g, '') // เอา - ออกด้วย
                      .replace(/\s+/g, ' ')
                      .replace(/(\d{1,2})\.(\d{2})/, '$1:$2').trim(); 

  // 4. Map Thai Months
  const thaiMonths = [
    { s: 'ม\\.ค\\.?', f: 'มกราคม', e: 'Jan' }, { s: 'ก\\.พ\\.?', f: 'กุมภาพันธ์', e: 'Feb' },
    { s: 'มี\\.ค\\.?', f: 'มีนาคม', e: 'Mar' }, { s: 'เม\\.ย\\.?', f: 'เมษายน', e: 'Apr' },
    { s: 'พ\\.ค\\.?', f: 'พฤษภาคม', e: 'May' }, { s: 'มิ\\.ย\\.?', f: 'มิถุนายน', e: 'Jun' },
    { s: 'ก\\.ค\\.?', f: 'กรกฎาคม', e: 'Jul' }, { s: 'ส\\.ค\\.?', f: 'สิงหาคม', e: 'Aug' },
    { s: 'ก\\.ย\\.?', f: 'กันยายน', e: 'Sep' }, { s: 'ต\\.ค\\.?', f: 'ตุลาคม', e: 'Oct' },
    { s: 'พ\\.ย\\.?', f: 'พฤศจิกายน', e: 'Nov' }, { s: 'ธ\\.ค\\.?', f: 'ธันวาคม', e: 'Dec' }
  ];

  let engText = cleanText;
  thaiMonths.forEach(m => { 
      engText = engText.replace(new RegExp(m.f, 'g'), m.e).replace(new RegExp(m.s, 'g'), m.e); 
  });

  // 5. Extract Date Parts 
  const datePattern = /(\d{1,2})[\s\/\-\.]*([A-Za-z]{3,})[\s\/\-\,\.]*(\d{2,4})?/; // ทำให้ปีเป็น Optional
  const timePattern = /(\d{1,2}:\d{2})/;
  const dateMatch = engText.match(datePattern);
  const timeMatch = engText.match(timePattern);
  let finalTime = timeMatch ? timeMatch[1] : "00:00";

  if (dateMatch) {
    let year = dateMatch[3] ? parseInt(dateMatch[3]) : null;
    
    // ถ้าไม่มีปีมา ให้ใช้ปีปัจจุบัน (Logic สำหรับ MCOT/TNA)
    if (!year) {
        year = new Date().getFullYear(); 
        // ถ้าเดือนของข่าว > เดือนปัจจุบัน แสดงว่าเป็นข่าวเก่าปีที่แล้ว (case edge) หรือข่าวอนาคต
        // แต่อนุมานว่าเป็นปีปัจจุบันไปก่อนปลอดภัยสุด
    } else {
        // Logic ปี พ.ศ.
        if (year < 100) year = (2500 + year) - 543; 
        else if (year > 2400) year = year - 543;   
    }
    
    let d = new Date(`${dateMatch[1]} ${dateMatch[2]} ${year} ${finalTime}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 6. Last Attempt
  let d = new Date(engText);
  return !isNaN(d.getTime()) ? d.toISOString() : null;
};

// 🤖 ระบบดูดข่าวอัจฉริยะ (V5: +Description Date Scraper)
export const fetchLinkMetadata = async (url) => {
  console.log(`🚀 [FetchMetadata] Starting for: ${url}`);
  if (!url) return { title: "", image: "", date: "" };

  let rawHtml = null;

  // 1. Proxy Request
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    if (res.ok) {
        rawHtml = await res.text();
        console.log("✅ [FetchMetadata] Got HTML from corsproxy.io");
    }
  } catch (e) { console.warn("⚠️ Proxy 1 failed", e); }

  if (!rawHtml) {
    try {
      const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          if (proxyData.contents) {
              rawHtml = proxyData.contents;
              console.log("✅ [FetchMetadata] Got HTML from AllOrigins");
          }
      }
    } catch (e) { console.warn("⚠️ Proxy 2 failed", e); }
  }

  if (!rawHtml) {
      console.error("❌ [FetchMetadata] Failed to fetch HTML");
      return { title: "", image: "", date: "" }; 
  }

  // 2. Extraction Logic
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const getMeta = (prop) => doc.querySelector(`meta[property="${prop}"]`)?.content || doc.querySelector(`meta[name="${prop}"]`)?.content;

  let title = getMeta("og:title") || doc.title || "";
  let image = getMeta("og:image") || "";
  let rawDate = "";

  // --- A. Matichon Specific ---
  if (!rawDate) {
      const matichonMatch = rawHtml.match(/"pagePostDateIso"\s*:\s*"([^"]+)"/);
      if (matichonMatch) {
          rawDate = matichonMatch[1];
          console.log("🎯 Found Date in Matichon DataLayer:", rawDate);
      }
  }

  // --- B. JSON-LD ---
  if (!rawDate) {
    const jsonLds = doc.querySelectorAll('script[type="application/ld+json"]');
    for (let s of jsonLds) {
        try {
            const text = s.innerText;
            if (!text) continue;
            let data = JSON.parse(text);
            let nodes = data['@graph'] || (Array.isArray(data) ? data : [data]);
            for(let node of nodes) {
                if (node.datePublished || node.dateCreated) {
                     const type = Array.isArray(node['@type']) ? node['@type'][0] : node['@type'];
                     if (['Article', 'NewsArticle', 'BlogPosting', 'WebPage'].includes(type) || node.headline) {
                        rawDate = node.datePublished || node.dateCreated; 
                        console.log(`🔍 Found Date in JSON-LD (${type}):`, rawDate); 
                        break; 
                     }
                }
            }
        } catch (e) {}
        if (rawDate) break;
    }
  }

  // --- C. Next.js Data ---
  if (!rawDate) {
      const nextData = doc.getElementById('__NEXT_DATA__');
      if (nextData) {
          try {
             const match = nextData.innerText.match(/"(date_time|publishTime|datePublished)":"([^"]+)"/);
             if (match) { rawDate = match[2]; console.log("🔍 Found Date in __NEXT_DATA__:", rawDate); }
          } catch(e) {}
      }
      if (!rawDate) {
          const scripts = doc.querySelectorAll('script');
          for (let s of scripts) {
             if (s.innerText.includes('self.__next_f.push')) {
                 const matchISO = s.innerText.match(/\\?"publishTime\\?":\s*\\?"([^\\"]+)/);
                 if (matchISO) { rawDate = matchISO[1]; break; }
             }
          }
      }
  }

  // --- D. Meta Tags ---
  if (!rawDate) {
      rawDate = getMeta("article:published_time") || getMeta("date") || getMeta("pubdate") || getMeta("last-modified");
      if (!rawDate) rawDate = doc.querySelector('meta[name="publish_date"]')?.content;
      if (rawDate) console.log("🔍 Found Date in Meta Tags:", rawDate);
  }

  // --- E. Selectors ---
  if (!rawDate) {
      const selectors = ['.newsdate', '.news-detail-date', '.date-news', '.flexi.value.field_created', '.__item_article-date', 'p.date', '.post-date', '.time', 'time', '.entry-date', '.item-date', '.date-display-single', '.content-date', '.date', '.author-info'];
      for (let s of selectors) {
          let el = doc.querySelector(s);
          if (el) { 
              rawDate = el.getAttribute('datetime') || el.innerText; 
              if (parseSmartDate(rawDate)) {
                  console.log(`🔍 Found Date in Selector (${s}):`, rawDate);
                  break; 
              }
          }
      }
  }

  // --- F. Description Parser (NEW: Fallback for TNA/WisdomCloud) ---
  // แก้ปัญหาเว็บ MCOT/TNA ที่เขียนวันที่ไว้ต้น Description เช่น "ทำเนียบ 14 พ.ค.- นายกฯ..."
  if (!rawDate) {
      const desc = getMeta("og:description") || getMeta("description") || "";
      if (desc) {
          // หา Pattern: 1-2 หลัก + ช่องว่าง + ชื่อเดือนไทย
          const thaiDateRegex = /(\d{1,2})\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/;
          const match = desc.match(thaiDateRegex);
          if (match) {
               // ถ้าเจอ ให้เอามาประกอบเป็นวันที่ + ปีปัจจุบัน (เพราะใน text มักไม่มีปี)
               const currentYear = new Date().getFullYear() + 543; // ใส่ พ.ศ. ให้ parseSmartDate แปลงกลับเอง
               rawDate = `${match[1]} ${match[2]} ${currentYear}`;
               console.log("🔍 Found Date in Description Text:", rawDate);
          }
      }
  }

  let date = parseSmartDate(rawDate) || "";
  console.log("🏁 [FetchMetadata] Final Raw Date:", rawDate, "-> Parsed:", date); 

  // Filter Noise
  if (title.includes("Just a moment") || title.includes("Attention Required") || title.includes("Cloudflare")) {
      console.warn("⚠️ Blocked by Cloudflare");
      title = ""; 
  }

  let result = { title, image, date };

  // 3. AI Fallback
  if (!result.title || !result.date) {
      console.log("🤖 [FetchMetadata] Fallback to AI...");
      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
      if (GEMINI_API_KEY) {
          const shortHtml = rawHtml.substring(0, 15000); 
          const modelCandidates = ["gemini-1.5-flash", "gemini-pro"];
          for (const model of modelCandidates) {
            try {
                console.log(`🤖 AI Attempt with ${model}...`);
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: [{ parts: [{ text: `Extract metadata (title, image, date) from HTML. Return JSON ONLY: {"title": "...", "image": "...", "date": "..."}. HTML: ${shortHtml}` }] }] })
                });

                if (response.ok) {
                    const aiData = await response.json();
                    const textResponse = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (textResponse) {
                        const cleanJson = textResponse.replace(/```json|```/g, '').trim();
                        const aiResult = JSON.parse(cleanJson);
                        if ((!result.title || result.title.includes("Just a moment")) && aiResult.title) result.title = aiResult.title;
                        if (!result.image && aiResult.image) result.image = aiResult.image;
                        if (!result.date && aiResult.date) result.date = aiResult.date; 
                        console.log("🤖 AI Result Success:", aiResult);
                        break; 
                    }
                }
            } catch (e) { console.error(`AI Error (${model}):`, e); }
          }
      }
  }

  console.log("✅ [FetchMetadata] Done returning:", result);
  return result;
};