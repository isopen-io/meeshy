'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import type { BrowserTranscription, VoiceProfileSegment } from '@meeshy/shared/types/voice-api';

// Constants
const MIN_RECORDING_SECONDS = 10;
const MAX_RECORDING_SECONDS = 21;

// Types pour Web Speech API
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface UseVoiceRecordingProps {
  sourceLanguage: string;
  onRecordingComplete?: (blob: Blob, url: string) => void;
}

interface UseVoiceRecordingReturn {
  // State
  isRecording: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  liveTranscript: string;
  browserTranscription: BrowserTranscription | null;

  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;

  // Refs (exposés pour les composants qui en ont besoin)
  transcriptSegmentsRef: React.MutableRefObject<VoiceProfileSegment[]>;
}

/**
 * Hook pour gérer l'enregistrement audio avec transcription en temps réel
 * Responsabilités:
 * - Enregistrement via MediaRecorder
 * - Transcription en temps réel via Web Speech API
 * - Gestion du timer et auto-stop
 * - Feedback sonore
 */
export function useVoiceRecording({
  sourceLanguage,
  onRecordingComplete,
}: UseVoiceRecordingProps): UseVoiceRecordingReturn {
  // États d'enregistrement
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // États de transcription en temps réel
  const [liveTranscript, setLiveTranscript] = useState('');
  const [browserTranscription, setBrowserTranscription] = useState<BrowserTranscription | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptSegmentsRef = useRef<VoiceProfileSegment[]>([]);

  // Feedback sonore
  const playRecordingStart = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Ignore audio errors
    }
  }, []);

  const playRecordingStop = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Ignore audio errors
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Feedback sonore
      playRecordingStop();

      // Arrêter la reconnaissance vocale et créer la transcription finale
      if (recognitionRef.current) {
        recognitionRef.current.stop();

        // Créer la browserTranscription finale
        const finalText = transcriptSegmentsRef.current.map(s => s.text).join(' ').trim();
        if (finalText) {
          const durationMs = recordingTime * 1000;
          setBrowserTranscription({
            text: finalText,
            language: sourceLanguage,
            confidence: transcriptSegmentsRef.current.length > 0
              ? transcriptSegmentsRef.current.reduce((acc, s) => acc + s.confidence, 0) / transcriptSegmentsRef.current.length
              : 0,
            segments: transcriptSegmentsRef.current,
            durationMs
          });
        }
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording, recordingTime, sourceLanguage, playRecordingStop]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      audioChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;
      transcriptSegmentsRef.current = [];
      setLiveTranscript('');
      setBrowserTranscription(null);

      // Démarrer la reconnaissance vocale si disponible
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = sourceLanguage === 'fr' ? 'fr-FR' : sourceLanguage === 'es' ? 'es-ES' : sourceLanguage === 'pt' ? 'pt-BR' : 'en-US';

        let segmentStartTime = 0;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript;
              // Ajouter un segment avec timestamps approximatifs
              const endTime = Date.now();
              transcriptSegmentsRef.current.push({
                text: result[0].transcript.trim(),
                startMs: segmentStartTime,
                endMs: endTime - (recognitionRef.current as any)?._startTime || endTime,
                confidence: result[0].confidence || 0.8
              });
              segmentStartTime = endTime - (recognitionRef.current as any)?._startTime || 0;
            } else {
              interimTranscript += result[0].transcript;
            }
          }

          // Mettre à jour le transcript en temps réel
          const fullTranscript = transcriptSegmentsRef.current.map(s => s.text).join(' ') + ' ' + interimTranscript;
          setLiveTranscript(fullTranscript.trim());
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.warn('[VoiceRecording] Speech recognition error:', event.error);
        };

        (recognition as any)._startTime = Date.now();
        recognition.start();
        recognitionRef.current = recognition;
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
        onRecordingComplete?.(blob, url);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);
      setAudioUrl(null);

      // Feedback sonore
      playRecordingStart();

      // Timer avec auto-stop
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 0.1;
          if (newTime >= MAX_RECORDING_SECONDS) {
            stopRecording();
          }
          return newTime;
        });
      }, 100);

    } catch (err) {
      console.error('[VoiceRecording] Error starting recording:', err);
      toast.error('Impossible d\'accéder au microphone');
    }
  }, [sourceLanguage, playRecordingStart, stopRecording, onRecordingComplete]);

  const resetRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setLiveTranscript('');
    setBrowserTranscription(null);
    transcriptSegmentsRef.current = [];
  }, [audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return {
    isRecording,
    recordingTime,
    audioBlob,
    audioUrl,
    liveTranscript,
    browserTranscription,
    startRecording,
    stopRecording,
    resetRecording,
    transcriptSegmentsRef,
  };
}

export { MIN_RECORDING_SECONDS, MAX_RECORDING_SECONDS };
