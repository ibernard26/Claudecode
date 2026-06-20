const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./stt');
const { callClaude } = require('./claude');
const { synthesizeTTS } = require('./tts');
const { bingSearch } = require('./search');

require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Transcribe endpoint: accept audio file -> STT -> optional search -> Claude -> TTS
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const filePath = req.file.path;
    // 1) Transcribe
    const text = await transcribeAudio(filePath);

    // 2) If search enabled, run bing search and include results
    let searchSummary = null;
    if (process.env.BING_API_KEY && text && text.length > 3) {
      try {
        const results = await bingSearch(text);
        searchSummary = results;
      } catch (e) {
        console.warn('Bing search failed:', e.message || e);
      }
    }

    // 3) Call Claude with user query + optional search
    const claudeJson = await callClaude(text, searchSummary);

    // 4) Generate TTS for the summary (if configured)
    let ttsUrl = null;
    try {
      ttsUrl = await synthesizeTTS(claudeJson?.summary || claudeJson?.error || '');
    } catch (e) {
      console.warn('TTS generation failed:', e.message || e);
    }

    // Cleanup uploaded file
    fs.unlink(filePath, () => {});

    res.json({ transcript: text, claude: claudeJson, ttsUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
