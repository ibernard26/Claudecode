const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * transcribeAudio(filePath)
 * - Tries to run whisper.cpp binary if WHISPER_CPP_PATH and WHISPER_MODEL_PATH are defined in .env
 * - Otherwise returns an error-like string instructing installation steps.
 */
async function transcribeAudio(filePath) {
  const whisperPath = process.env.WHISPER_CPP_PATH;
  const modelPath = process.env.WHISPER_MODEL_PATH;

  if (whisperPath && modelPath) {
    // Construct args for whisper.cpp style executable. The exact flags depend on your build.
    // This attempts a common invocation: ./main -m model.bin -f input.wav -otxt -t 1
    // NOTE: Some builds differ — see server/README-whisper.md in the repo for exact instructions.
    return new Promise((resolve, reject) => {
      const args = ['-m', modelPath, '-f', filePath];
      // If the binary supports output to stdout as text, add flags as needed.
      // Many builds output transcribed text to stdout — we'll capture stdout.
      try {
        const child = execFile(whisperPath, args, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
          if (err) {
            console.error('whisper invocation failed', err, stderr);
            return reject(new Error('Whisper invocation failed: ' + (err.message || stderr)));
          }
          const out = (stdout || '').toString().trim();
          if (out.length === 0) {
            // If no stdout, try reading any generated .txt file next to audio
            const txtCandidate = filePath + '.txt';
            if (fs.existsSync(txtCandidate)) {
              const txt = fs.readFileSync(txtCandidate, 'utf8');
              return resolve(txt.trim());
            }
            return resolve('');
          }
          resolve(out);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Fallback: return an instructive placeholder explaining how to set up whisper.cpp
  return `ERROR_WHISPER_NOT_CONFIGURED: Please set WHISPER_CPP_PATH and WHISPER_MODEL_PATH in server/.env and install whisper.cpp. See server/README-whisper.md for instructions.`;
}

module.exports = { transcribeAudio };
