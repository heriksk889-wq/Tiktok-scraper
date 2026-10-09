import axios from 'axios';

export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   // Cegah pengiriman 400/500 ke bot. Jika URL salah, kembalikan 200 dengan success false.
   if (!inputUrl || !inputUrl.includes('tiktok.com')) {
      return res.status(200).json({ success: false, presets: [] });
   }

   try {
      let longUrl = inputUrl;
      let videoId = '';

      // 1. Expand Shortlink TikTok (vt.tiktok.com)
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await axios.get(inputUrl, {
               maxRedirects: 5,
               validateStatus: s => s >= 200 && s < 400,
               headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            longUrl = expandRes.request?.res?.responseUrl || expandRes.config?.url || inputUrl;
            longUrl = longUrl.split('?')[0];
         } catch (e) {}
      }

      // 2. Ekstrak Video ID (Lebih fleksibel)
      const videoIdMatch = longUrl.match(/video\/(\d+)/) || longUrl.match(/v\/(\d+)/);
      if (videoIdMatch) {
          videoId = videoIdMatch[1];
      }

      if (!videoId) {
          return res.status(200).json({ success: false, presets: [] });
      }

      let allPresets = [];
      let videoTitle = 'Video TikTok';
      let playUrl = '';

      // Engine pembedah link super agresif
      const searchLinks = (text) => {
          if (!text) return;
          const words = text.split(/[\s\n]+/);
          words.forEach(w => {
             let cleanUrl = w.replace(/['",;\\}\)]+$/, '').replace(/&amp;/g, '&');
             const lower = cleanUrl.toLowerCase();
             const isValidPreset = 
                lower.includes('alight.link') || lower.includes('alightcreative.com') ||
                lower.includes('drive.google.com') || lower.includes('mediafire.com') ||
                lower.includes('mega.nz') || lower.includes('pastebin.com') ||
                lower.includes('whatsapp.com/channel') || lower.includes('.xml');

             if (isValidPreset) {
                // Pasang protokol https:// paksa agar link hidup di WhatsApp
                if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
                allPresets.push({ url: cleanUrl, source: 'comments' });
             }
          });
      };

      // 3. METODE UTAMA: TikTok Internal Mobile API (Anti-Blokir / Tanpa API Key)
      try {
         const tiktokApiUrl = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v2/comment/list/?aweme_id=${videoId}&count=100`;
         const commentsRes = await axios.get(tiktokApiUrl, {
             headers: { 'User-Agent': 'TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet' },
             timeout: 10000
         });

         if (commentsRes.data && commentsRes.data.comments) {
             commentsRes.data.comments.forEach(c => {
                searchLinks(c.text);
                // Cek balasan komentar (Replies)
                if (c.reply_comment && Array.isArray(c.reply_comment)) {
                    c.reply_comment.forEach(reply => searchLinks(reply.text));
                }
             });
         }
      } catch(e) {
         console.log('Metode Internal Gagal:', e.message);
      }

      // 4. METODE CADANGAN: Fallback ke TikWM hanya jika API Internal sedang kosong
      if (allPresets.length === 0) {
          try {
              const tikwmRes = await axios.get(`https://www.tikwm.com/api/comment/list?aweme_id=${videoId}&count=100&cursor=0`);
              if (tikwmRes.data && tikwmRes.data.data && tikwmRes.data.data.comments) {
                  tikwmRes.data.data.comments.forEach(c => {
                      searchLinks(c.text);
                      if (c.reply_comment && Array.isArray(c.reply_comment)) {
                          c.reply_comment.forEach(reply => searchLinks(reply.text));
                      }
                  });
              }
          } catch(e) {}
      }
      
      // 5. Opsional: Tarik metadata video agar bot bisa kirim video MP4-nya
      try {
         const videoDetail = await axios.get(`https://www.tikwm.com/api/?url=${inputUrl}`);
         if (videoDetail.data.code === 0 && videoDetail.data.data) {
             videoTitle = videoDetail.data.data.title || videoTitle;
             playUrl = videoDetail.data.data.play || playUrl;
         }
      } catch(e) {}

      // Bersihkan duplikat
      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         video: { title: videoTitle, play: playUrl, author: 'TikTok' },
         presets: uniquePresets
      });

   } catch (error) {
      // PERBAIKAN FATAL ERROR:
      // Selalu kembalikan 200 OK agar bot di Pterodactyl tidak menerima status kode 500
      return res.status(200).json({ success: false, presets: [] });
   }
             }
                
