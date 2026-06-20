const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

/**
 * synthesizeTTS(text)
 * - If COQUI_TTS_CLI is true and the CLI command is available, uses it to generate an audio file in server/public/tts-
 * - If not available, returns null (client will use browser speechSynthesis).
 */
async function synthesizeTTS(text) {
  if (!text || text.length < 2) return null;
  const coquiEnabled = (process.env.COQUI_TTS_CLI || 'true') === 'true';
  const cmd = process.env.COQUI_TTS_CMD || 'tts';
  const outDir = path.join(__dirname, 'public');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  if (coquiEnabled) {
    // sanitize filename
    const fname = `tts-${Date.now()}.${process.env.TTS_FORMAT || 'mp3'}`;
    const outPath = path.join(outDir, fname);
    try {
      // Try a simple CLI call: `tts --text "..." --out_path out.wav`
      // Note: user must have `tts` CLI installed (coqui TTS) or set COQUI_TTS_CMD to their CLI.
      execFileSync(cmd, ['--text', text, '--out_path', outPath], { stdio: 'ignore', maxBuffer: 1024 * 1024 * 10 });
      return `/${fname}`;
    } catch (e) {
      console.warn('Coqui TTS CLI failed:', e.message || e);
      return null;
    }
  }
  return null;
}

module.exports = { synthesizeTTS };
