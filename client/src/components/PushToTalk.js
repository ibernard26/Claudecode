import React, { useState, useRef } from 'react';

export default function PushToTalk({ onResult }) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef();
  const chunksRef = useRef([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await sendAudio(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      setRecording(true);
    } catch (err) {
      alert('Microphone access denied or not available: ' + err.message);
    }
  }

  function stopRecording() {
    setRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  async function sendAudio(blob) {
    const form = new FormData();
    form.append('audio', blob, 'clip.webm');

    try {
      const resp = await fetch('/api/transcribe', {
        method: 'POST',
        body: form
      });
      const data = await resp.json();
      onResult && onResult(data);
    } catch (err) {
      console.error('upload failed', err);
    }
  }

  return (
    <div>
      <button
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
        style={{
          background: recording ? '#ff5252' : '#2d8cff',
          color: '#fff',
          border: 'none',
          padding: '18px 28px',
          borderRadius: 12,
          fontSize: 16,
          cursor: 'pointer'
        }}
      >
        {recording ? 'Recording... release to send' : 'Hold to Talk'}
      </button>
    </div>
  );
}
