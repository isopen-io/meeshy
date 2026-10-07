import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import { CONTENT_CAPTURE_MAX_MESSAGES, type ContentCaptureKind } from '@meeshy/shared/types/content-capture-kinds';

import type { CoqueNative } from '@/lib/native-shell';
import { pushReadReceipt } from '@/lib/api/receipts';
import type { Transport } from '@/lib/net/transport';
import { CAPTURE_ROW_ATTRIBUTE } from '@/lib/view/content-exit';

import { CAPTURE_SHIELD_PLUGIN } from './capture-shield';

/**
 * LA CAPTURE DÉTECTÉE PAR LA COQUE ANDROID S'ANNONCE AU FIL (#9617) — chargé à
 * la demande, dans la coque seulement (`use-screen-capture-reports.ts`).
 *
 * - `screenCaptured` (Android 14+) : une capture, un `captureId` neuf.
 * - `recordingChanged` (Android 15+) : un enregistrement ou une recopie garde
 *   UN `captureId` du début à la fin ; ce qui entre à l'écran pendant qu'il
 *   dure se déclare au plus toutes les {@link RECORDING_SWEEP_MS} (la
 *   passerelle accepte six déclarations par minute et par conversation), et un
 *   message déjà déclaré pour cet enregistrement ne repart pas.
 *
 * Ce qui part : les rangées du fil qui portent `data-capture` (`captureOf`,
 * éphémère lisible ou nature illisible) ET qu'on voit vraiment à l'instant de
 * la capture, plus les vues uniques affichées (`captureShield.shown()`). La
 * passerelle juge chaque message (droit de lecture, nature, affichage récent)
 * et n'annonce que ce qui doit l'être.
 */

export const RECORDING_SWEEP_MS = 10_000;

export type CaptureDeclaration = {
  readonly conversationId: string;
  readonly messageIds: readonly string[];
  readonly kind: ContentCaptureKind;
  readonly captureId: string;
  /**
   * Le plus récent des messages du fil déclarés : la passerelle n'annonce que
   * ce que l'acteur a LU, et ce qui est à l'écran est lu — l'accusé de lecture
   * part jusqu'à lui AVANT la déclaration. Absent : seules des vues uniques.
   */
  readonly readUpTo?: string;
};

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
  /** Les messages visibles à cet instant. */
  readonly collect: () => CaptureSubjects;
  readonly send: (declaration: CaptureDeclaration) => Promise<unknown>;
  readonly newCaptureId: () => string;
  readonly every: (run: () => void, ms: number) => () => void;
};

type NativeState = { readonly recording?: unknown };

/** Démarre l'écoute ; rend l'arrêt. Sans `addListener` (coque trop ancienne), ne fait rien. */
export function startCaptureReports(deps: CaptureReporterDeps): () => void {
  const { coque, conversationId, collect, send, newCaptureId, every } = deps;
  const addListener = coque.addListener;
  if (typeof addListener !== 'function') return () => {};

  const report = (kind: ContentCaptureKind, captureId: string, subjects: CaptureSubjects) => {
    const messageIds = [...new Set([...subjects.viewOnce, ...subjects.rows])].slice(0, CONTENT_CAPTURE_MAX_MESSAGES);
    if (messageIds.length === 0) return;
    const readUpTo = subjects.rows.at(-1);
    void send({ conversationId, messageIds, kind, captureId, ...(readUpTo === undefined ? {} : { readUpTo }) }).catch(() => undefined);
  };

  type Recording = { readonly captureId: string; readonly declared: ReadonlySet<string>; readonly stop: () => void };
  let recording: Recording | null = null;

  const sweep = () => {
    const session = recording;
    if (session === null) return;
    const seen = collect();
    const fresh = { viewOnce: seen.viewOnce.filter((id) => !session.declared.has(id)), rows: seen.rows.filter((id) => !session.declared.has(id)) };
    if (fresh.viewOnce.length + fresh.rows.length === 0) return;
    recording = { ...session, declared: new Set([...session.declared, ...fresh.viewOnce, ...fresh.rows]) };
    report('recording', session.captureId, fresh);
  };

  const recordingChanged = (now: boolean) => {
    if (now && recording === null) {
      recording = { captureId: newCaptureId(), declared: new Set(), stop: every(sweep, RECORDING_SWEEP_MS) };
      sweep();
      return;
    }
    if (!now && recording !== null) {
      recording.stop();
      recording = null;
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

  return () => {
    live = false;
    recordingChanged(false);
    handles.forEach((handle) => void handle.remove());
  };
}

/**
 * Le jumeau REST de `message:capture-detected` — la conversation est dans
 * l'adresse. L'accusé de lecture jusqu'au plus récent message déclaré part
 * d'abord ; un refus de l'un ou de l'autre ne se réessaie pas (la passerelle
 * plafonne, et une capture passée ne se rejoue pas).
 */
export async function sendCaptureDeclaration(transport: Transport, declaration: CaptureDeclaration): Promise<unknown> {
  if (declaration.readUpTo !== undefined) {
    await pushReadReceipt(transport, declaration.conversationId, declaration.readUpTo).catch(() => undefined);
  }
  return transport({
    method: 'POST',
    path: conversationsEndpoints.byIdMessagesCapture(declaration.conversationId),
    body: { messageIds: [...declaration.messageIds], kind: declaration.kind, captureId: declaration.captureId },
  });
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
export function visibleCaptureSubjects(doc: Document, shield: { readonly shown: () => readonly string[]; readonly secured: () => boolean }): CaptureSubjects {
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
