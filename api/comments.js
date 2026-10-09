export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   if (!inputUrl || !inputUrl.includes('tiktok.com')) {
      return res.status(400).json({ success: false, message: 'URL TikTok tidak valid.' });
   }

   try {
      let longUrl = inputUrl;
      
      // 1. Auto-expand shortlink agar jadi URL panjang asli
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await fetch(inputUrl, {
               redirect: 'follow',
               headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
            });
            longUrl = expandRes.url.split('?')[0]; 
         } catch (e) {}
      }

      // Ambil ID Video untuk pencocokan ketat
      const videoIdMatch = longUrl.match(/video\/(\d+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : '';

      // 2. Ambil data video dasar via TikWM (hanya untuk judul & author)
      let videoData = {};
      try {
         const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(longUrl)}`);
         const tikwmJson = await tikwmRes.json();
         videoData = tikwmJson.data || {};
      } catch (e) {}

      let allPresets = [];

      // 3. Tembak Amfinder dengan URL panjang yang sudah bersih
      try {
         const amfinderUrl = `https://amfinder.web.id/api/search?query=${encodeURIComponent(longUrl)}&q=${encodeURIComponent(longUrl)}`;
         const amfinderRes = await fetch(amfinderUrl, {
            headers: {
               'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
               'Referer': 'https://amfinder.web.id/',
               'Accept': 'text/event-stream, application/json'
            }
         });

         const rawText = await amfinderRes.text();
         const lines = rawText.split('\n');

         for (const line of lines) {
            if (line.startsWith('data:')) {
               try {
                  const parsed = JSON.parse(line.replace('data:', '').trim());
                  const videoList = parsed.videos || (parsed.presetLinks ? [parsed] : null);

                  if (videoList && Array.isArray(videoList)) {
                     // STRICT MATCHING: Cari video yang URL atau ID-nya benar-benar sama persis
                     const targetVideo = videoId 
                        ? videoList.find(v => v.url && v.url.includes(videoId)) 
                        : null;

                     // Jika ketemu video yang pas, ambil presetLinks-nya
                     if (targetVideo && targetVideo.presetLinks && Array.isArray(targetVideo.presetLinks)) {
                        targetVideo.presetLinks.forEach(item => {
                           const pUrl = typeof item === 'object' ? item.url : item;
                           const pAuthor = typeof item === 'object' ? (item.author || targetVideo.handle || 'Komentar') : 'Komentar';
                           
                           if (pUrl) {
                              allPresets.push({
                                 url: pUrl.replace(/['",;\\}\n\r\)]+$/, ''),
                                 source: 'comments',
                                 author: pAuthor
                              });
                           }
                        });
                        break; // Berhenti karena video target sudah ketemu
                     }
                  }
               } catch (err) {}
            }
         }
      } catch (e) {}

      // Fallback Regex Universal jika event stream amfinder kosong
      if (allPresets.length === 0) {
         const urls = rawText.match(/(https?:\/\/[^\s"'<>]+)/g) || [];
         urls.forEach(u => {
            const cleanUrl = u.replace(/['",;\\}\n\r\)]+$/, '');
            if (!cleanUrl.includes('tiktok.com') && !cleanUrl.includes('byteimg.com')) {
               allPresets.push({
                  url: cleanUrl,
                  source: 'comments',
                  author: 'Kreator / Komentar'
               });
            }
         });
      }

      // Hapus duplikat link
      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         video: {
            title: videoData.title || '',
            play: videoData.play || '',
            author: videoData.author?.unique_id || ''
         },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
   }
            }
         
