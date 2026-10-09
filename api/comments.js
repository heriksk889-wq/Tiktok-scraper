export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

   const inputUrl = req.query.url || req.query.query;

   if (!inputUrl || !inputUrl.includes('tiktok.com')) {
      return res.status(400).json({ success: false, message: 'URL TikTok tidak valid.' });
   }

   try {
      let longUrl = inputUrl;
      
      // 1. AUTO-EXPAND SHORTLINK
      if (inputUrl.includes('vt.tiktok.com') || inputUrl.includes('vm.tiktok.com')) {
         try {
            const expandRes = await fetch(inputUrl, {
               redirect: 'follow',
               headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
            });
            longUrl = expandRes.url.split('?')[0]; 
         } catch (e) {}
      }

      const videoIdMatch = longUrl.match(/video\/(\d+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : '';

      // 2. AMBIL DATA VIDEO
      let videoData = {};
      let authorId = '';
      let authorHandle = 'Kreator';

      try {
         const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(longUrl)}`;
         const tikwmRes = await fetch(tikwmUrl);
         const tikwmJson = await tikwmRes.json();
         videoData = tikwmJson.data || {};
         authorId = videoData.author?.id || '';
         authorHandle = videoData.author?.unique_id || 'Kreator';
      } catch (e) {}

      let allPresets = [];
      let rawCommentsDump = []; // Menyimpan semua teks komentar mentah untuk didiagnosis

      const extractLinks = (text, defaultSource, authorName) => {
         if (!text) return;
         // Tangkap semua jenis link atau teks yang menyerupai URL
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

      extractLinks(videoData.title, 'description', `@${authorHandle} (Kreator)`);

      // 3. AMBIL SEMUA KOMENTAR MENTAH
      if (videoId) {
         try {
            const commentApi = `https://www.tikwm.com/api/comment/list/?aweme_id=${videoId}&count=50`;
            const commentRes = await fetch(commentApi);
            const commentJson = await commentRes.json();
            const comments = commentJson.data?.comments || [];

            const processComment = (c, isReply = false) => {
               const text = c.text || '';
               const cUid = c.user?.uid;
               const cUsername = c.user?.unique_id || c.user?.nickname || 'Komentar';
               
               // Masukkan ke log mentah untuk diteliti
               rawCommentsDump.push({
                  author: cUsername,
                  text: text,
                  is_reply: isReply
               });

               const isCreator = (cUid === authorId) || text.toLowerCase().includes('pencipta');
               const source = isCreator ? 'description' : 'comments'; 
               const authorLabel = `@${cUsername}${isCreator ? ' (Kreator)' : ''}`;

               extractLinks(text, source, authorLabel);
            };

            comments.forEach(c => {
               processComment(c, false);
               if (c.reply_comment && Array.isArray(c.reply_comment)) {
                  c.reply_comment.forEach(reply => {
                     processComment(reply, true);
                  });
               }
            });
         } catch (e) {}
      }

      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         debug_raw_comments: rawCommentsDump, // Menampilkan seluruh teks komentar mentah ke konsol bot
         video: {
            title: videoData.title || '',
            play: videoData.play || '',
            author: authorHandle
         },
         presets: uniquePresets
      });

   } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
   }
               }
                   
