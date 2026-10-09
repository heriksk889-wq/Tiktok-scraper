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
         } catch (e) {}
      }

      const videoId = longUrl.match(/video\/(\d+)/)?.[1] || '';

      // 2. AMBIL DATA VIDEO (Mendapatkan ID & Username Kreator yang asli)
      const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(longUrl)}`;
      const tikwmRes = await axios.get(tikwmUrl, { timeout: 15000 }).catch(() => ({}));
      const videoData = tikwmRes.data?.data || {};
      const authorHandle = videoData.author?.unique_id || '';
      const authorId = videoData.author?.id || '';

      let allPresets = [];

      // Helper pencocokan otomatis: Kalau author komentar == author video, paksa status jadi 'description'
      const extractAndPush = (text, defaultSource, authorName) => {
         const urls = text.match(/(https?:\/\/[^\s"'<>]+)/g) || [];
         const filtered = urls.filter(u => u.match(/alight\.link|alightcreative\.com|drive\.google\.com|pastebin\.com|mediafire\.com|mega\.nz|xml/i));
         filtered.forEach(u => {
            const isCreator = defaultSource === 'description' || 
                              authorName.toLowerCase().includes(authorHandle.toLowerCase()) || 
                              authorName.toLowerCase().includes('kreator') || 
                              authorName.toLowerCase().includes('pencipta');
            
            allPresets.push({
               url: u.replace(/['",;\\}]+$/, ''),
               source: isCreator ? 'description' : 'comments', // 'description' agar masuk kategori Kreator di Bot WA
               author: authorName
            });
         });
      };

      // 3. CEK DESKRIPSI VIDEO
      if (videoData.title) extractAndPush(videoData.title, 'description', `@${authorHandle}`);

      // 4. CEK KOMENTAR VIA API LANGSUNG (Akurat 100%)
      if (videoId) {
         try {
            const commentRes = await axios.get(`https://www.tikwm.com/api/comment/list/?aweme_id=${videoId}&count=50`, { timeout: 10000 });
            const comments = commentRes.data?.data?.comments || [];
            comments.forEach(c => {
               const isCreator = (c.user?.uid === authorId) || (c.text || '').toLowerCase().includes('pencipta');
               const cAuthor = `@${c.user?.unique_id || 'Komentar'}`;
               extractAndPush(c.text || '', isCreator ? 'description' : 'comments', cAuthor);
            });
         } catch (e) {}
      }

      // 5. CEK AMFINDER SEBAGAI BACKUP
      try {
         const params = new URLSearchParams();
         params.append('query', longUrl); // WAJIB longUrl, jangan pakai videoId
         params.append('q', longUrl);
         
         const amfinderRes = await axios.get(`https://amfinder.web.id/api/search?${params.toString()}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/event-stream' }, timeout: 15000
         });
         
         const lines = (typeof amfinderRes.data === 'string' ? amfinderRes.data : JSON.stringify(amfinderRes.data)).split('\n');
         for (const line of lines) {
            if (line.startsWith('data:')) {
               try {
                  const parsed = JSON.parse(line.replace('data:', '').trim());
                  const videoList = parsed.videos || (parsed.presetLinks ? [parsed] : null);
                  
                  if (videoList && Array.isArray(videoList)) {
                     // Cari video yang benar-benar cocok dengan yang kita inginkan
                     const mainVideo = videoId ? videoList.find(v => v.url && v.url.includes(videoId)) : videoList[0];
                     if (mainVideo && mainVideo.presetLinks) {
                        mainVideo.presetLinks.forEach(item => {
                           const pUrl = typeof item === 'object' ? item.url : item;
                           const pAuthor = typeof item === 'object' ? (item.author || mainVideo.handle || 'Komentar') : 'Komentar';
                           
                           const isCreator = pAuthor.replace('@', '').toLowerCase() === authorHandle.toLowerCase() || 
                                             pAuthor.toLowerCase().includes('kreator');
                                             
                           allPresets.push({
                              url: pUrl,
                              source: isCreator ? 'description' : 'comments',
                              author: pAuthor
                           });
                        });
                     }
                  }
               } catch (e) {}
            }
         }
      } catch (e) {}

      // Hapus Duplikat Link yang sama persis
      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         debug_url: longUrl,
         video: { title: videoData.title || '', play: videoData.play || '', author: authorHandle },
         presets: uniquePresets
      });
   } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
   }
                  }
         
