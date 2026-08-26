'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Check, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { useUser } from '@/stores/auth-store';
import { resolveUserPreferredLanguage } from '@/utils/user-language-preferences';
import { cn } from '@/lib/utils';
import { formatClock } from '@meeshy/shared/utils/duration-format';
import { Button } from '@/components/v2/Button';

/**
 * L'OUTIL micro de la surface document (Task W4).
 *
 * Un post audio est un POST PORTEUR d'un média audio — pas un cinquième
 * format. La table des portes partagée (`composer-contract.ts`) n'en connaît
 * que quatre, et ce composant ne prétend pas en ajouter un : il branche dans
 * la rangée d'outils de `ComposerDocumentSurface`, à côté de photo et vidéo,
 * et rend le fichier produit à son appelant — jamais il ne publie lui-même.
 *
 * ### Ce qui était PORTÉ tel quel de `components/v2/AudioPostComposer.tsx`
 *
 * La machine à quatre phases (`idle → recording → transcribing → preview`,
 * `transcribing` restant inatteint — quirk du composer hérité, reproduit à
 * l'identique), la négociation de `mimeType` (mêmes candidats, même ordre),
 * les quatre locales de `SPEECH_RECOGNITION_LOCALES`, la forme d'onde via
 * `AnalyserNode` + `requestAnimationFrame`, et les contraintes stéréo
 * 44,1 kHz de `getUserMedia`. `AudioPostComposer.tsx` a été RETIRÉ à la
 * Task W9, derrière la double preuve (appelants recâblés, capacités tenues) —
 * ce fichier ne l'a jamais importé ni modifié ; il en avait re-codé la
 * machine de capture, qui n'a jamais eu d'autre appelant à partager.
 *
 * ### Ce qui CHANGE, et pourquoi
 *
 *  1. **une seule stratégie de téléversement.** Le composer hérité ne
 *     téléverse jamais lui-même — c'est l'appelant (`PostsFeedScreen.
 *     handleAudioPublish`) qui construit son propre service d'upload en DEUX
 *     temps (upload, puis `mediaIds: [media.id]`). Cet outil ne construit
 *     RIEN de tel : il rend le `File` produit à son appelant
 *     (`ComposerDocumentSurface`), qui l'envoie dans le MÊME pool que
 *     photo/vidéo via `useAttachmentUpload.handleFilesSelected` — un seul
 *     chemin de téléversement pour tous les médias de la surface ;
 *  2. **cet outil ne rend AUCUNE langue.** Le composer hérité construit sa
 *     transcription avec `language: transcriptLang || 'fr'`, et
 *     `PostsFeedScreen.handleAudioPublish` recopie cette valeur dans
 *     `originalLanguage`. Deux choses l'interdisent ici, et il faut les dire
 *     toutes les deux :
 *
 *     - `recognition.lang` est réglé plus bas depuis
 *       `resolveUserPreferredLanguage(user)` (ou `navigator.language`) :
 *       c'est l'hypothèse SERVIE au reconnaisseur, jamais une langue mesurée
 *       dans ce que l'auteur a dit. Un francophone qui parle anglais reste
 *       transcrit sous `fr-FR` ;
 *     - `originalLanguage` décrit la langue de `content` — la LÉGENDE tapée,
 *       que le micro n'a pas entendue.
 *
 *     Et la règle F7d (lot F) se tient en n'émettant RIEN, pas en émettant
 *     mieux : `PostService.createPost` (gateway) fait gagner la revendication
 *     du client et n'appelle `detectLanguage(data.content)` QUE si la clé est
 *     absente. Poser la clé supprimerait donc la détection serveur qui
 *     justifiait de la poser.
 *
 *     Le TEXTE transcrit, lui, reste rendu (`transcriptText`) : il décrit ce
 *     qui a été dit, ce que le reconnaisseur mesure réellement.
 */

type Phase = 'idle' | 'recording' | 'transcribing' | 'preview';

const formatDuration = (ms: number): string => formatClock(ms / 1000);

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

const SPEECH_RECOGNITION_LOCALES: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
};

function getFileExtension(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export interface AudioCaptureResult {
  readonly file: File;
  readonly durationMs: number;
  readonly transcriptText: string;
}

export interface AudioCaptureProps {
  readonly disabled?: boolean;
  readonly onCaptured: (result: AudioCaptureResult) => void;
  /**
   * W7 — le JETON d'armement externe (Task W7, § micro). Le bouton rond du
   * fil n'ouvre plus `AudioPostComposer` : il incrémente ce compteur, relayé
   * depuis `MeeshyComposer` via `ComposerDocumentSurface`. Un COMPTEUR, pas
   * un booléen : refermer le panneau puis re-taper le bouton doit le
   * RÉ-ouvrir, ce qu'un `true` déjà `true` ne redéclenche jamais (React ne
   * relance un effet que sur un changement de VALEUR). `undefined` ⇒ jamais
   * armé de l'extérieur — le comportement inchangé de W4 (bouton propre,
   * panneau propre).
   */
  readonly armToken?: number;
  /**
   * W7 (correctif R2) — la CONSOMMATION du jeton. Sans elle l'armement est
   * rémanent : le panneau n'est monté que sous l'expansion de la surface, et
   * React ré-exécute chaque effet AU MONTAGE. Publier replie la surface,
   * changer de format la démonte — au remontage suivant, un jeton toujours
   * défini rouvrait le panneau que personne n'avait redemandé. Un jeton
   * s'OBSERVE puis se CONSOMME ; l'observer seul fait de sa durée de vie
   * celle du montage, ce qu'aucun appelant ne contrôle.
   *
   * Appelé UNE fois par ouverture effective, jamais quand l'ouverture est
   * refusée (`disabled`) : une intention refusée n'est pas une intention
   * servie, et l'auteur la retrouve dès que l'outil redevient disponible.
   */
  readonly onArmed?: () => void;
}

export function AudioCapture({ disabled = false, onCaptured, armToken, onArmed }: AudioCaptureProps) {
  const { t } = useI18n('common');
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
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
  const isRecordingRef = useRef(false);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  // Armement externe : toute valeur DÉFINIE ouvre le panneau, y compris au
  // montage (React exécute chaque effet une première fois, ce qui couvre le
  // cas « le jeton est déjà posé quand ce composant apparaît » — l'appelant
  // vient de forcer l'expansion pour la même raison). Un `armToken`
  // `undefined` ne fait jamais rien : c'est le canal du bouton rond, pas une
  // ouverture spontanée.
  //
  // L'ouverture au montage est CE QUI REND l'armement rémanent si personne ne
  // consomme le jeton : `onArmed` est donc appelé dans le même souffle, et
  // c'est le propriétaire du jeton (l'écran) qui l'efface. La référence est
  // tenue dans un `ref` plutôt que dans les dépendances : un appelant qui
  // passe une lambda en ligne changerait l'identité à chaque rendu, et
  // l'effet — qui APPELLE ce callback — se rejouerait sans fin.
  const onArmedRef = useRef(onArmed);
  useEffect(() => {
    onArmedRef.current = onArmed;
  }, [onArmed]);

  useEffect(() => {
    if (armToken === undefined || disabled) return;
    setOpen(true);
    onArmedRef.current?.();
  }, [armToken, disabled]);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
    isRecordingRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const resetDraft = useCallback(() => {
    setPhase('idle');
    setDuration(0);
    setWaveform([]);
    setTranscript('');
    setInterimTranscript('');
    setAudioBlob(null);
    setAudioUrl(null);
    setError(null);
  }, []);

  const closePanel = useCallback(() => {
    cleanup();
    resetDraft();
    setOpen(false);
  }, [cleanup, resetDraft]);

  // ── Forme d'onde ──────────────────────────────────────────────────────
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(data);

    const samples = 24;
    const step = Math.max(1, Math.floor(data.length / samples));
    const bars: number[] = [];
    for (let i = 0; i < samples; i++) {
      const val = data[i * step];
      bars.push(Math.abs(val - 128) / 128);
    }
    setWaveform(bars);
    setDuration(Date.now() - startTimeRef.current);
    animFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  // ── Transcription temps réel (Web Speech API) ─────────────────────────
  const startTranscription = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    const preferredLanguage = user ? resolveUserPreferredLanguage(user) : null;
    recognition.lang = preferredLanguage
      ? SPEECH_RECOGNITION_LOCALES[preferredLanguage] ?? preferredLanguage
      : navigator.language;
    recognition.maxAlternatives = 1;

    let finalText = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalText);
      setInterimTranscript(interim);
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (isRecordingRef.current && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* already running */ }
      }
    };

    try {
      recognition.start();
    } catch { /* ignore */ }

    recognitionRef.current = recognition;
  }, [user]);

  // ── Enregistrement ────────────────────────────────────────────────────
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

        isRecordingRef.current = false;
        recognitionRef.current?.stop();
        recognitionRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      startTimeRef.current = Date.now();
      isRecordingRef.current = true;
      setPhase('recording');
      updateWaveform();
      startTranscription();
    } catch {
      setError(t('postComposer.audio.error'));
    }
  }, [updateWaveform, startTranscription, t]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  const handleRetry = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    resetDraft();
  }, [audioUrl, resetDraft]);

  const handleConfirm = useCallback(() => {
    if (!audioBlob) return;
    const mimeType = audioBlob.type || getSupportedMimeType();
    const ext = getFileExtension(mimeType);
    const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, {
      type: mimeType,
      lastModified: Date.now(),
    });

    onCaptured({
      file,
      durationMs: duration,
      transcriptText: transcript,
    });

    closePanel();
  }, [audioBlob, duration, transcript, onCaptured, closePanel]);

  const toggle = useCallback(() => {
    if (open) {
      closePanel();
    } else {
      setOpen(true);
    }
  }, [open, closePanel]);

  return (
    <div className="relative" data-testid="audio-capture">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        data-testid="audio-capture-toggle"
        aria-label={t('postComposer.addAudio')}
        className={cn(
          'p-2 rounded-lg text-[var(--gp-text-muted)] hover:bg-[var(--gp-parchment)] transition-colors',
          disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
        )}
      >
        <Mic className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          data-testid="audio-capture-panel"
          className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-3 shadow-lg"
        >
          {error && (
            <p data-testid="audio-capture-error" role="alert" className="mb-2 text-xs text-red-500">
              {error}
            </p>
          )}

          {phase === 'idle' && (
            <div className="py-2 text-center">
              <button
                type="button"
                onClick={startRecording}
                data-testid="audio-capture-start"
                aria-label={t('postComposer.audio.start')}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--gp-terracotta)] text-white hover:opacity-90 transition-opacity"
              >
                <Mic className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          )}

          {phase === 'recording' && (
            <div className="text-center">
              <div
                data-testid="audio-capture-waveform"
                className="mb-2 flex h-10 items-center justify-center gap-0.5"
              >
                {waveform.map((v, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-[var(--gp-terracotta)] transition-all duration-75"
                    style={{ height: `${Math.max(4, v * 40)}px` }}
                  />
                ))}
              </div>

              <p className="mb-2 font-mono text-sm font-semibold text-[var(--gp-terracotta)]">
                {formatDuration(duration)}
              </p>

              {(transcript || interimTranscript) && (
                <div className="mb-2 max-h-16 overflow-y-auto rounded-lg bg-[var(--gp-parchment)] p-2 text-left text-xs text-[var(--gp-text-primary)]">
                  {transcript}
                  {interimTranscript && (
                    <span className="italic text-[var(--gp-text-muted)]"> {interimTranscript}</span>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={stopRecording}
                data-testid="audio-capture-stop"
                aria-label={t('postComposer.audio.stop')}
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gp-terracotta)] text-white hover:opacity-90 transition-opacity"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {phase === 'preview' && audioUrl && (
            <div>
              <audio src={audioUrl} controls className="mb-2 w-full" />
              {transcript && (
                <p
                  data-testid="audio-capture-transcript"
                  className="mb-2 text-xs text-[var(--gp-text-secondary)]"
                >
                  {transcript}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRetry}
                  data-testid="audio-capture-retry"
                  className="flex-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('postComposer.audio.retry')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleConfirm}
                  data-testid="audio-capture-confirm"
                  className="flex-1"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('postComposer.audio.confirm')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

AudioCapture.displayName = 'AudioCapture';
