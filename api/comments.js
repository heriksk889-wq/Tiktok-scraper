export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   if (!inputUrl || !inputUrl.includes('tiktok.com')) {
      return res.status(400).json({ success: false, message: 'URL TikTok tidak valid.' });
   }

   try {
      let longUrl = inputUrl;
      
      // 1. Auto-expand shortlink (vt.tiktok.com / vm.tiktok.com)
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await fetch(inputUrl, {
               redirect: 'follow',
               headers: { 
                  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1' 
               }
            });
            longUrl = expandRes.url.split('?')[0]; 
         } catch (e) {}
      }

      // 2. Fetch halaman HTML TikTok secara langsung
      const pageRes = await fetch(longUrl, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
         }
      });

      const htmlText = await pageRes.text();

      let allPresets = [];
      let videoTitle = '';

      // 3. Ambil judul/deskripsi video dari struktur SIGI_STATE jika tersedia
      try {
         const sigiMatch = htmlText.match(/<script id="SIGI_STATE" type="application\/json">([\s\S]*?)<\/script>/);
         if (sigiMatch && sigiMatch[1]) {
            const sigiJson = JSON.parse(sigiMatch[1]);
            const itemModule = sigiJson.ItemModule || {};
            for (const key in itemModule) {
               if (itemModule[key].desc) {
                  videoTitle = itemModule[key].desc;
               }
            }
         }
      } catch (e) {}

      // 4. Universal HTML Regex Scraper (Sapu bersih seluruh link http/https di halaman)
      // Karena halaman SSR TikTok memuat teks komentar & deskripsi di dalam HTML, cara ini sangat ampuh menangkap link tersembunyi.
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
      const rawMatches = htmlText.match(urlRegex) || [];

      rawMatches.forEach(u => {
         let cleanUrl = u.replace(/['",;\\}\n\r\)]+$/, '').replace(/&amp;/g, '&');
         
         // Filter domain internal TikTok / sampah agar tidak ikut tersedot
         if (
            cleanUrl &&
            !cleanUrl.includes('tiktok.com') &&
            !cleanUrl.includes('byteimg.com') &&
            !cleanUrl.includes('akamaized.net') &&
            !cleanUrl.includes('musical.ly') &&
            !cleanUrl.includes('bytedance') &&
            !cleanUrl.includes('w3.org') &&
            !cleanUrl.includes('schema.org')
         ) {
            allPresets.push({
               url: cleanUrl,
               source: 'comments',
               author: 'Kreator / Komentar'
            });
         }
      });

      // Hapus duplikat URL yang sama
      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         video: {
            title: videoTitle || 'Video TikTok',
            play: '',
            author: 'TikTok'
         },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
   }
}
