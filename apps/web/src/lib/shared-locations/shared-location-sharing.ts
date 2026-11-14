import type { SharedLocationDurationMinutes, SharedLocationPrecision } from '@meeshy/shared/types/shared-location-constants';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { SafeStorage } from '@/lib/storage';

import { decodeSharedLocationRoster, encodeSharedLocationRoster, EMPTY_ROSTER, rosterOps, type SharedLocationRoster, type SharedLocationRosterEntry } from './shared-location-roster';
import {
  sharedLocationStartPayloadOf,
  shouldSendSharedLocation,
  type SharedLocationFix,
  type SharedLocationSendOutcome,
  type SharedLocationSent,
  type SharedLocationStartPayload,
  type SharedLocationVerdict,
} from './shared-location-sending';

/**
 * **MON PARTAGE DE POSITION EN COURS, SUR CET ONGLET** (#18345, iso
 * `apps/ios/.../SharedLocation/SharedLocationSharingCenter.swift`), UN par compte
 * connecté : la liste des personnes, l'émission, le suivi de la position et les
 * échéances. Le serveur garde la position complète, scellée, et la tronque pour chaque
 * personne ; ce centre ne floute rien et ne décide d'aucun droit — la passerelle rejuge
 * la loi à chaque envoi.
 *
 * Trois lois de révocation (#18166) :
 * - UN verrou sérialise démarrages, arrêts, échéances et mises à jour : une mise à jour
 *   en vol ne peut pas effacer un partage que le démarrage suivant vient de poser ;
 * - une réponse arrivée après que le compte a quitté l'onglet (`abandon()`, ou un autre
 *   compte connecté) n'adopte rien, n'écrit rien et ne rallume rien ;
 * - dans le doute, on ARRÊTE : sans relevé pour republier une liste réduite, tout le
 *   partage s'arrête ; un accusé perdu garde « Arrêter » pour chaque personne que le
 *   serveur peut servir ; une échéance qui n'a pas pu se solder est rejouée, et à chaque
 *   socket accrochée.
 */

export type SharedLocationFixResult = { readonly kind: 'fix'; readonly fix: SharedLocationFix } | { readonly kind: 'denied' } | { readonly kind: 'unavailable' };

/** La source des relevés : le navigateur (`shared-location-geolocation.ts`), un témoin la simule. */
export type SharedLocationFixSource = {
  /** Un relevé, demandant la permission « pendant l'utilisation » si elle n'a pas encore été donnée. */
  currentFix(): Promise<SharedLocationFixResult>;
  /** Suit la position ; rend de quoi cesser. */
  follow(onFix: (fix: SharedLocationFix) => void): () => void;
};

/** Le fil : `location:share-start` / `share-update` / `share-stop`. `stop` rend vrai quand le serveur a accusé l'arrêt. */
export type SharedLocationEmitter = {
  start(payload: SharedLocationStartPayload): Promise<SharedLocationVerdict>;
  update(fix: SharedLocationFix): Promise<SharedLocationVerdict>;
  stop(): Promise<boolean>;
};

export type SharedLocationShareProblem = 'location-denied' | 'location-unavailable' | SharedLocationSendOutcome;

export type SharedLocationSharingState = { readonly roster: SharedLocationRoster; readonly busy: boolean };

export type SharedLocationSharingCenter = {
  readonly store: StoreApi<SharedLocationSharingState>;
  entry(userId: string): SharedLocationRosterEntry | null;
  /** La ligne de la fiche reste tant qu'un partage court vers cette personne, même sous Ami : « Arrêter » ne disparaît jamais avant le partage. */
  showsRow(userId: string, offered: boolean): boolean;
  /** `null` : c'est parti. */
  share(request: { readonly userId: string; readonly precision: SharedLocationPrecision; readonly durationMinutes: SharedLocationDurationMinutes }): Promise<SharedLocationShareProblem | null>;
  stopSharing(userId: string): Promise<SharedLocationShareProblem | null>;
  /** Une échéance est passée, ou la socket vient de s'accrocher : solder ce qui doit l'être. */
  reconcile(): Promise<void>;
  abandon(): void;
};

/** Une échéance qui n'a pas pu se solder (hors ligne, refus) est rejouée à ce rythme, et à chaque socket accrochée. */
export const SHARED_LOCATION_RETRY_MS = 30_000;
/** Une seconde après l'échéance, pour que la personne soit bien sortie de la liste élaguée. */
const DEADLINE_SLACK_MS = 1_000;

/** Un verrou d'ordre d'arrivée : celui qui le tient le passe au premier qui attend. */
function createSerialGate() {
  let held = false;
  const waiting: Array<() => void> = [];
  return {
    tryEnter: (): boolean => {
      if (held) return false;
      held = true;
      return true;
    },
    enter: (): Promise<void> => {
      if (!held) {
        held = true;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => waiting.push(resolve));
    },
    leave: (): void => {
      const next = waiting.shift();
      if (next === undefined) held = false;
      else next();
    },
  };
}

export function createSharedLocationSharingCenter({
  emitter,
  fixes,
  storage,
  storageKey,
  now = Date.now,
  schedule,
  owner,
  currentAccount,
}: {
  readonly emitter: SharedLocationEmitter;
  readonly fixes: SharedLocationFixSource;
  readonly storage: SafeStorage;
  readonly storageKey: string;
  readonly now?: () => number;
  readonly schedule: (delayMs: number, run: () => void) => () => void;
  readonly owner: string;
  readonly currentAccount: () => string | null;
}): SharedLocationSharingCenter {
  const restored = decodeSharedLocationRoster(storage.getItem(storageKey));
  const store = createStore<SharedLocationSharingState>(() => ({ roster: restored, busy: false }));
  const gate = createSerialGate();
  let abandoned = false;
  let lastSent: SharedLocationSent | null = null;
  let unfollow: (() => void) | null = null;
  let cancelDeadline: (() => void) | null = null;

  const roster = (): SharedLocationRoster => store.getState().roster;
  /* Le centre n'agit que pour le compte qui l'a créé, et tant qu'il est connecté : la socket appartient au compte courant. */
  const isLive = (): boolean => !abandoned && owner !== '' && currentAccount() === owner;

  const adopt = (next: SharedLocationRoster): void => {
    store.setState({ roster: next });
    if (rosterOps.isEmpty(next)) storage.removeItem(storageKey);
    else storage.setItem(storageKey, encodeSharedLocationRoster(next));
  };

  const stopFollowing = (): void => {
    unfollow?.();
    unfollow = null;
  };

  const disarm = (): void => {
    cancelDeadline?.();
    cancelDeadline = null;
  };

  const wipe = (): void => {
    adopt(EMPTY_ROSTER);
    lastSent = null;
    disarm();
    stopFollowing();
  };

  /* Le minuteur ne fait que réveiller : la réconciliation tourne à part, pour qu'un nouveau minuteur ne l'annule pas. */
  const arm = (delayMs: number): void => {
    disarm();
    cancelDeadline = schedule(delayMs, () => void center.reconcile());
  };

  const scheduleDeadline = (): void => {
    const at = rosterOps.nextDeadline(roster());
    if (at === null) return disarm();
    arm(Math.max(0, at - now()) + DEADLINE_SLACK_MS);
  };

  const didMove = async (fix: SharedLocationFix): Promise<void> => {
    if (!gate.tryEnter()) return;
    try {
      if (!isLive() || rosterOps.isEmpty(roster()) || !shouldSendSharedLocation(fix, now(), lastSent)) return;
      lastSent = { fix, at: now() };
      const verdict = await emitter.update(fix);
      if (isLive() && verdict.kind === 'refused' && verdict.outcome === 'not-sharing') wipe();
    } finally {
      gate.leave();
    }
  };

  const startFollowing = (): void => {
    if (unfollow !== null) return;
    unfollow = fixes.follow((fix) => void didMove(fix));
  };

  const engage = (next: SharedLocationRoster, fix: SharedLocationFix): void => {
    adopt(next);
    lastSent = { fix, at: now() };
    startFollowing();
    scheduleDeadline();
  };

  const publish = async (next: SharedLocationRoster, fix: SharedLocationFix, previous: SharedLocationRoster): Promise<SharedLocationShareProblem | null> => {
    const payload = sharedLocationStartPayloadOf({ recipients: rosterOps.recipients(next), durationMinutes: rosterOps.serverDurationMinutes(next, now()), fix });
    if (payload === null) return 'invalid';
    if (!isLive()) return 'failed';
    const verdict = await emitter.start(payload);
    if (!isLive()) return 'failed';
    if (verdict.kind === 'started') {
      engage(next, fix);
      return null;
    }
    if (verdict.outcome === 'unconfirmed') engage(rosterOps.union(previous, next), fix);
    return verdict.outcome;
  };

  const stopAll = async (): Promise<SharedLocationShareProblem | null> => {
    if (!isLive()) return 'failed';
    const stopped = await emitter.stop();
    if (!isLive()) return 'failed';
    if (!stopped) return 'offline';
    wipe();
    return null;
  };

  /* Redémarrer avec une liste réduite demande une position : la dernière envoyée, sinon celle de l'appareil. Sans l'une ni l'autre, TOUT s'arrête. */
  const republish = async (next: SharedLocationRoster): Promise<SharedLocationShareProblem | null> => {
    if (rosterOps.isEmpty(next)) return stopAll();
    if (lastSent !== null) return publish(next, lastSent.fix, roster());
    const current = await fixes.currentFix();
    if (current.kind !== 'fix') return stopAll();
    if (!isLive()) return 'failed';
    return publish(next, current.fix, roster());
  };

  const locked = async (operation: () => Promise<SharedLocationShareProblem | null>): Promise<SharedLocationShareProblem | null> => {
    await gate.enter();
    try {
      if (!isLive()) return 'failed';
      store.setState({ busy: true });
      return await operation();
    } finally {
      store.setState({ busy: false });
      gate.leave();
    }
  };

  const center: SharedLocationSharingCenter = {
    store,
    entry: (userId) => rosterOps.entry(rosterOps.pruned(roster(), now()), userId),
    showsRow: (userId, offered) => offered || center.entry(userId) !== null,
    share: ({ userId, precision, durationMinutes }) =>
      locked(async () => {
        const current = await fixes.currentFix();
        if (current.kind === 'denied') return 'location-denied';
        if (current.kind === 'unavailable') return 'location-unavailable';
        if (!isLive()) return 'failed';
        const previous = roster();
        const next = rosterOps.adding(rosterOps.pruned(previous, now()), { userId, precision, durationMinutes, now: now() });
        return publish(next, current.fix, previous);
      }),
    stopSharing: (userId) => locked(() => republish(rosterOps.removing(rosterOps.pruned(roster(), now()), userId))),
    reconcile: async () => {
      await locked(async () => {
        const pruned = rosterOps.pruned(roster(), now());
        if (Object.keys(pruned).length === Object.keys(roster()).length) return null;
        const problem = await republish(pruned);
        if (problem !== null && isLive()) arm(SHARED_LOCATION_RETRY_MS);
        return problem;
      });
    },
    abandon: () => {
      abandoned = true;
      disarm();
      stopFollowing();
    },
  };

  /* Une liste gardée d'un chargement précédent reprend : le partage serveur court toujours jusqu'à son terme, et « Arrêter » doit rester à un geste. */
  if (!rosterOps.isEmpty(restored) && isLive()) {
    startFollowing();
    scheduleDeadline();
  }
  return center;
}
