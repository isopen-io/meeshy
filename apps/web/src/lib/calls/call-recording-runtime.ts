import * as callsEndpoints from '@meeshy/shared/api/endpoints/calls';
import type { CallRecordingKind, CallRecordingLinkResult as LinkedRecording } from '@meeshy/shared/types/call-recording';

import { uploadAttachments } from '@/lib/api/attachments';
import { apiDeps } from '@/lib/api/deps';

import type { CallRecorderHandle, CallRecorderStart, CallRecorderTarget, CallRecordingOutcome } from './call-recording';
import { createBrowserCompositor } from './call-recording-compositor';
import { callStore, type ActiveCall, type CallStoreApi } from './call-store';
import { hasVideo, orderedMembers } from './call-view';

/**
 * **CE QUI CAPTE, CHEZ L'ENREGISTREUR SEUL** (#8064, D-140) — chunk chargé à
 * `call:recording-started` quand le spectateur est celui qui a demandé : la
 * passerelle a recueilli l'accord de tous. Il mélange SA voix et celle de
 * chaque pair (WebAudio), capture le mélange (`MediaRecorder`), puis, à
 * l'arrêt, dépose le fichier par le chemin des pièces jointes et le rattache à
 * la bulle de l'appel (`POST calls/:callId/recordings/:recordingId/attachment`).
 * Un micro coupé reste coupé dans l'enregistrement : la piste désactivée ne
 * porte que du silence.
 *
 * **La vidéo** (#8437) : les tuiles VISIBLES de l'appel (chaque pair, puis
 * moi) sont peintes en grille sur un canevas (`call-recording-compositor.ts`),
 * dont la piste rejoint le mélange des voix dans un seul `MediaRecorder`.
 */

export type AudioMixer = {
  readonly output: MediaStream;
  readonly add: (key: string, stream: MediaStream) => void;
  readonly close: () => void;
};

/** Une tuile de l'enregistrement vidéo : son image quand elle en a une, son nom sinon. */
export type CompositeTile = { readonly key: string; readonly name: string; readonly stream: MediaStream | null };

export type VideoCompositor = {
  readonly output: MediaStreamTrack;
  readonly setTiles: (tiles: readonly CompositeTile[]) => void;
  readonly close: () => void;
};

export type CompositeRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type AudioCapture = {
  readonly start: () => void;
  readonly stop: () => Promise<Blob>;
};

export type CallRecordingLinkResult = 'linked' | 'bubble-missing' | 'failed';

export type CallRecorderDeps = {
  readonly calls: CallStoreApi;
  readonly createMixer: () => AudioMixer;
  readonly createCompositor: () => VideoCompositor;
  /** Le mélange des voix et la piste composée, en un seul flux à capter. */
  readonly combine: (audio: MediaStream, video: MediaStreamTrack) => MediaStream;
  readonly createCapture: (stream: MediaStream, kind: CallRecordingKind) => AudioCapture;
  readonly upload: (file: File, durationMs: number) => Promise<string | null>;
  readonly link: (target: CallRecorderTarget, attachmentId: string) => Promise<CallRecordingLinkResult>;
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
};

const LINK_ATTEMPTS = 3;
const LINK_RETRY_MS = 2_000;

const streamsOf = (call: ActiveCall | null): ReadonlyArray<readonly [string, MediaStream]> => {
  if (call === null) return [];
  const local: ReadonlyArray<readonly [string, MediaStream]> = call.localStream === null ? [] : [[`local:${call.localStream.id}`, call.localStream]];
  const remote = Object.entries(call.remoteStreams).map(([userId, stream]) => [`remote:${userId}:${stream.id}`, stream] as const);
  return [...local, ...remote];
};

const extensionOf = (mimeType: string): string => (mimeType.includes('mp4') ? (mimeType.startsWith('video') ? 'mp4' : 'm4a') : 'webm');

/** Les tuiles de l'écran : chaque pair qui a décroché, dans l'ordre de la grille, puis moi. */
export function recordingTilesOf(call: ActiveCall | null): readonly CompositeTile[] {
  if (call === null) return [];
  const peers = orderedMembers(call.members)
    .filter((member) => member.link !== 'ringing')
    .map((member): CompositeTile => {
      const stream = call.remoteStreams[member.userId];
      return { key: member.userId, name: member.name, stream: (member.cameraOn || member.screenSharing) && stream !== undefined && hasVideo(stream) ? stream : null };
    });
  return [...peers, { key: 'self', name: '', stream: call.cameraOn || call.screenSharing ? call.localStream : null }];
}

/** Une grille qui couvre le cadre : autant de colonnes que la racine carrée l'exige. */
export function compositeRects(count: number, width: number, height: number): readonly CompositeRect[] {
  if (count <= 0) return [];
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const cellWidth = Math.floor(width / columns);
  const cellHeight = Math.floor(height / rows);
  return Array.from({ length: count }, (_, index) => ({ x: (index % columns) * cellWidth, y: Math.floor(index / columns) * cellHeight, width: cellWidth, height: cellHeight }));
}

export function createCallRecorder(deps: CallRecorderDeps): CallRecorderStart {
  return (target) => {
    const mixer = deps.createMixer();
    const plugged = new Set<string>();
    const plug = (): void => {
      for (const [key, stream] of streamsOf(deps.calls.getState().call)) {
        if (plugged.has(key)) continue;
        plugged.add(key);
        mixer.add(key, stream);
      }
    };
    const compositor = target.kind === 'video' ? deps.createCompositor() : null;
    const follow = (): void => {
      plug();
      compositor?.setTiles(recordingTilesOf(deps.calls.getState().call));
    };
    follow();
    const unsubscribe = deps.calls.subscribe(follow);
    const capture = deps.createCapture(compositor === null ? mixer.output : deps.combine(mixer.output, compositor.output), target.kind);
    const startedAt = deps.now();
    capture.start();

    const attach = async (attachmentId: string, attempt: number): Promise<CallRecordingOutcome> => {
      const result = await deps.link(target, attachmentId);
      if (result === 'linked') return 'saved';
      if (result === 'failed' || attempt >= LINK_ATTEMPTS) return 'save-failed';
      await deps.wait(LINK_RETRY_MS);
      return attach(attachmentId, attempt + 1);
    };

    const finish = async (): Promise<CallRecordingOutcome> => {
      unsubscribe();
      const blob = await capture.stop().finally(() => {
        mixer.close();
        compositor?.close();
      });
      if (blob.size === 0) return 'empty';
      const file = new File([blob], `appel-${target.callId}.${extensionOf(blob.type)}`, { type: blob.type });
      const attachmentId = await deps.upload(file, Math.max(0, deps.now() - startedAt));
      return attachmentId === null ? 'save-failed' : attach(attachmentId, 1);
    };

    let stopping: Promise<CallRecordingOutcome> | null = null;
    const handle: CallRecorderHandle = { stop: () => (stopping ??= finish()) };
    return handle;
  };
}

const MIME_CANDIDATES: Readonly<Record<CallRecordingKind, readonly string[]>> = {
  audio: ['audio/webm;codecs=opus', 'audio/mp4'],
  video: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'],
};

function createBrowserMixer(): AudioMixer {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  void context.resume().catch(() => undefined);
  return {
    output: destination.stream,
    add: (_key, stream) => {
      const tracks = stream.getAudioTracks();
      if (tracks.length === 0) return;
      context.createMediaStreamSource(new MediaStream(tracks)).connect(destination);
    },
    close: () => void context.close().catch(() => undefined),
  };
}

function createBrowserCapture(stream: MediaStream, kind: CallRecordingKind): AudioCapture {
  const mimeType = MIME_CANDIDATES[kind].find((candidate) => MediaRecorder.isTypeSupported(candidate));
  const recorder = mimeType === undefined ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  return {
    start: () => recorder.start(1_000),
    stop: () =>
      new Promise<Blob>((resolve) => {
        const type = recorder.mimeType || `${kind}/webm`;
        if (recorder.state === 'inactive') {
          resolve(new Blob(chunks, { type }));
          return;
        }
        recorder.onstop = () => resolve(new Blob(chunks, { type }));
        recorder.stop();
      }),
  };
}

async function uploadRecording(file: File, durationMs: number): Promise<string | null> {
  const result = await uploadAttachments({ ...apiDeps, pending: [{ file, durationMs }] });
  return result.ok ? (result.data.attachments[0]?.id ?? null) : null;
}

async function linkRecording(target: CallRecorderTarget, attachmentId: string): Promise<CallRecordingLinkResult> {
  const result = await apiDeps.transport.request<LinkedRecording>({
    method: 'POST',
    path: callsEndpoints.byCallIdRecordingsByRecordingIdAttachment(target.callId, target.recordingId),
    body: { attachmentId },
  });
  if (result.ok) return 'linked';
  return result.code === 'CALL_BUBBLE_MISSING' ? 'bubble-missing' : 'failed';
}

export const startBrowserCallRecorder: CallRecorderStart = createCallRecorder({
  calls: callStore,
  createMixer: createBrowserMixer,
  createCompositor: createBrowserCompositor,
  combine: (audio, video) => new MediaStream([...audio.getAudioTracks(), video]),
  createCapture: createBrowserCapture,
  upload: uploadRecording,
  link: linkRecording,
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
