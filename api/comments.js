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

      // 1. Auto-expand shortlink (menangani vt.tiktok.com)
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await axios.get(inputUrl, {
               maxRedirects: 5,
               validateStatus: s => s >= 200 && s < 400,
               headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            longUrl = expandRes.request?.res?.responseUrl || expandRes.config?.url || inputUrl;
            longUrl = longUrl.split('?')[0];
         } catch (e) {
            console.log('Expand URL gagal:', e.message);
         }
      }

      // 2. Ekstraksi ID Video langsung dari URL panjang
      const videoIdMatch = longUrl.match(/video\/(\d+)/);
      if (videoIdMatch) {
          videoId = videoIdMatch[1];
      }

      let videoTitle = 'Video TikTok';
      let playUrl = '';

      // 3. Ambil data utama video (opsional untuk metadata & MP4)
      try {
         const videoDetail = await axios.get(`https://www.tikwm.com/api/?url=${inputUrl}`);
         if (videoDetail.data.code === 0 && videoDetail.data.data) {
             videoTitle = videoDetail.data.data.title;
             playUrl = videoDetail.data.data.play;
             if (!videoId) videoId = videoDetail.data.data.id;
         }
      } catch(e) {
         console.log('Gagal mengambil metadata utama:', e.message);
      }

      if (!videoId) {
          return res.status(400).json({ success: false, message: 'Gagal mendapatkan ID Video TikTok.' });
      }

      let allPresets = [];

      // 4. Ambil Komentar (Tingkatkan count ke 200 agar komentar dalam tidak terlewat)
      const commentsRes = await axios.get(`https://www.tikwm.com/api/comment/list?aweme_id=${videoId}&count=200&cursor=0`, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
         }
      });

      // JIKA TIKWM MEMBLOKIR IP VERCEL (Rate Limit), PAKSA LEMPAR ERROR AGAR TERCETAK DI BOT!
      if (commentsRes.data.code !== 0) {
          throw new Error(`TikWM API memblokir request: ${commentsRes.data.msg || 'Terkena Rate Limit / IP Block'}`);
      }

      if (commentsRes.data.data && commentsRes.data.data.comments) {
          const comments = commentsRes.data.data.comments;

          // Fungsi ekstraksi AGRESIF (Mendeteksi link walau kreator lupa mengetik https://)
          const searchLinks = (text) => {
              if (!text) return;
              // Pecah teks berdasarkan spasi atau baris baru
              const words = text.split(/[\s\n]+/);
              
              words.forEach(w => {
                 // Bersihkan karakter aneh yang nempel di ujung link
                 let cleanUrl = w.replace(/['",;\\}\)]+$/, '').replace(/&amp;/g, '&');
                 const lower = cleanUrl.toLowerCase();

                 // Cek kecocokan dengan whitelist
                 const isValidPreset = 
                    lower.includes('alight.link') ||
                    lower.includes('alightcreative.com') ||
                    lower.includes('drive.google.com') ||
                    lower.includes('mediafire.com') ||
                    lower.includes('mega.nz') ||
                    lower.includes('pastebin.com') ||
                    lower.includes('whatsapp.com/channel') ||
                    lower.includes('.xml');

                 if (isValidPreset) {
                    // Tambahkan https:// secara otomatis jika hilang agar bot bisa membuatnya jadi link hidup
                    if (!cleanUrl.startsWith('http')) {
                        cleanUrl = 'https://' + cleanUrl;
                    }
                    allPresets.push({
                       url: cleanUrl,
                       source: 'comments'
                    });
                 }
              });
          };

          // Mulai memindai semua komentar dan balasannya (replies)
          comments.forEach(c => {
              searchLinks(c.text);
              if (c.reply_comment && Array.isArray(c.reply_comment)) {
                  c.reply_comment.forEach(reply => {
                      searchLinks(reply.text);
                  });
              }
          });
      }

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
      // Error yang dilempar ke sini akan menghasilkan status 500.
      // Bot presetam.js kamu akan otomatis masuk ke blok "catch (error)" 
      // dan mencetak alasan aslinya (misalnya jika kena blokir TikWM).
      return res.status(500).json({ success: false, error: error.message });
   }
              }
                       
