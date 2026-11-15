import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import type { ContentCaptureKind } from '@meeshy/shared/types/content-capture-kinds';

import { outcomeOf, type Outcome } from '@/lib/api/outcome';
import type { CoqueNative } from '@/lib/native-shell';
import type { Transport } from '@/lib/net/transport';
import { CAPTURE_ROW_ATTRIBUTE } from '@/lib/view/content-exit';

import { captureLots } from './capture-ledger';
import type { CaptureJob, CaptureJobInput, CaptureOutbox } from './capture-outbox';
import { CAPTURE_SHIELD_PLUGIN, type CaptureShield } from './capture-shield';

/**
 * LA CAPTURE DÉTECTÉE PAR LA COQUE ANDROID S'ANNONCE AU FIL (#9617) — chargé à
 * la demande, dans la coque seulement (`use-screen-capture-reports.ts`).
 *
 * - `screenCaptured` (Android 14+) : ce que l'écran montre est déclaré sous un
 *   `captureId` neuf, en lots de dix (`captureLots` : la passerelle n'annonce
 *   que dix avis par déclaration).
 * - `recordingChanged` (Android 15+) : ce que l'écran montre AU DÉMARRAGE est
 *   déclaré sous l'unique `captureId` de l'enregistrement, puis la fenêtre est
 *   noire pour les éphémères jusqu'à la fin (`captureShield.noteRecording`) :
 *   rien de ce qui défile ensuite n'est capturé en silence. Une vue unique
 *   ouverte pendant l'enregistrement est noire ; sa tentative est déclarée à
 *   son ouverture.
 *
 * Chaque déclaration passe par la file durable (`capture-outbox.ts`) : un
 * échec se rejoue jusqu'au verdict de la passerelle.
 */

/** Ce que l'écran montre à l'instant de la capture. */
export type CaptureSubjects = {
  /** Les vues uniques affichées (`captureShield.shown()`) — des tentatives. */
  readonly viewOnce: readonly string[];
  /** Les rangées du fil vues, dans l'ordre du fil. Vide quand la fenêtre est noire. */
  readonly rows: readonly string[];
};

export type CaptureReporterDeps = {
  readonly coque: CoqueNative;
  readonly conversationId: string;
  readonly collect: () => CaptureSubjects;
  readonly outbox: Pick<CaptureOutbox, 'enqueue' | 'flush'>;
  readonly shield: Pick<CaptureShield, 'noteRecording' | 'watchShown' | 'shown'>;
  readonly newCaptureId: () => string;
};

type NativeState = { readonly recording?: unknown };

/** Les déclarations d'une capture : lots de dix, même `captureId`, l'accusé de lecture jusqu'à la rangée la plus récente. */
export function captureJobs(params: {
  readonly conversationId: string;
  readonly kind: ContentCaptureKind;
  readonly captureId: string;
  /** Le rang de la déclaration dans la capture (un enregistrement en fait plusieurs sous le même `captureId`). */
  readonly batch?: number;
  readonly subjects: CaptureSubjects;
}): readonly CaptureJobInput[] {
  const { conversationId, kind, captureId, batch = 0, subjects } = params;
  const readUpTo = subjects.rows.at(-1);
  return captureLots([...subjects.viewOnce, ...subjects.rows]).map((messageIds, index) => ({
    id: `${captureId}:${kind}:${batch}:${index}`,
    conversationId,
    messageIds,
    kind,
    captureId,
    ...(readUpTo === undefined ? {} : { readUpTo }),
  }));
}

/** Démarre l'écoute ; rend l'arrêt. Sans `addListener` (coque trop ancienne), ne fait rien. */
export function startCaptureReports(deps: CaptureReporterDeps): () => void {
  const { coque, conversationId, collect, outbox, shield, newCaptureId } = deps;
  const addListener = coque.addListener;
  if (typeof addListener !== 'function') return () => {};

  const report = (kind: ContentCaptureKind, captureId: string, subjects: CaptureSubjects, batch = 0) => {
    const jobs = captureJobs({ conversationId, kind, captureId, batch, subjects });
    if (jobs.length === 0) return;
    outbox.enqueue(jobs);
    void outbox.flush();
  };

  type Recording = { readonly captureId: string; readonly declared: ReadonlySet<string>; readonly batches: number; readonly stop: () => void };
  let recording: Recording | null = null;

  const declareNewAttempts = () => {
    const session = recording;
    if (session === null) return;
    const fresh = shield.shown().filter((id) => !session.declared.has(id));
    if (fresh.length === 0) return;
    recording = { ...session, declared: new Set([...session.declared, ...fresh]), batches: session.batches + 1 };
    report('recording', session.captureId, { viewOnce: fresh, rows: [] }, session.batches);
  };

  const recordingChanged = (now: boolean) => {
    if (now && recording === null) {
      const captureId = newCaptureId();
      const subjects = collect();
      shield.noteRecording(true);
      recording = {
        captureId,
        declared: new Set([...subjects.viewOnce, ...subjects.rows]),
        batches: 1,
        stop: shield.watchShown(declareNewAttempts),
      };
      report('recording', captureId, subjects);
      return;
    }
    if (!now && recording !== null) {
      recording.stop();
      recording = null;
      shield.noteRecording(false);
    }
  };

  const handles = [
    addListener(CAPTURE_SHIELD_PLUGIN, 'screenCaptured', () => report('screenshot', newCaptureId(), collect())),
    addListener(CAPTURE_SHIELD_PLUGIN, 'recordingChanged', (data) => recordingChanged((data as NativeState | null)?.recording === true)),
  ];

  let live = true;
  const nativePromise = coque.nativePromise;
  if (typeof nativePromise === 'function') {
    void nativePromise(CAPTURE_SHIELD_PLUGIN, 'getState', {})
      .then((state) => {
        if (live && (state as NativeState | null)?.recording === true) recordingChanged(true);
      })
      .catch(() => undefined);
  }
  void outbox.flush();

  return () => {
    live = false;
    recording?.stop();
    recording = null;
    handles.forEach((handle) => void handle.remove());
  };
}

/**
 * UNE DÉCLARATION, PAR REST — l'accusé de lecture jusqu'au plus récent
 * message déclaré part d'abord (la passerelle n'annonce que ce que l'acteur a
 * LU), puis `POST …/messages/capture`. Le registre du bouclier compte la
 * déclaration et les avis confirmés (`noticedMessageIds`). L'issue décide de
 * la file : succès ou refus permanent la retirent, le reste se rejoue.
 */
export async function sendCaptureJob(
  transport: Transport,
  shield: Pick<CaptureShield, 'noteDeclaration' | 'noteNotices'>,
  job: CaptureJob,
): Promise<Outcome> {
  if (job.readUpTo !== undefined) {
    const receipt = await transport({
      method: 'POST',
      path: conversationsEndpoints.byConversationIdReceipts(job.conversationId),
      body: { type: 'read', caughtUpToMessageId: job.readUpTo },
    }).catch(() => undefined);
    if (outcomeOf(receipt) === 'transient') return 'transient';
  }
  shield.noteDeclaration(job.conversationId);
  const result = await transport({
    method: 'POST',
    path: conversationsEndpoints.byIdMessagesCapture(job.conversationId),
    body: { messageIds: [...job.messageIds], kind: job.kind, captureId: job.captureId },
  }).catch(() => undefined);
  const outcome = outcomeOf(result);
  if (outcome === 'success') shield.noteNotices(job.conversationId, job.kind, noticedOf(result));
  return outcome;
}

function noticedOf(result: unknown): readonly string[] {
  const ids = (result as { readonly data?: { readonly noticedMessageIds?: unknown } } | null)?.data?.noticedMessageIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

type Rect = { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number };

/**
 * UNE RANGÉE VUE, PAS SEULEMENT MONTÉE — le virtualiseur monte des rangées
 * hors cadre (marge de défilement), et une couche (visionneuse, feuille, plein
 * écran d'une vue unique, racine rendue inerte) peut les recouvrir. Une
 * rangée compte si l'un de cinq points de sa surface visible tombe sur elle.
 */
export function rowIsSeen(row: Element, viewport: { readonly width: number; readonly height: number }, hit: (x: number, y: number) => Element | null): boolean {
  const rect: Rect = row.getBoundingClientRect();
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, viewport.height);
  const left = Math.max(rect.left, 0);
  const right = Math.min(rect.right, viewport.width);
  if (bottom <= top || right <= left) return false;
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  const points = [
    [x, y],
    [left + 1, top + 1],
    [right - 1, top + 1],
    [left + 1, bottom - 1],
    [right - 1, bottom - 1],
  ] as const;
  return points.some(([px, py]) => {
    const target = hit(px, py);
    return target !== null && row.contains(target);
  });
}

/**
 * Ce que l'écran montre : les vues uniques affichées, et — si la fenêtre n'est
 * pas noire — les rangées du fil annoncées et vues. Une fenêtre sous
 * `FLAG_SECURE` ne montre aucune flamme : la déclarer annoncerait une capture
 * qui n'a rien pris.
 */
export function visibleCaptureSubjects(doc: Document, shield: Pick<CaptureShield, 'shown' | 'secured'>): CaptureSubjects {
  const viewOnce = shield.shown();
  if (shield.secured()) return { viewOnce, rows: [] };
  const view = doc.defaultView;
  const viewport = { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 };
  const hit = (x: number, y: number) => doc.elementFromPoint(x, y);
  const rows = [...doc.querySelectorAll(`[data-row][${CAPTURE_ROW_ATTRIBUTE}="announced"]`)]
    .filter((row) => rowIsSeen(row, viewport, hit))
    .map((row) => row.getAttribute('data-row'))
    .filter((id): id is string => id !== null && id !== '');
  return { viewOnce, rows };
}

/** Un identifiant de capture : 8 à 64 caractères `[A-Za-z0-9_-]`. */
export function newCaptureId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random !== undefined) return random;
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
