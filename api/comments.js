import axios from 'axios';

export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   if (!inputUrl || (!inputUrl.includes('tiktok.com') && !inputUrl.includes('tiktok.com/t/'))) {
      return res.status(200).json({ success: false, presets: [] });
   }

   try {
      let videoId = '';
      let longUrl = inputUrl;

      // 1. TRIK BYPASS CLOUDFLARE TIKTOK PADA VERCEL
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com') || inputUrl.includes('/t/')) {
         try {
            // maxRedirects: 0 adalah kunci! Kita mencegat header 'location' sebelum Cloudflare muncul
            const expandRes = await axios.get(inputUrl, {
               maxRedirects: 0,
               validateStatus: status => status >= 200 && status < 400,
               headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (expandRes.headers && expandRes.headers.location) {
                longUrl = expandRes.headers.location;
            }
         } catch (e) {
            console.log('Bypass shortlink gagal:', e.message);
         }
      }

      // 2. EKSTRAK ID VIDEO DARI URL PANJANG
      const videoIdMatch = longUrl.match(/(?:video|v)\/(\d+)/);
      if (videoIdMatch) {
          videoId = videoIdMatch[1];
      }

      // Fallback ekstraksi ID menggunakan API jika Regex gagal
      if (!videoId) {
          try {
             const videoDetail = await axios.get(`https://www.tikwm.com/api/?url=${inputUrl}`);
             if (videoDetail.data?.data?.id) videoId = videoDetail.data.data.id;
          } catch(e) {}
      }

      // Jika Vercel masih gagal dapat ID, hentikan proses (mencegah bot error/crash)
      if (!videoId) {
          return res.status(200).json({ success: false, presets: [] });
      }

      let allPresets = [];
      
      // 3. ENGINE REGEX BARU: Mampu mendeteksi link yang dempet/tanpa spasi
      const searchLinks = (text) => {
          if (!text) return;
          // Regex ini mendeteksi pola yang menyerupai domain valid tanpa bergantung pada spasi
          const regex = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s"'<>()]*)?/gi;
          const matches = text.match(regex) || [];
          
          matches.forEach(url => {
              let cleanUrl = url.trim();
              const lower = cleanUrl.toLowerCase();
              
              const isValidPreset = 
                  lower.includes('alight.link') || lower.includes('alightcreative.com') ||
                  lower.includes('drive.google.com') || lower.includes('mediafire.com') ||
                  lower.includes('mega.nz') || lower.includes('pastebin.com') ||
                  lower.includes('whatsapp.com/channel') || lower.includes('.xml');

              if (isValidPreset) {
                  // Memastikan tautan hidup saat dikirim bot WhatsApp
                  if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
                  allPresets.push({ url: cleanUrl, source: 'comments' });
              }
          });
      };

      // 4. AMBIL KOMENTAR VIA TIKTOK INTERNAL API (Kebal Blokir & Anti Rate-Limit)
      try {
         const tiktokApiUrl = `https://api22-normal-c-useast1a.tiktokv.com/aweme/v1/comment/list/?aweme_id=${videoId}&count=150`;
         const internalRes = await axios.get(tiktokApiUrl, {
             headers: { 'User-Agent': 'TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet' },
             timeout: 10000
         });

         if (internalRes.data && internalRes.data.comments) {
             internalRes.data.comments.forEach(c => {
                searchLinks(c.text);
                // Wajib telusuri balasan (replies) di mana kreator sering menaruh link
                if (c.reply_comment && Array.isArray(c.reply_comment)) {
                    c.reply_comment.forEach(reply => searchLinks(reply.text));
                }
             });
         }
      } catch(e) {
         console.log('Internal API error:', e.message);
      }

      // 5. METODE CADANGAN JIKA INTERNAL API SEDANG SIBUK
      if (allPresets.length === 0) {
          try {
              const tikwmRes = await axios.get(`https://www.tikwm.com/api/comment/list?aweme_id=${videoId}&count=150&cursor=0`);
              if (tikwmRes.data?.data?.comments) {
                  tikwmRes.data.data.comments.forEach(c => {
                      searchLinks(c.text);
                      if (c.reply_comment && Array.isArray(c.reply_comment)) {
                          c.reply_comment.forEach(reply => searchLinks(reply.text));
                      }
                  });
              }
          } catch(e) {}
      }

      // Hapus duplikat URL dari array
      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         video: { title: 'Preset Alight Motion', play: '', author: 'TikTok' },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(200).json({ success: false, presets: [] });
   }
          }
      
