import type { ContentCaptureKind } from '@meeshy/shared/types/content-capture-kinds';

import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

import { EMPTY_LEDGER, captureCapacity, unannounced, withDeclaration, withNotices, type CaptureLedger } from './capture-ledger';
import { detectionOf, windowMustBeBlack, type CaptureDetection, type CaptureHost } from './capture-policy';

/**
 * LE BOUCLIER DE CAPTURE (#9574, #9617 — décision porteur du 2026-10-07 :
 * « vue unique : capture et enregistrement d'écran NOIRS » ; règle de revue :
 * « un contenu qui disparaît est soit annoncé, soit noir »).
 *
 * Dans la coque Android, `MeeshyScreenGuard.setSecure` pose `FLAG_SECURE` sur
 * la fenêtre de l'activité : capture, enregistrement, recopie et vignette des
 * applications récentes rendent du noir. La page est le SEUL site de l'état :
 * la coque ne fait que l'appliquer, et le retire quand le document recharge.
 * La fenêtre est noire (`windowMustBeBlack`) :
 * - tant qu'au moins une surface tient le noir — un COMPTE d'affichages
 *   (`hold` / `release`), jamais un booléen qu'un démontage remettrait à faux
 *   pendant qu'une autre surface montre encore la sienne ;
 * - ou tant qu'un éphémère annonçable (`candidate`) est à l'écran alors que
 *   son annonce ne peut pas partir : hors ligne, enregistrement en cours,
 *   budget de la passerelle épuisé (`capture-ledger.ts`).
 *
 * FERMÉ PAR DÉFAUT : dans une coque dont le pont manque (construite avant lui)
 * ou refuse, `ready` rend `false` et la vue unique ne s'affiche pas en clair.
 * Hors coque (navigateur), aucun pont n'est attendu : `ready` rend `true` —
 * un navigateur ne sait ni noircir ni détecter une capture (D-179).
 *
 * Le registre sert aussi la DÉTECTION : `shown()` liste les vues uniques à
 * l'écran, celles qu'une capture déclare comme tentatives
 * (`screen-capture-reports.ts`).
 */

export const CAPTURE_SHIELD_PLUGIN = 'MeeshyScreenGuard';

export type CaptureShieldMode = 'browser' | 'guarded' | 'unguarded';

export type CaptureShieldLease = {
  /** `true` quand l'affichage en clair est permis — `FLAG_SECURE` posé, ou navigateur. */
  readonly ready: Promise<boolean>;
  /** Idempotent : un démontage rejoué ne retire pas l'affichage d'une autre surface. */
  readonly release: () => void;
};

export type CaptureShieldOrigin = 'display' | 'row';

export type CaptureShield = {
  readonly mode: () => CaptureShieldMode;
  /**
   * `display` : la vue unique est affichée, une capture la déclare comme
   * tentative. `row` : une surface noire pour une autre raison (nature
   * illisible, détection insuffisante, surface non déclarée).
   */
  readonly hold: (messageId: string, origin?: CaptureShieldOrigin) => CaptureShieldLease;
  /** Un éphémère d'une rangée DÉCLARÉE, à l'écran : épargné tant que son annonce peut partir. Rend le retrait. */
  readonly candidate: (messageId: string, conversationId: string) => () => void;
  readonly shown: () => readonly string[];
  /** `FLAG_SECURE` est-il demandé ? Alors la fenêtre est noire : seules les vues uniques se déclarent (tentatives). */
  readonly secured: () => boolean;
  /** L'hôte et ce que la coque détecte — `detection: null` tant qu'elle n'a pas répondu (fermé). */
  readonly host: () => CaptureHost;
  /** Demande à la coque ce qu'elle détecte (une fois) ; prévient chaque abonné à la réponse. */
  readonly watchHost: (listener: () => void) => () => void;
  /** Prévient quand l'ensemble des vues uniques affichées change. */
  readonly watchShown: (listener: () => void) => () => void;
  readonly noteRecording: (recording: boolean) => void;
  readonly noteOnline: (online: boolean) => void;
  readonly noteDeclaration: (conversationId: string) => void;
  readonly noteNotices: (conversationId: string, kind: ContentCaptureKind, messageIds: readonly string[]) => void;
};

const isShell = (coque: CoqueNative | undefined): boolean => {
  const platform = coque?.getPlatform?.();
  return platform !== undefined && platform !== 'web';
};

type Holder = { readonly token: symbol; readonly messageId: string; readonly origin: CaptureShieldOrigin };
type Candidate = { readonly token: symbol; readonly messageId: string; readonly conversationId: string };

export type CaptureShieldEnv = {
  readonly now: () => number;
  readonly online: () => boolean;
  /** Écoute les passages en ligne / hors ligne ; rend l'arrêt. */
  readonly watchOnline: (listener: (online: boolean) => void) => () => void;
};

const browserEnv: CaptureShieldEnv = {
  now: () => Date.now(),
  online: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  watchOnline: (listener) => {
    if (typeof window === 'undefined') return () => {};
    const up = () => listener(true);
    const down = () => listener(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  },
};

export function createCaptureShield(coqueOf: () => CoqueNative | undefined, env: CaptureShieldEnv = browserEnv): CaptureShield {
  let holders: readonly Holder[] = [];
  let candidates: readonly Candidate[] = [];
  let ledgers: ReadonlyMap<string, CaptureLedger> = new Map();
  let recording = false;
  let online = env.online();
  let onlineWatched = false;
  let applied = false;
  let securing: Promise<boolean> = Promise.resolve(true);
  /** La réponse de LA coque interrogée — une autre coque (rechargement, témoin) repart fermée. */
  let detection: { readonly coque: CoqueNative | undefined; readonly value: CaptureDetection | null } | null = null;
  let askedOf: CoqueNative | undefined | null = null;
  let hostWatchers: readonly (() => void)[] = [];
  let shownWatchers: readonly (() => void)[] = [];

  const setSecure = () => appelNatifMethode(coqueOf(), CAPTURE_SHIELD_PLUGIN, 'setSecure');

  const mode = (): CaptureShieldMode => {
    const coque = coqueOf();
    if (!isShell(coque)) return 'browser';
    return setSecure() === null ? 'unguarded' : 'guarded';
  };

  const apply = (secure: boolean): Promise<boolean> => {
    const call = setSecure();
    if (call === null) return Promise.resolve(false);
    return call({ secure }).then(
      () => true,
      () => false,
    );
  };

  const ledgerOf = (conversationId: string): CaptureLedger => ledgers.get(conversationId) ?? EMPTY_LEDGER;

  const desired = (): boolean => {
    const now = env.now();
    const conversations = [...new Set(candidates.map((item) => item.conversationId))];
    return windowMustBeBlack({
      blocking: holders.length > 0,
      online,
      recording,
      ephemerals: conversations.map((conversationId) => {
        const ids = candidates.filter((item) => item.conversationId === conversationId).map((item) => item.messageId);
        return {
          pending: unannounced(ledgerOf(conversationId), 'screenshot', ids).length,
          capacity: captureCapacity(ledgerOf(conversationId), now),
        };
      }),
    });
  };

  const sync = () => {
    if (mode() !== 'guarded') return;
    if (!onlineWatched) {
      onlineWatched = true;
      env.watchOnline((now) => {
        online = now;
        sync();
      });
    }
    const want = desired();
    if (want === applied) return;
    applied = want;
    const call = apply(want);
    if (want) securing = call;
  };

  const tellShown = () => shownWatchers.forEach((watcher) => watcher());

  const hold = (messageId: string, origin: CaptureShieldOrigin = 'display'): CaptureShieldLease => {
    const token = Symbol(messageId);
    const current = mode();
    holders = [...holders, { token, messageId, origin }];
    sync();
    if (origin === 'display') tellShown();
    const ready = current === 'browser' ? Promise.resolve(true) : current === 'unguarded' ? Promise.resolve(false) : securing;
    const release = () => {
      if (!holders.some((holder) => holder.token === token)) return;
      holders = holders.filter((holder) => holder.token !== token);
      sync();
      if (origin === 'display') tellShown();
    };
    return { ready, release };
  };

  const candidate = (messageId: string, conversationId: string): (() => void) => {
    const token = Symbol(messageId);
    candidates = [...candidates, { token, messageId, conversationId }];
    sync();
    return () => {
      if (!candidates.some((item) => item.token === token)) return;
      candidates = candidates.filter((item) => item.token !== token);
      sync();
    };
  };

  const shown = (): readonly string[] => [
    ...new Set(holders.filter((holder) => holder.origin === 'display').map((holder) => holder.messageId)),
  ];

  const secured = (): boolean => mode() === 'guarded' && applied;

  const host = (): CaptureHost => {
    if (mode() === 'browser') return { kind: 'browser' };
    return { kind: 'shell', detection: detection !== null && detection.coque === coqueOf() ? detection.value : null };
  };

  const ask = () => {
    const coque = coqueOf();
    const getState = appelNatifMethode(coque, CAPTURE_SHIELD_PLUGIN, 'getState');
    if (askedOf === coque || getState === null) return;
    askedOf = coque;
    void getState({})
      .then((state) => {
        detection = { coque, value: detectionOf(state) };
        recording = (state as { readonly recording?: unknown } | null)?.recording === true;
        sync();
        hostWatchers.forEach((watcher) => watcher());
      })
      .catch(() => undefined);
  };

  const watchHost = (listener: () => void): (() => void) => {
    hostWatchers = [...hostWatchers, listener];
    ask();
    return () => {
      hostWatchers = hostWatchers.filter((watcher) => watcher !== listener);
    };
  };

  const watchShown = (listener: () => void): (() => void) => {
    shownWatchers = [...shownWatchers, listener];
    return () => {
      shownWatchers = shownWatchers.filter((watcher) => watcher !== listener);
    };
  };

  const updateLedger = (conversationId: string, next: (ledger: CaptureLedger) => CaptureLedger) => {
    ledgers = new Map([...ledgers, [conversationId, next(ledgerOf(conversationId))]]);
    sync();
  };

  return {
    mode,
    hold,
    candidate,
    shown,
    secured,
    host,
    watchHost,
    watchShown,
    noteRecording: (now) => {
      recording = now;
      sync();
    },
    noteOnline: (now) => {
      online = now;
      sync();
    },
    noteDeclaration: (conversationId) => updateLedger(conversationId, (ledger) => withDeclaration(ledger, env.now())),
    noteNotices: (conversationId, kind, messageIds) =>
      updateLedger(conversationId, (ledger) => withNotices(ledger, kind, messageIds, env.now())),
  };
}

export const captureShield: CaptureShield = createCaptureShield(coqueCourante);
