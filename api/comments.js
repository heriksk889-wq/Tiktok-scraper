import axios from 'axios';

export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const targetUrl = req.query.url || req.query.query;

   if (!targetUrl || !targetUrl.includes('tiktok.com')) {
      return res.status(400).json({ 
         success: false, 
         message: 'URL TikTok tidak valid atau kosong.' 
      });
   }

   try {
      // 1. Ambil data video & play URL via tikwm
      const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`;
      const tikwmRes = await axios.get(tikwmUrl, { timeout: 15000 });
      const videoData = tikwmRes.data?.data || {};

      // 2. Ambil data preset dari amfinder API langsung dari server Vercel (IP bersih)
      const params = new URLSearchParams();
      params.append('query', targetUrl);
      params.append('q', targetUrl);

      const amfinderUrl = `https://amfinder.web.id/api/search?${params.toString()}`;
      const amfinderRes = await axios.get(amfinderUrl, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://amfinder.web.id/',
            'Accept': 'text/event-stream, application/json'
         },
         timeout: 30000
      });

      const rawText = typeof amfinderRes.data === 'string' ? amfinderRes.data : JSON.stringify(amfinderRes.data);
      const lines = rawText.split('\n');
      let allPresets = [];

      // Parsing struktur event stream dari amfinder
      for (const line of lines) {
         if (line.startsWith('data:')) {
            try {
               const jsonStr = line.replace('data:', '').trim();
               const parsed = JSON.parse(jsonStr);

               const videoList = parsed.videos || (parsed.presetLinks ? [parsed] : null);
               if (videoList && Array.isArray(videoList)) {
                  videoList.forEach(video => {
                     if (video.presetLinks && Array.isArray(video.presetLinks)) {
                        video.presetLinks.forEach(item => {
                           if (typeof item === 'object' && item.url) {
                              allPresets.push({
                                 url: item.url,
                                 source: item.source || 'comments',
                                 author: item.author || video.handle || 'Komentar'
                              });
                           } else if (typeof item === 'string') {
                              allPresets.push({
                                 url: item,
                                 source: 'comments',
                                 author: 'Komentar'
                              });
                           }
                        });
                     }
                  });
               }
            } catch (e) {}
         }
      }

      // Fallback Universal Regex Scanner jika terstruktur kosong
      if (allPresets.length === 0) {
         const cleanedText = rawText.replace(/\\/g, '');
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
            allPresets.push({
               url: url.replace(/['",;\\}]+$/, ''),
               source: 'comments',
               author: 'Kreator / Komentar'
            });
         });
      }

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
      return res.status(500).json({ 
         success: false, 
         error: error.message 
      });
   }
}
   
