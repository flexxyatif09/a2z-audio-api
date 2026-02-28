const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// 🔥 THE FIX: Render ko directly FFmpeg engine ka rasta batana 🔥
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
app.use(cors());

// Supabase Setup
const supabaseUrl = 'https://qgnhmfjxkwdlvjlzcayt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnbmhtZmp4a3dkbHZqbHpjYXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjE5MTksImV4cCI6MjA4Nzc5NzkxOX0.ZUOoEn3Qwwxt3vFAi72s_5uwSSsWI0E376Ym0O8JlKs';
const supabase = createClient(supabaseUrl, supabaseKey);

const upload = multer({ dest: '/tmp/' });

app.get('/', (req, res) => {
    res.send("A2Z Anime Audio API is Running!");
});

app.post('/extract-audio', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video uploaded' });

    const outPath = path.join('/tmp/', `audio_${Date.now()}.mp3`);
    const trackStr = req.body.track || '0:a:0';
    const titleStr = req.body.title || 'Untitled Audio';
    
    console.log(`Extracting track ${trackStr} from ${req.file.originalname}`);

    ffmpeg(req.file.path)
        .outputOptions([`-map ${trackStr}`, '-c:a libmp3lame', '-b:a 128k', '-ac 1'])
        .save(outPath)
        .on('end', async () => {
            try {
                const buffer = fs.readFileSync(outPath);
                const fileName = `audio_${Date.now()}.mp3`;
                
                // Upload to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('extracted_audios')
                    .upload(`public/${fileName}`, buffer, { contentType: 'audio/mpeg' });

                if (uploadError) throw uploadError;

                // Get Public URL
                const { data } = supabase.storage
                    .from('extracted_audios')
                    .getPublicUrl(`public/${fileName}`);
                
                // Save to Database
                const { error: dbError } = await supabase
                    .from('video_audio_tracks')
                    .insert([{ video_title: titleStr, audio_url: data.publicUrl }]);

                if (dbError) throw dbError;

                res.json({ success: true, url: data.publicUrl });

            } catch (err) {
                console.error("Database/Upload Error:", err);
                res.status(500).json({ error: err.message });
            } finally {
                // Safely delete temp files
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
            }
        })
        .on('error', (err) => {
            console.error('FFmpeg Processing Error:', err);
            res.status(500).json({ error: 'Failed to extract audio on server.' });
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Ready on port ${PORT} 🚀`));
