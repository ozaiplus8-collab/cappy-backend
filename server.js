const express = require('express');
const multer = require('multer');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Uploads Folder စစ်ဆေးပြီး မရှိပါက ဖန်တီးခြင်း
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// File Upload Config (Multer)
const upload = multer({ dest: 'uploads/' });

// API Keys Configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Root Endpoint - Web App UI
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="my">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cappy Video Recap Generator</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-900 text-slate-100 min-h-screen p-4 flex flex-col items-center">
        <div class="max-w-md w-full bg-slate-800 p-6 rounded-2xl shadow-xl space-y-5 border border-slate-700">
            <h1 class="text-2xl font-bold text-amber-400 text-center">🎬 Cappy Video Recap</h1>
            <p class="text-xs text-slate-400 text-center">ဗီဒီယိုဖိုင် တင်သွင်း၍ မြန်မာ ဇာတ်ကြောင်းပြန် စာသား ထုတ်ယူပါ</p>
            
            <div class="space-y-2">
                <label class="text-sm font-medium text-slate-300">ဗီဒီယိုဖိုင် ရွေးချယ်ပါ:</label>
                <input type="file" id="videoFile" accept="video/*" class="w-full bg-slate-700 text-sm p-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-amber-400">
            </div>

            <button onclick="generateRecap()" id="btnSubmit" class="w-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold py-3 rounded-lg transition">
                AI Recap စတင်ဖန်တီးမည်
            </button>

            <div id="status" class="hidden text-center text-xs text-amber-300 font-semibold animate-pulse">
                ⏳ လုပ်ဆောင်နေပါပြီ... (FFmpeg + Whisper + Gemini API)
            </div>

            <div class="space-y-2">
                <label class="text-sm font-medium text-slate-300">ရလဒ် (Myanmar Recap Script):</label>
                <div id="result" class="bg-slate-950 p-4 rounded-lg text-sm leading-relaxed text-slate-200 min-h-[120px] max-h-[250px] overflow-y-auto whitespace-pre-wrap border border-slate-800">
                    ရလဒ် ဤနေရာတွင် ပေါ်လာပါမည်...
                </div>
            </div>
        </div>

        <script>
            async function generateRecap() {
                const fileInput = document.getElementById('videoFile');
                const resultDiv = document.getElementById('result');
                const statusDiv = document.getElementById('status');
                const btn = document.getElementById('btnSubmit');

                if (fileInput.files.length === 0) {
                    alert('ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် ရွေးချယ်ပါ');
                    return;
                }

                const formData = new FormData();
                formData.append('video', fileInput.files[0]);

                statusDiv.classList.remove('hidden');
                btn.disabled = true;
                btn.classList.add('opacity-50');
                resultDiv.innerText = 'လုပ်ဆောင်နေပါပြီ... ခဏစောင့်ပေးပါ...';

                try {
                    const response = await fetch('/api/generate-recap', {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();

                    if (data.success) {
                        resultDiv.innerText = data.recap_script_myanmar;
                    } else {
                        resultDiv.innerText = 'Error: ' + (data.error || 'လုပ်ဆောင်မှု မအောင်မြင်ပါ');
                    }
                } catch (err) {
                    resultDiv.innerText = 'Error: ' + err.message;
                } finally {
                    statusDiv.classList.add('hidden');
                    btn.disabled = false;
                    btn.classList.remove('opacity-50');
                }
            }
        </script>
    </body>
    </html>
    `);
});

// API Endpoint for Video Recap Generation
app.post('/api/generate-recap', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
    }

    const videoPath = req.file.path;
    const audioPath = path.join('uploads', `${req.file.filename}.mp3`);

    try {
        // Step 1: Extract Audio using FFmpeg
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .toFormat('mp3')
                .on('end', resolve)
                .on('error', reject)
                .save(audioPath);
        });

        // Step 2: Speech-to-Text via OpenAI Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: 'whisper-1',
        });

        const originalText = transcription.text;

        // Step 3: Script Recap & Translation via Gemini API
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `Following is a transcript extracted from a video. Generate a concise, engaging video recap script in Burmese language (မြန်မာဘာသာ) suitable for a short-form recap video (ဇာတ်ကြောင်းပြန်):
        
        Transcript: ${originalText}`;

        const result = await model.generateContent(prompt);
        const recapScript = result.response.text();

        // Cleanup temporary files
        fs.unlinkSync(videoPath);
        fs.unlinkSync(audioPath);

        // Return Results
        res.json({
            success: true,
            original_transcript: originalText,
            recap_script_myanmar: recapScript
        });

    } catch (error) {
        // Cleanup files on error
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
