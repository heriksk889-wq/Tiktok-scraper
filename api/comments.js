import axios from 'axios';

export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   if (!inputUrl || !inputUrl.includes('tiktok.com')) {
      return res.status(400).json({ 
         success: false, 
         message: 'URL TikTok tidak valid atau kosong.' 
      });
   }

   try {
      let longUrl = inputUrl;
      let targetVideoId = '';

      // 1. AUTO-EXPAND SHORTLINK (Wajib agar amfinder tidak nyasar)
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await axios.get(inputUrl, {
               maxRedirects: 5,
               validateStatus: status => status >= 200 && status < 400,
               headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
            });
            const resolved = expandRes.request?.res?.responseUrl || expandRes.config?.url || inputUrl;
            longUrl = resolved.split('?')[0]; 
         } catch (e) {
            console.log('Gagal expand shortlink:', e.message);
         }
      }

      // Ambil ID Video untuk pencocokan akurat
      const idMatch = longUrl.match(/video\/(\d+)/);
      if (idMatch) targetVideoId = idMatch[1];

      // 2. Ambil data video via tikwm
      const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(longUrl)}`;
      const tikwmRes = await axios.get(tikwmUrl, { timeout: 15000 }).catch(() => ({}));
      const videoData = tikwmRes.data?.data || {};

      // 3. Ambil data preset dari amfinder menggunakan URL Panjang
      const params = new URLSearchParams();
      params.append('query', longUrl);
      params.append('q', longUrl);

      const amfinderUrl = `https://amfinder.web.id/api/search?${params.toString()}`;
      const amfinderRes = await axios.get(amfinderUrl, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://amfinder.web.id/',
            'Accept': 'text/event-stream, application/json'
         },
         timeout: 30000
      });

      const rawText = typeof amfinderRes.data === 'string' ? amfinderRes.data : JSON.stringify(amfinderRes.data);
      const lines = rawText.split('\n');
      let allPresets = [];
      let isTargetFound = false;

      // Parsing struktur event stream dari amfinder (HANYA TARGET VIDEO)
      for (const line of lines) {
         if (line.startsWith('data:')) {
            try {
               const jsonStr = line.replace('data:', '').trim();
               const parsed = JSON.parse(jsonStr);

               const videoList = parsed.videos || (parsed.presetLinks ? [parsed] : null);
               
               if (videoList && Array.isArray(videoList) && videoList.length > 0) {
                  // Filter HANYA video yang ID-nya cocok dengan URL yang diminta
                  const mainVideo = targetVideoId 
                     ? videoList.find(v => v.url && v.url.includes(targetVideoId)) || videoList[0]
                     : videoList[0];

                  if (mainVideo && mainVideo.presetLinks && Array.isArray(mainVideo.presetLinks)) {
                     mainVideo.presetLinks.forEach(item => {
                        if (typeof item === 'object' && item.url) {
                           allPresets.push({
                              url: item.url,
                              source: item.source || 'comments',
                              author: item.author || mainVideo.handle || 'Komentar'
                           });
                        } else if (typeof item === 'string') {
                           allPresets.push({
                              url: item,
                              source: 'comments',
                              author: 'Komentar'
                           });
                        }
                     });
                     isTargetFound = true;
                     break; // HENTIKAN LOOP! Jangan ambil data dari video orang lain
                  }
               }
            } catch (e) {}
         }
         if (isTargetFound) break; // Keluar dari parsing jika target sudah ketemu
      }

      // Hapus duplikat link
      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         debug_url: longUrl,
         video: {
            title: videoData.title || '',
            play: videoData.play || '',
            author: videoData.author?.unique_id || ''
         },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(500).json({ 
         success: false, 
         error: error.message 
      });
   }
               }
                    
