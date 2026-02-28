const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors()); // CORS error hamesha ke liye khatam

// Supabase Setup (Apni keys yahan daalein)
const supabaseUrl = 'https://qgnhmfjxkwdlvjlzcayt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnbmhtZmp4a3dkbHZqbHpjYXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjE5MTksImV4cCI6MjA4Nzc5NzkxOX0.ZUOoEn3Qwwxt3vFAi72s_5uwSSsWI0E376Ym0O8JlKs';
const supabase = createClient(supabaseUrl, supabaseKey);

// File upload setup
const upload = multer({ dest: '/tmp/' });

app.get('/', (req, res) => {
    res.send("A2Z Anime Processing Server is Running! 🚀");
});

app.post('/extract-audio', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video uploaded' });

    const title = req.body.title || 'Untitled';
    const track = req.body.track || '0:a:0';
    const inputPath = req.file.path;
    const outputPath = path.join('/tmp/', `audio_${Date.now()}.mp3`);

    console.log(`Processing ${title}...`);

    ffmpeg(inputPath)
        .outputOptions([`-map ${track}`, '-c:a libmp3lame', '-b:a 128k', '-ac 1'])
        .save(outputPath)
        .on('end', async () => {
            try {
                // 1. Read extracted file
                const audioBuffer = fs.readFileSync(outputPath);
                const fileName = `audio_${Date.now()}.mp3`;

                // 2. Upload to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('extracted_audios')
                    .upload(`public/${fileName}`, audioBuffer, { contentType: 'audio/mpeg' });

                if (uploadError) throw uploadError;

                // 3. Get Public URL
                const { data: publicUrlData } = supabase.storage
                    .from('extracted_audios')
                    .getPublicUrl(`public/${fileName}`);
                const publicURL = publicUrlData.publicUrl;

                // 4. Save to Database
                const { error: dbError } = await supabase
                    .from('video_audio_tracks')
                    .insert([{ video_title: title, audio_url: publicURL }]);

                if (dbError) throw dbError;

                // 5. Delete temp files to save server space
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);

                res.json({ success: true, message: 'Audio Extracted and Saved!', url: publicURL });

            } catch (error) {
                console.error(error);
                res.status(500).json({ error: error.message });
            }
        })
        .on('error', (err) => {
            console.error('FFmpeg Error:', err);
            res.status(500).json({ error: 'Failed to extract audio' });
        });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
