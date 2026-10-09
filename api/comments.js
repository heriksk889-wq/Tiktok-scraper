import axios from 'axios';

export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   if (!inputUrl || !inputUrl.includes('tiktok.com')) {
      return res.status(200).json({ success: false, presets: [] });
   }

   try {
      let videoId = '';
      let videoTitle = 'Video TikTok';
      let playUrl = '';

      // 1. DAPATKAN VIDEO ID VIA API (PRIORITAS UTAMA)
      // Dipindah ke baris teratas agar IP Vercel tidak perlu berurusan dengan Cloudflare TikTok
      // saat mencoba mengekspansi vt.tiktok.com secara manual.
      try {
         const videoDetail = await axios.get(`https://www.tikwm.com/api/?url=${inputUrl}`);
         if (videoDetail.data && videoDetail.data.data) {
             videoId = videoDetail.data.data.id;
             videoTitle = videoDetail.data.data.title || videoTitle;
             playUrl = videoDetail.data.data.play || playUrl;
         }
      } catch(e) {
         console.log('API metadata gagal resolve URL:', e.message);
      }

      // Fallback: Jika API gagal, baru coba bedah URL manual
      if (!videoId) {
          let longUrl = inputUrl;
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
          const videoIdMatch = longUrl.match(/video\/(\d+)/) || longUrl.match(/v\/(\d+)/);
          if (videoIdMatch) videoId = videoIdMatch[1];
      }

      // Hentikan eksekusi jika ID Video tetap tidak berhasil didapat
      if (!videoId) {
          return res.status(200).json({ success: false, presets: [] });
      }

      let allPresets = [];

      // Engine pembedah tautan
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
                if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
                allPresets.push({ url: cleanUrl, source: 'comments' });
             }
          });
      };

      // 2. SISTEM PAGINATION UNTUK KOMENTAR TERKUBUR
      let cursor = 0;
      let hasMore = true;
      let loopCount = 0;
      
      // Loop maksimal 3 halaman (mencapai 300 komentar terdalam)
      // Dibatasi ke 3 agar Vercel tidak terkena timeout execution.
      while (hasMore && loopCount < 3) {
          try {
              const commentsRes = await axios.get(`https://www.tikwm.com/api/comment/list?aweme_id=${videoId}&count=100&cursor=${cursor}`);
              const data = commentsRes.data?.data;
              
              if (data && data.comments && data.comments.length > 0) {
                  data.comments.forEach(c => {
                      searchLinks(c.text);
                      // Bedah semua balasan (replies) di halaman ini
                      if (c.reply_comment && Array.isArray(c.reply_comment)) {
                          c.reply_comment.forEach(reply => searchLinks(reply.text));
                      }
                  });
                  // Update cursor ke halaman selanjutnya
                  hasMore = data.has_more === 1;
                  cursor = data.cursor;
              } else {
                  hasMore = false;
              }
          } catch (e) {
              hasMore = false;
          }
          loopCount++;
      }

      // 3. METODE CADANGAN: MOBILE API TIKTOK
      if (allPresets.length === 0) {
          try {
             const tiktokApiUrl = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v2/comment/list/?aweme_id=${videoId}&count=100`;
             const internalRes = await axios.get(tiktokApiUrl, {
                 headers: { 'User-Agent': 'TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet' },
                 timeout: 10000
             });

             if (internalRes.data && internalRes.data.comments) {
                 internalRes.data.comments.forEach(c => {
                    searchLinks(c.text);
                    if (c.reply_comment && Array.isArray(c.reply_comment)) {
                        c.reply_comment.forEach(reply => searchLinks(reply.text));
                    }
                 });
             }
          } catch(e) {}
      }

      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         video: { title: videoTitle, play: playUrl, author: 'TikTok' },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(200).json({ success: false, presets: [] });
   }
             }
                                 
