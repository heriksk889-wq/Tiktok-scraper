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

      // 2. Ekstraksi ID Video dari URL panjang
      const videoIdMatch = longUrl.match(/video\/(\d+)/);
      if (videoIdMatch) {
          videoId = videoIdMatch[1];
      }

      let videoTitle = 'Video TikTok';
      let playUrl = '';
      
      // 3. Ambil data utama video (untuk mendapatkan judul dan URL Video MP4)
      try {
         const videoDetail = await axios.get(`https://www.tikwm.com/api/?url=${inputUrl}`);
         if (videoDetail.data.code === 0 && videoDetail.data.data) {
             videoTitle = videoDetail.data.data.title;
             playUrl = videoDetail.data.data.play;
             if (!videoId) videoId = videoDetail.data.data.id;
         }
      } catch(e) {
         console.error('Gagal mengambil metadata video');
      }

      if (!videoId) {
          return res.status(400).json({ success: false, message: 'Gagal mendapatkan ID Video TikTok.' });
      }

      let allPresets = [];

      // 4. Ambil data Komentar menggunakan API Khusus untuk mendapatkan teks komentar dinamis
      try {
          const commentsRes = await axios.get(`https://www.tikwm.com/api/comment/list?aweme_id=${videoId}&count=50&cursor=0`);
          
          if (commentsRes.data.code === 0 && commentsRes.data.data && commentsRes.data.data.comments) {
              const comments = commentsRes.data.data.comments;
              const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;

              // Fungsi untuk mencari dan memfilter URL preset
              const searchLinks = (text) => {
                  const rawMatches = text.match(urlRegex) || [];
                  rawMatches.forEach(u => {
                     let cleanUrl = u.replace(/['",;\\}\n\r\)]+$/, '').replace(/&amp;/g, '&');
                     
                     // Whitelist domain preset (sesuai filter kamu sebelumnya)
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
                           source: 'comments'
                        });
                     }
                  });
              };

              // Looping seluruh komentar utama dan balasan (replies)
              comments.forEach(c => {
                  if (c.text) searchLinks(c.text);
                  // Kadang link ada di komentar balasan (seperti di screenshot mu)
                  if (c.reply_comment && Array.isArray(c.reply_comment)) {
                      c.reply_comment.forEach(reply => {
                          if (reply.text) searchLinks(reply.text);
                      });
                  }
              });
          }
      } catch(e) {
          console.error('Error saat mengambil komentar API:', e.message);
      }

      // Hapus duplikat link preset
      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         video: {
            title: videoTitle,
            play: playUrl,
            author: 'TikTok'
         },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
   }
                }
             
