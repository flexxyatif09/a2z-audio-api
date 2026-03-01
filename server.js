const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// FFmpeg Path Setup
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
app.use(cors());

// Supabase Setup
const supabaseUrl = 'https://qgnhmfjxkwdlvjlzcayt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnbmhtZmp4a3dkbHZqbHpjYXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjE5MTksImV4cCI6MjA4Nzc5NzkxOX0.ZUOoEn3Qwwxt3vFAi72s_5uwSSsWI0E376Ym0O8JlKs';
const supabase = createClient(supabaseUrl, supabaseKey);

const upload = multer({ dest: '/tmp/' });

app.get('/', (req, res) => {
    res.send("A2Z Anime Multi-Track API is Running! 🚀");
});

app.post('/extract-audio', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video uploaded' });

    const titleStr = req.body.title || 'Untitled';
    let tracks = [];
    
    // Naya Logic: Frontend se aaye multiple tracks ko padhna
    try {
        tracks = JSON.parse(req.body.tracks);
        if (!Array.isArray(tracks) || tracks.length === 0) throw new Error("Empty tracks");
    } catch (e) {
        console.log("Fallback to default track due to missing data");
        tracks = [{ id: '0:a:0', label: 'Default' }];
    }

    console.log(`Processing ${tracks.length} tracks for: ${titleStr}`);

    try {
        // Sequential Loop: Ek-ek karke saare tracks nikalega taaki RAM crash na ho
        for (const track of tracks) {
            console.log(`Extracting: ${track.label} (${track.id})`);
            const outPath = path.join('/tmp/', `audio_${Date.now()}_${track.label}.mp3`);

            await new Promise((resolve, reject) => {
                ffmpeg(req.file.path)
                    .outputOptions([`-map ${track.id}`, '-c:a libmp3lame', '-b:a 128k', '-ac 1'])
                    .save(outPath)
                    .on('end', resolve)
                    .on('error', reject);
            });

            // 1. Upload to Supabase
            const buffer = fs.readFileSync(outPath);
            const fileName = `audio_${Date.now()}_${track.label}.mp3`;
            const { error: uploadError } = await supabase.storage
                .from('extracted_audios')
                .upload(`public/${fileName}`, buffer, { contentType: 'audio/mpeg' });

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const { data: urlData } = supabase.storage.from('extracted_audios').getPublicUrl(`public/${fileName}`);
            
            // 3. Save to DB with Language Name (e.g., "Naruto Ep 1 - Hindi")
            const finalTitle = `${titleStr} - ${track.label}`;
            const { error: dbError } = await supabase
                .from('video_audio_tracks')
                .insert([{ video_title: finalTitle, audio_url: urlData.publicUrl }]);

            if (dbError) throw dbError;

            // 4. Delete temp audio file
            fs.unlinkSync(outPath);
        }

        // Saare tracks nikalne ke baad original video delete karein
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        
        // Yeh message wahan 'undefined' ki jagah aayega
        res.json({ success: true, message: `Successfully extracted ${tracks.length} tracks!` });

    } catch (err) {
        console.error('Server Processing Error:', err);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed during multi-track extraction. Check server logs.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Ready on port ${PORT} 🚀`));
