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
      const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}&comment=1`;
      
      const response = await axios.get(tikwmUrl, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
         },
         timeout: 15000
      });

      const data = response.data;
      if (!data || data.code !== 0) {
         return res.status(404).json({ success: false, message: 'Gagal mengambil data dari TikTok.' });
      }

      const videoInfo = data.data;
      const authorName = videoInfo.author?.unique_id || videoInfo.author?.nickname || 'Kreator';
      const description = videoInfo.title || '';
      const comments = videoInfo.comments_list || [];

      let allPresets = [];

      // Deteksi link dari Deskripsi Video
      const descMatches = description.match(/(https?:\/\/[^\s"'<>]+)/g) || [];
      descMatches.forEach(url => {
         const cleanUrl = url.replace(/['",;\\}]+$/, '');
         if (isPresetLink(cleanUrl)) {
            allPresets.push({
               url: cleanUrl,
               source: 'description',
               author: `@${authorName} (Kreator)`
            });
         }
      });

      // Deteksi link dari Kolom Komentar
      comments.forEach(comment => {
         const commentText = comment.text || '';
         const commentAuthor = comment.user?.unique_id || comment.user?.nickname || 'Pengguna';
         const isCreatorComment = comment.user?.uid === videoInfo.author?.id || commentText.toLowerCase().includes('pencipta');

         const commentMatches = commentText.match(/(https?:\/\/[^\s"'<>]+)/g) || [];
         commentMatches.forEach(url => {
            const cleanUrl = url.replace(/['",;\\}]+$/, '');
            if (isPresetLink(cleanUrl)) {
               allPresets.push({
                  url: cleanUrl,
                  source: isCreatorComment ? 'description' : 'comments',
                  author: `@${commentAuthor}${isCreatorComment ? ' (Kreator)' : ''}`
               });
            }
         });
      });

      const uniquePresets = Array.from(new Map(allPresets.map(p => [p.url, p])).values());

      return res.status(200).json({
         success: true,
         video: {
            title: description,
            play: videoInfo.play,
            author: authorName
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

function isPresetLink(url) {
   const lower = url.toLowerCase();
   return (
      lower.includes('alight.link') ||
      lower.includes('alightcreative.com') ||
      lower.includes('drive.google.com') ||
      lower.includes('pastebin.com') ||
      lower.includes('mediafire.com') ||
      lower.includes('mega.nz') ||
      lower.toLowerCase().includes('xml')
   );
        }
     
