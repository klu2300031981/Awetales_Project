import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// --- Type Definitions ---
interface DiarizationEntry {
  speaker: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
}

// --- Mock Data and API Simulation ---
const mockDiarizationData: DiarizationEntry[] = [
  { speaker: "Target", start: 0.45, end: 5.62, text: "Hello, how are you? I wanted to talk about the project.", confidence: 0.97 },
  { speaker: "Speaker_B", start: 5.63, end: 10.25, text: "I'm doing well, thank you. Yes, let's discuss the new design.", confidence: 0.95 },
  { speaker: "Target", start: 10.50, end: 15.80, text: "Great. I think the latest mockups look promising, but we need to adjust the color palette.", confidence: 0.98 },
  { speaker: "Speaker_C", start: 16.10, end: 22.34, text: "I agree. A darker theme might be more appropriate for the target audience.", confidence: 0.92 },
  { speaker: "Speaker_B", start: 22.50, end: 28.15, text: "Okay, I'll have the design team work on a few alternatives by end of day.", confidence: 0.96 },
];
const generateMockTargetAudio = () => {
  const sampleRate = 44100;
  const durationSeconds = 1.5;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const frequency = 440; // A4 tone
  const amplitude = 0.2;

  const samples = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    samples[i] = Math.round(Math.sin(2 * Math.PI * frequency * t) * amplitude * 0x7fff);
  }

  const wavHeaderSize = 44;
  const buffer = new ArrayBuffer(wavHeaderSize + samples.byteLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  let offset = 0;
  writeString(offset, "RIFF"); offset += 4;
  view.setUint32(offset, 36 + samples.byteLength, true); offset += 4;
  writeString(offset, "WAVE"); offset += 4;
  writeString(offset, "fmt "); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size (PCM)
  view.setUint16(offset, 1, true); offset += 2; // AudioFormat (PCM)
  view.setUint16(offset, 1, true); offset += 2; // NumChannels
  view.setUint32(offset, sampleRate, true); offset += 4; // SampleRate
  view.setUint32(offset, sampleRate * 2, true); offset += 4; // ByteRate
  view.setUint16(offset, 2, true); offset += 2; // BlockAlign
  view.setUint16(offset, 16, true); offset += 2; // BitsPerSample
  writeString(offset, "data"); offset += 4;
  view.setUint32(offset, samples.byteLength, true); offset += 4;

  const audioData = new Uint8Array(buffer, wavHeaderSize);
  audioData.set(new Uint8Array(samples.buffer));

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
};

const mockTargetSpeakerAudio = generateMockTargetAudio(); // Generated sine wave for demo playback

const simulateApiCall = (): Promise<{ diarization: DiarizationEntry[], targetAudio: string }> => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ diarization: mockDiarizationData, targetAudio: mockTargetSpeakerAudio });
    }, 2500);
  });
};

const streamingMockTexts = [
    { speaker: "Target", text: "Okay, starting the stream now. " },
    { speaker: "Speaker_B", text: "I can hear you clearly. " },
    { speaker: "Target", text: "Perfect. Let's begin the real-time test. " },
    { speaker: "Speaker_B", text: "The latency seems very low. " },
    { speaker: "Target", text: "This is a great result for our pipeline. " },
];

// --- UI Components ---

const FileInput = ({ label, file, setFile }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div>
            <label>{label}</label>
            <div className="file-input-wrapper" onClick={() => inputRef.current?.click()}>
                <input
                    type="file"
                    accept="audio/wav"
                    ref={inputRef}
                    onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                    aria-label={label}
                />
                {file ? <span className="file-name">{file.name}</span> : <span>Click to upload .wav file</span>}
            </div>
        </div>
    );
};

const Timeline = ({ data, duration }) => {
    return (
        <div className="timeline">
            {Object.entries(data.reduce((acc, entry) => {
                if (!acc[entry.speaker]) acc[entry.speaker] = [];
                acc[entry.speaker].push(entry);
                return acc;
            }, {})).map(([speaker, segments]: [string, DiarizationEntry[]]) => (
                <div key={speaker} className="timeline-track">
                    <div className={`speaker-label ${speaker.replace('_', '-')}`}>{speaker}</div>
                    <div className="timeline-segments">
                        {segments.map((seg, i) => (
                            <div
                                key={i}
                                className={`segment speaker-color-${seg.speaker.replace('_', '')}`}
                                style={{
                                    left: `${(seg.start / duration) * 100}%`,
                                    width: `${((seg.end - seg.start) / duration) * 100}%`,
                                }}
                                title={`[${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s] ${seg.text}`}
                            >
                                {seg.text}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

const Transcript = ({ data }) => (
    <div className="transcript-view">
        {data.map((entry, i) => (
            <div key={i} className="transcript-item">
                <span className={`transcript-speaker ${entry.speaker.replace('_', '')}`}>{entry.speaker}</span>
                <span> ({entry.start.toFixed(2)}s - {entry.end.toFixed(2)}s): </span>
                <span>{entry.text}</span>
            </div>
        ))}
    </div>
);

// --- Main App Component ---

const App = () => {
  const [mixtureAudio, setMixtureAudio] = useState<File | null>(null);
  const [targetSample, setTargetSample] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [results, setResults] = useState<{ diarization: DiarizationEntry[], targetAudio: string } | null>(null);
  const streamingIntervalRef = useRef<number | null>(null);

  const totalDuration = results ? Math.max(...results.diarization.map(d => d.end), 0) + 2 : 0;

  const handleProcess = async () => {
    if (!mixtureAudio || !targetSample) {
      alert("Please upload both mixture and target audio files.");
      return;
    }
    setProcessing(true);
    setResults(null);
    const apiResponse = await simulateApiCall();
    setResults(apiResponse);
    setProcessing(false);
  };
  
  const handleStartStreaming = async () => {
    if (!targetSample) {
      alert("Please upload a target speaker sample before streaming.");
      return;
    }
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setStreaming(true);
        setResults({ diarization: [], targetAudio: "" });
        
        let streamIndex = 0;
        let currentTime = 0;

        streamingIntervalRef.current = window.setInterval(() => {
            if (streamIndex >= streamingMockTexts.length) {
                handleStopStreaming();
                return;
            }
            const newItem = streamingMockTexts[streamIndex];
            const duration = newItem.text.length / 15; // Rough duration
            const newEntry: DiarizationEntry = {
                ...newItem,
                start: currentTime,
                end: currentTime + duration,
                confidence: 0.9 + Math.random() * 0.09,
            };
            
            setResults(prev => ({
                diarization: [...(prev?.diarization || []), newEntry],
                targetAudio: "",
            }));

            currentTime += duration + 0.5; // Add gap
            streamIndex++;

        }, 2000);

    } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Microphone access is required for streaming. Please enable it in your browser settings.");
    }
  };

  const handleStopStreaming = () => {
    if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
    }
    setStreaming(false);
  };
  
  useEffect(() => {
    return () => { // Cleanup on unmount
        if (streamingIntervalRef.current) {
            clearInterval(streamingIntervalRef.current);
        }
    };
  }, []);

  return (
    <>
      <header>
        <h1>Unified Neural Pipeline</h1>
        <p>Target Speaker Identification and Multispeaker ASR</p>
      </header>
      
      <main>
        <div className="card">
          <div className="card-header">
            <h2>Offline Processing</h2>
            <p>Upload a multi-speaker recording and a reference clip of the target speaker.</p>
          </div>
          <div className="input-group">
            <FileInput label="Mixture Audio (.wav)" file={mixtureAudio} setFile={setMixtureAudio} />
            <FileInput label="Target Speaker Sample (.wav)" file={targetSample} setFile={setTargetSample} />
          </div>
          <div className="button-group">
            <button onClick={handleProcess} disabled={processing || streaming || !mixtureAudio || !targetSample}>
              {processing ? 'Processing...' : 'Process Audio'}
            </button>
          </div>
        </div>

        <div className="card">
            <div className="card-header">
                <h2>Real-Time Streaming</h2>
                <p>Use your microphone for real-time diarization after providing a target sample.</p>
            </div>
             {!streaming && <div className="input-group" style={{marginBottom: '1rem'}}>
                <FileInput label="Target Speaker Sample (.wav)" file={targetSample} setFile={setTargetSample} />
            </div>}
            <div className="button-group">
                {!streaming ? (
                    <button onClick={handleStartStreaming} disabled={processing || !targetSample}>Start Streaming</button>
                ) : (
                    <button onClick={handleStopStreaming} className="secondary">Stop Streaming</button>
                )}
            </div>
             {streaming && <div className="loader" style={{marginTop: '1rem'}}>
                <div className="spinner"></div>
                <span>Listening...</span>
            </div>}
        </div>

        {processing && (
          <div className="loader card">
            <div className="spinner"></div>
            <span>Analyzing audio, please wait...</span>
          </div>
        )}

        {results && (results.diarization.length > 0 || results.targetAudio) && (
          <div className="card results-container">
            <div className="card-header">
              <h2>Results</h2>
            </div>

            {results.targetAudio && (
              <div className="audio-player">
                <h3>Isolated Target Speaker Audio</h3>
                <audio controls src={results.targetAudio} aria-label="Isolated Target Speaker Audio">
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
            
            {results.diarization.length > 0 && (
                <>
                    <h3>Diarization Timeline</h3>
                    <Timeline data={results.diarization} duration={totalDuration} />
    
                    <h3>Full Transcript</h3>
                    <Transcript data={results.diarization} />
    
                    <div className="json-view">
                      <details>
                        <summary>View Raw JSON Output</summary>
                        <pre><code>{JSON.stringify(results.diarization, null, 2)}</code></pre>
                      </details>
                    </div>
                </>
            )}

          </div>
        )}
      </main>
    </>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);