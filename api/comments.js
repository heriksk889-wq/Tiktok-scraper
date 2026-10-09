export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   if (!inputUrl || !inputUrl.includes('tiktok.com')) {
      return res.status(400).json({ success: false, message: 'URL TikTok tidak valid.' });
   }

   try {
      let longUrl = inputUrl;
      
      // 1. Auto-expand shortlink
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await fetch(inputUrl, {
               redirect: 'follow',
               headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
            });
            longUrl = expandRes.url.split('?')[0]; 
         } catch (e) {}
      }

      // 2. Ambil data video DAN komentar sekaligus via TikWM endpoint utama (&comment=1)
      const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(longUrl)}&comment=1`;
      const tikwmRes = await fetch(tikwmUrl);
      const tikwmJson = await tikwmRes.json();
      
      if (!tikwmJson || tikwmJson.code !== 0 || !tikwmJson.data) {
         return res.status(404).json({ success: false, message: 'Gagal mengambil data dari TikTok.' });
      }

      const videoData = tikwmJson.data;
      const authorHandle = videoData.author?.unique_id || 'Kreator';
      const authorId = videoData.author?.id || '';
      const description = videoData.title || '';
      const comments = videoData.comments_list || [];

      let allPresets = [];

      // Helper sapu bersih link awalan http/https
      const extractLinks = (text, defaultSource, authorName) => {
         if (!text) return;
         const urls = text.match(/(https?:\/\/[^\s"'<>]+)/g) || [];
         urls.forEach(u => {
            const cleanUrl = u.replace(/['",;\\}\n\r]+$/, ''); 
            allPresets.push({
               url: cleanUrl,
               source: defaultSource,
               author: authorName
            });
         });
      };

      // Cek deskripsi video
      extractLinks(description, 'description', `@${authorHandle} (Kreator)`);

      // Cek komentar utama & balasan (nested replies) dari TikWM
      comments.forEach(c => {
         const text = c.text || '';
         const cUid = c.user?.uid;
         const cUsername = c.user?.unique_id || c.user?.nickname || 'Komentar';
         
         const isCreator = (cUid === authorId) || text.toLowerCase().includes('pencipta') || cUsername.toLowerCase() === authorHandle.toLowerCase();
         const source = isCreator ? 'description' : 'comments'; 
         const authorLabel = `@${cUsername}${isCreator ? ' (Kreator)' : ''}`;

         extractLinks(text, source, authorLabel);

         // Pindai balasan komentar (replies)
         if (c.reply_comment && Array.isArray(c.reply_comment)) {
            c.reply_comment.forEach(reply => {
               const rText = reply.text || '';
               const rUid = reply.user?.uid;
               const rUsername = reply.user?.unique_id || reply.user?.nickname || 'Komentar';
               const isRCreator = (rUid === authorId) || rText.toLowerCase().includes('pencipta') || rUsername.toLowerCase() === authorHandle.toLowerCase();
               const rSource = isRCreator ? 'description' : 'comments';
               const rAuthorLabel = `@${rUsername}${isRCreator ? ' (Kreator)' : ''}`;
               
               extractLinks(rText, rSource, rAuthorLabel);
            });
         }
      });

      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         video: {
            title: description,
            play: videoData.play || '',
            author: authorHandle
         },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
   }
               }
               
