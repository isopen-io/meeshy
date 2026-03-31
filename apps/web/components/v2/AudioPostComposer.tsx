'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { Avatar } from './Avatar';
import type { MobileTranscription, MobileTranscriptionSegment } from '@/services/posts.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioPostComposerProps {
  open: boolean;
  currentUser?: { username: string; avatar?: string | null } | null;
  onPublish: (data: {
    audioFile: File;
    transcription: MobileTranscription | null;
    content?: string;
  }) => void;
  onClose: () => void;
  disabled?: boolean;
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'preview';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'audio/webm';
}

function getFileExtension(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AudioPostComposer({
  open,
  currentUser,
  onPublish,
  onClose,
  disabled = false,
}: AudioPostComposerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [transcriptSegments, setTranscriptSegments] = useState<MobileTranscriptionSegment[]>([]);
  const [transcriptLang, setTranscriptLang] = useState('');
  const [transcriptConfidence, setTranscriptConfidence] = useState(0);
  const [caption, setCaption] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const animFrameRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── Cleanup on close ──────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase('idle');
      setDuration(0);
      setWaveform([]);
      setTranscript('');
      setInterimTranscript('');
      setTranscriptSegments([]);
      setCaption('');
      setAudioBlob(null);
      setAudioUrl(null);
      setError(null);
    }
  }, [open, cleanup]);

  // ── Waveform visualization ────────────────────────────────────────────

  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(data);

    const samples = 24;
    const step = Math.floor(data.length / samples);
    const bars: number[] = [];
    for (let i = 0; i < samples; i++) {
      const val = data[i * step];
      bars.push(Math.abs(val - 128) / 128);
    }
    setWaveform(bars);
    setDuration(Date.now() - startTimeRef.current);
    animFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  // ── Real-time transcription (Web Speech API) ──────────────────────────

  const startTranscription = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'fr-FR';
    recognition.maxAlternatives = 1;

    const segments: MobileTranscriptionSegment[] = [];
    let finalText = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript;
          finalText += text;
          const elapsed = Date.now() - startTimeRef.current;
          segments.push({
            text,
            start: elapsed - 1000,
            end: elapsed,
            speaker_id: undefined,
          });
          setTranscriptSegments([...segments]);
          setTranscriptConfidence(result[0].confidence);
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalText);
      setInterimTranscript(interim);
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (phase === 'recording' && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* already running */ }
      }
    };

    setTranscriptLang(recognition.lang.split('-')[0]);

    try {
      recognition.start();
    } catch { /* ignore */ }

    recognitionRef.current = recognition;
  }, [phase]);

  // ── Start recording ───────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 2,
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 44100 });
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setPhase('preview');

        recognitionRef.current?.stop();
        recognitionRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      startTimeRef.current = Date.now();
      setPhase('recording');
      updateWaveform();
      startTranscription();
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.');
    }
  }, [updateWaveform, startTranscription]);

  // ── Stop recording ────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  // ── Retry ─────────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setPhase('idle');
    setDuration(0);
    setWaveform([]);
    setTranscript('');
    setInterimTranscript('');
    setTranscriptSegments([]);
    setAudioBlob(null);
    setAudioUrl(null);
    setCaption('');
  }, [audioUrl]);

  // ── Publish ───────────────────────────────────────────────────────────

  const handlePublish = useCallback(() => {
    if (!audioBlob || disabled) return;

    const mimeType = audioBlob.type || getSupportedMimeType();
    const ext = getFileExtension(mimeType);
    const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mimeType, lastModified: Date.now() });

    const transcription: MobileTranscription | null = transcript
      ? {
          text: transcript,
          language: transcriptLang || 'fr',
          confidence: transcriptConfidence || undefined,
          duration_ms: duration,
          segments: transcriptSegments.length > 0 ? transcriptSegments : undefined,
        }
      : null;

    onPublish({
      audioFile: file,
      transcription,
      content: caption.trim() || undefined,
    });
  }, [audioBlob, disabled, transcript, transcriptLang, transcriptConfidence, duration, transcriptSegments, caption, onPublish]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="audio-post-composer">
      <div className="w-full max-w-lg bg-[var(--gp-surface)] rounded-t-3xl sm:rounded-3xl border border-[var(--gp-border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--gp-border)]">
          <button onClick={onClose} className="text-sm text-[var(--gp-text-muted)] hover:text-[var(--gp-text-primary)]">
            Cancel
          </button>
          <h3 className="text-sm font-semibold text-[var(--gp-text-primary)]">Audio Post</h3>
          <div className="w-12" />
        </div>

        <div className="px-5 py-6">
          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 text-sm text-red-500">{error}</div>
          )}

          {/* Idle state */}
          {phase === 'idle' && (
            <div className="text-center py-8">
              <button
                onClick={startRecording}
                className="w-20 h-20 rounded-full bg-[var(--gp-terracotta)] text-white flex items-center justify-center mx-auto hover:opacity-90 transition-opacity"
                aria-label="Start recording"
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </button>
              <p className="mt-4 text-sm text-[var(--gp-text-muted)]">Tap to record</p>
              <p className="mt-1 text-xs text-[var(--gp-text-muted)]">Stereo • Real-time transcription</p>
            </div>
          )}

          {/* Recording state */}
          {phase === 'recording' && (
            <div className="text-center">
              {/* Waveform */}
              <div className="flex items-center justify-center gap-0.5 h-16 mb-4">
                {waveform.map((v, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-[var(--gp-terracotta)] transition-all duration-75"
                    style={{ height: `${Math.max(4, v * 60)}px` }}
                  />
                ))}
              </div>

              {/* Timer */}
              <p className="text-2xl font-mono font-semibold text-[var(--gp-terracotta)] mb-2">
                {formatDuration(duration)}
              </p>

              {/* Real-time transcript */}
              {(transcript || interimTranscript) && (
                <div className="mb-4 p-3 rounded-xl bg-[var(--gp-parchment)] text-left max-h-24 overflow-y-auto">
                  <p className="text-sm text-[var(--gp-text-primary)]">
                    {transcript}
                    {interimTranscript && (
                      <span className="text-[var(--gp-text-muted)] italic">{interimTranscript}</span>
                    )}
                  </p>
                </div>
              )}

              {/* Stop button */}
              <button
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-[var(--gp-terracotta)] text-white flex items-center justify-center mx-auto hover:opacity-90 transition-opacity"
                aria-label="Stop recording"
              >
                <div className="w-6 h-6 rounded-sm bg-white" />
              </button>
              <p className="mt-2 text-xs text-[var(--gp-text-muted)]">Recording...</p>
            </div>
          )}

          {/* Preview state */}
          {phase === 'preview' && audioUrl && (
            <div>
              {/* Audio playback */}
              <div className="mb-4">
                <audio src={audioUrl} controls className="w-full" />
                <p className="text-xs text-[var(--gp-text-muted)] mt-1 text-center">
                  {formatDuration(duration)} recorded
                </p>
              </div>

              {/* Transcription preview */}
              {transcript && (
                <div className="mb-4 p-3 rounded-xl bg-[var(--gp-parchment)]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[var(--gp-text-muted)]">Transcription</span>
                    {transcriptLang && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--gp-terracotta)]/10 text-[var(--gp-terracotta)]">
                        {transcriptLang.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--gp-text-primary)]">{transcript}</p>
                </div>
              )}

              {/* Optional caption */}
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption (optional)..."
                rows={2}
                maxLength={5000}
                className={cn(
                  'w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none transition-colors mb-4',
                  'bg-[var(--gp-parchment)] border-[var(--gp-border)]',
                  'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
                  'focus:border-[var(--gp-terracotta)]',
                )}
                aria-label="Caption"
              />

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="ghost" size="sm" onClick={handleRetry} className="flex-1">
                  Retry
                </Button>
                <Button variant="primary" size="sm" onClick={handlePublish} disabled={disabled} className="flex-1">
                  Publish
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

AudioPostComposer.displayName = 'AudioPostComposer';
export { AudioPostComposer };
