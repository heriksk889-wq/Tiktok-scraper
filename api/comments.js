import axios from 'axios';

export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;
   if (!inputUrl) {
      return res.status(200).json({ success: false, message: 'URL TikTok tidak diberikan.' });
   }

   let videoId = '';
   let allPresets = [];
   let debugLog = []; // Log agar kita tahu prosesnya mati di mana

   // ENGINE REGEX (Filter Link)
   const searchLinks = (text) => {
       if (!text) return;
       const regex = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s"'<>()]*)?/gi;
       const matches = text.match(regex) || [];
       matches.forEach(url => {
           let cleanUrl = url.trim();
           const lower = cleanUrl.toLowerCase();
           const isValidPreset = lower.includes('alight.link') || lower.includes('alightcreative') ||
                                 lower.includes('drive.google') || lower.includes('mediafire') ||
                                 lower.includes('mega.nz') || lower.includes('pastebin') ||
                                 lower.includes('whatsapp.com') || lower.includes('.xml');
           if (isValidPreset) {
               if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
               allPresets.push({ url: cleanUrl, source: 'comments' });
           }
       });
   };

   // 1. DAPATKAN ID VIDEO
   try {
       // Coba pakai API untuk dapatkan ID murni (mengatasi link vt.tiktok.com)
       const metaRes = await axios.get(`https://www.tikwm.com/api/?url=${inputUrl}`, { timeout: 4000 });
       if (metaRes.data?.data?.id) {
           videoId = metaRes.data.data.id;
           debugLog.push('ID berhasil didapat (TikWM)');
       }
   } catch (e) {
       debugLog.push('API TikWM Meta gagal');
   }

   // Jika gagal, hentikan dan laporkan ke WhatsApp!
   if (!videoId) {
       return res.status(200).json({ success: false, message: `Scraper tidak bisa mendapatkan ID Video. Debug: [${debugLog.join(', ')}]` });
   }

   // 2. BACA KOMENTAR (Coba 2 Jalur agar anti-gagal)
   let commentSuccess = false;

   // Jalur A: TikTok Internal API
   try {
       const res1 = await axios.get(`https://api22-normal-c-useast1a.tiktokv.com/aweme/v1/comment/list/?aweme_id=${videoId}&count=150`, {
           headers: { 'User-Agent': 'TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet' }, timeout: 4000
       });
       if (res1.data?.comments) {
           res1.data.comments.forEach(c => {
               searchLinks(c.text);
               if (c.reply_comment) c.reply_comment.forEach(r => searchLinks(r.text));
           });
           commentSuccess = true;
           debugLog.push('Komentar terbaca via Internal API');
       } else {
           debugLog.push('Internal API kosong (diblokir)');
       }
   } catch(e) { debugLog.push('Internal API Error/Timeout'); }

   // Jalur B: Jika Jalur A gagal, pakai Jalur B (TikWM)
   if (!commentSuccess) {
       try {
           const res2 = await axios.get(`https://www.tikwm.com/api/comment/list?aweme_id=${videoId}&count=150&cursor=0`, { timeout: 4000 });
           if (res2.data?.data?.comments) {
               res2.data.data.comments.forEach(c => {
                   searchLinks(c.text);
                   if (c.reply_comment) c.reply_comment.forEach(r => searchLinks(r.text));
               });
               commentSuccess = true;
               debugLog.push('Komentar terbaca via TikWM');
           } else {
               debugLog.push('TikWM kosong');
           }
       } catch(e) { debugLog.push('TikWM Error/Timeout'); }
   }

   // Jika kedua jalur gagal membaca komentar
   if (!commentSuccess) {
        return res.status(200).json({ success: false, message: `Komentar gagal diakses oleh Vercel. Debug: [${debugLog.join(' | ')}]` });
   }

   // 3. BERSIHKAN DUPLIKAT DAN KIRIM
   const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

   if (uniquePresets.length === 0) {
       return res.status(200).json({ success: false, message: `Komentar berhasil dibaca! Tapi tidak ada teks yang mirip link Preset. Debug: [${debugLog.join(' | ')}]` });
   }

   return res.status(200).json({
       success: true,
       video: { title: 'Preset Alight Motion', play: '', author: 'TikTok' },
       presets: uniquePresets
   });
   }
      
