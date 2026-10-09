import axios from 'axios';

export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   if (!inputUrl || !inputUrl.includes('tiktok.com')) {
      return res.status(400).json({ success: false, message: 'URL TikTok tidak valid.' });
   }

   try {
      let longUrl = inputUrl;
      let videoId = '';

      // 1. AUTO-EXPAND SHORTLINK
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await axios.get(inputUrl, {
               maxRedirects: 5,
               validateStatus: s => s >= 200 && s < 400,
               headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const resolved = expandRes.request?.res?.responseUrl || expandRes.config?.url || inputUrl;
            longUrl = resolved.split('?')[0]; 
         } catch (e) {
            console.log('Gagal expand shortlink:', e.message);
         }
      }

      // Ambil ID Video
      videoId = longUrl.match(/video\/(\d+)/)?.[1] || '';

      // 2. AMBIL DATA VIDEO (Untuk Deskripsi & Author)
      const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(longUrl)}`;
      const tikwmRes = await axios.get(tikwmUrl, { timeout: 15000 }).catch(() => ({}));
      const videoData = tikwmRes.data?.data || {};
      
      if (!videoId && videoData.id) videoId = videoData.id;

      let allPresets = [];

      // 3. EKSTRAK DARI DESKRIPSI VIDEO (Kreator Asli)
      const descText = videoData.title || '';
      const authorHandle = videoData.author?.unique_id || 'Kreator';
      extractPresets(descText, 'description', `@${authorHandle} (Kreator)`, allPresets);

      // 4. SCRAPING KOMENTAR TIKTOK LANGSUNG
      if (videoId) {
         try {
            // Mengakses endpoint API komentar secara langsung untuk ID video ini
            const commentApiUrl = `https://www.tikwm.com/api/comment/list/?aweme_id=${videoId}&count=50`;
            const commentRes = await axios.get(commentApiUrl, { timeout: 15000 });
            const comments = commentRes.data?.data?.comments || [];

            // Pindai setiap baris komentar
            comments.forEach(c => {
               const text = c.text || '';
               const commenter = c.user?.unique_id || 'Komentar';
               
               // Cek apakah yang berkomentar adalah kreator video itu sendiri
               const isCreator = (c.user?.uid === videoData.author?.id) || text.toLowerCase().includes('pencipta');
               
               extractPresets(text, isCreator ? 'description' : 'comments', `@${commenter}${isCreator ? ' (Kreator)' : ''}`, allPresets);
            });
         } catch (e) {
            console.log('Gagal fetch komentar:', e.message);
         }
      }

      // 5. FALLBACK TERAKHIR KE AMFINDER (Gunakan Video ID agar tidak mencari video acak)
      if (allPresets.length === 0 && videoId) {
         try {
            const amfinderRes = await axios.get(`https://amfinder.web.id/api/search?query=${videoId}&q=${videoId}`, {
               headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000
            });
            const rawText = typeof amfinderRes.data === 'string' ? amfinderRes.data : JSON.stringify(amfinderRes.data);
            extractPresets(rawText, 'comments', 'Kreator / Komentar', allPresets);
         } catch (e) {}
      }

      // Hapus Duplikat URL
      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         debug_url: longUrl,
         video: {
            title: descText,
            play: videoData.play || '',
            author: authorHandle
         },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
   }
}

// Fungsi Pengekstrak Tautan
function extractPresets(text, source, author, arrayTarget) {
   const cleanedText = text.replace(/\\/g, '');
   const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
   const foundUrls = cleanedText.match(urlRegex) || [];
   
   const filteredUrls = foundUrls.filter(url => 
      url.includes('alight.link') || 
      url.includes('alightcreative.com') || 
      url.includes('drive.google.com') || 
      url.includes('pastebin.com') || 
      url.includes('mediafire.com') ||
      url.includes('mega.nz') ||
      url.toLowerCase().includes('xml')
   );

   filteredUrls.forEach(url => {
      arrayTarget.push({
         url: url.replace(/['",;\\}]+$/, ''),
         source: source,
         author: author
      });
   });
               }
         
