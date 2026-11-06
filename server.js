const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// FFmpeg Path ချိတ်ဆက်ခြင်း
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
app.use(cors());
app.use(express.json());

// ဖိုင်များ ယာယီသိမ်းဆည်းရန် Folders များ ဆောက်ခြင်း
const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Multer (File Upload Configuration)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Static folders များ ထုတ်ပေးရန်
app.use('/outputs', express.static(outputDir));

// Test Endpoint
app.get('/', (req, res) => {
    res.send('Cappy Studio Backend is running live!');
});

// Video Processing Endpoint (တကယ် FFmpeg ဖြင့် ဗီဒီယိုပြင်ဆင်သည့် API)
app.post('/api/process-video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'ဗီဒီယိုဖိုင် မပါဝင်ပါ' });
    }

    const inputVideoPath = req.file.path;
    const outputFileName = `recap-${Date.now()}.mp4`;
    const outputVideoPath = path.join(outputDir, outputFileName);

    console.log('ဗီဒီယို စတင်လုပ်ဆောင်နေပါပြီ: ' + inputVideoPath);

    // ဥပမာ - FFmpeg ဖြင့် ဗီဒီယိုအရွယ်အစား ပြောင်းလဲခြင်း (သို့မဟုတ် တကယ့် Recap လုပ်ငန်းစဉ်)
    ffmpeg(inputVideoPath)
        .outputOptions([
            '-c:v libx264',
            '-crf 28',
            '-preset ultrafast',
            '-c:a aac'
        ])
        .save(outputVideoPath)
        .on('end', () => {
            console.log('ဗီဒီယို ပြီးစီးပါပြီ: ' + outputVideoPath);
            // ပြီးသွားပါက Client ထံသို့ Output URL ပြန်ပို့ပေးသည်
            res.json({
                success: true,
                message: 'ဗီဒီယို Recap ဖန်တီးပြီးပါပြီ',
                downloadUrl: `https://${req.get('host')}/outputs/${outputFileName}`
            });
        })
        .on('error', (err) => {
            console.error('FFmpeg Error:', err);
            res.status(500).json({ error: 'ဗီဒီယို ပြုပြင်ရာတွင် အမှားအယွင်း ဖြစ်ပေါ်သည်', details: err.message });
        });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
