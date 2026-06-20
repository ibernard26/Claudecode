import React, { useState, useRef } from 'react';
import Globe from './components/Globe';
import PushToTalk from './components/PushToTalk';

export default function App() {
  const [transcript, setTranscript] = useState('');
  const [claude, setClaude] = useState(null);
  const globeRef = useRef(null);

  const onResult = ({ transcript, claude, ttsUrl }) => {
    setTranscript(transcript);
    setClaude(claude);
    if (globeRef.current) globeRef.current.pulse();
    if (ttsUrl) {
      const a = new Audio(ttsUrl);
      a.play();
    } else if (claude?.summary) {
      const utter = new SpeechSynthesisUtterance(claude.summary);
      speechSynthesis.speak(utter);
    }
  };

  return (
    <div className="app">
      <div className="panel">
        <div className="left">
          <Globe ref={globeRef} />
          <div className="controls">
            <PushToTalk onResult={onResult} />
          </div>
        </div>
        <div className="right">
          <div style={{paddingBottom:12}}>
            <h3>Transcript</h3>
            <div style={{minHeight:40, padding:8, background:'rgba(255,255,255,0.02)', borderRadius:6}}>{transcript}</div>
          </div>
          <div style={{paddingTop:12}}>
            <h3>Claude Response (structured)</h3>
            <div className="results">
              <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(claude, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
