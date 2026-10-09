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
      
      // 1. Auto-expand shortlink (vt.tiktok.com / vm.tiktok.com)
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await axios.get(inputUrl, {
               maxRedirects: 5,
               validateStatus: s => s >= 200 && s < 400,
               headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15' }
            });
            longUrl = expandRes.request?.res?.responseUrl || expandRes.config?.url || inputUrl;
            longUrl = longUrl.split('?')[0];
         } catch (e) {}
      }

      // 2. Ambil halaman HTML TikTok menggunakan axios
      const pageRes = await axios.get(longUrl, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
         },
         timeout: 15000
      });

      const htmlText = pageRes.data;
      let allPresets = [];
      let videoTitle = '';

      // 3. Bedah SIGI_STATE atau Universal Data JSON dari HTML TikTok
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

      // 4. Regex ekstraksi link dengan filter ketat khusus preset/unduhan
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
      const rawMatches = htmlText.match(urlRegex) || [];

      rawMatches.forEach(u => {
         let cleanUrl = u.replace(/['",;\\}\n\r\)]+$/, '').replace(/&amp;/g, '&');
         
         // Whitelist domain preset yang sah
         const isValidPreset = 
            cleanUrl.includes('alight.link') ||
            cleanUrl.includes('alightcreative.com') ||
            cleanUrl.includes('drive.google.com') ||
            cleanUrl.includes('mediafire.com') ||
            cleanUrl.includes('mega.nz') ||
            cleanUrl.includes('pastebin.com') ||
            cleanUrl.includes('whatsapp.com/channel') ||
            cleanUrl.toLowerCase().includes('xml');

         if (isValidPreset) {
            allPresets.push({
               url: cleanUrl,
               source: 'comments',
               author: 'Kreator / Komentar'
            });
         }
      });

      // Hapus duplikat link
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
      
