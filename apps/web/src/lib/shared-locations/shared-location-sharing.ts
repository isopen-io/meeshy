import type { SharedLocationDurationMinutes, SharedLocationPrecision } from '@meeshy/shared/types/shared-location-constants';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { SafeStorage } from '@/lib/storage';

import {
  decodeSharedLocationRoster,
  encodeSharedLocationRoster,
  encodeSharedLocationWithdrawals,
  sharedLocationWithdrawalsKey,
  EMPTY_ROSTER, rosterOps, type SharedLocationRoster, type SharedLocationRosterEntry } from './shared-location-roster';
import {
  SHARED_LOCATION_UPDATE_GATE,
  sharedLocationPayloadWithoutDeadlines,
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
 *
 * Un « Arrêter » qui n'a pas pu partir devient un RETRAIT EN ATTENTE (#18388, iso #18204) :
 * la personne sort de la liste, son identifiant est gardé (au plus 8 h) et rejoué toutes
 * les 30 s et à chaque socket accrochée ; aucune mise à jour de position ne part tant
 * qu'il attend, le serveur servant peut-être encore la personne retirée.
 */

export type SharedLocationFixResult = { readonly kind: 'fix'; readonly fix: SharedLocationFix } | { readonly kind: 'denied' } | { readonly kind: 'unavailable' };

/** La source des relevés : le navigateur (`shared-location-geolocation.ts`), un témoin la simule. */
export type SharedLocationFixSource = {
  /** La permission est-elle DÉJÀ accordée ? Sans geste de l'utilisateur, on ne demande jamais : on s'abstient (et dans le doute, on arrête). */
  isGranted(): Promise<boolean>;
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

/** `withdrawal-pending` : « Arrêter » n'a pas pu partir, le centre le rejouera dès le retour du réseau. */
export type SharedLocationShareProblem = 'location-denied' | 'location-unavailable' | 'withdrawal-pending' | SharedLocationSendOutcome;

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
  /** Relit la liste gardée : un autre onglet du même compte a pu la changer. */
  refresh(): void;
  abandon(): void;
};

/** Une échéance qui n'a pas pu se solder (hors ligne, refus) est rejouée à ce rythme, et à chaque socket accrochée. */
export const SHARED_LOCATION_RETRY_MS = 30_000;
/** Une seconde après l'échéance, pour que la personne soit bien sortie de la liste élaguée. */
const DEADLINE_SLACK_MS = 1_000;
/** Au-delà, `setTimeout` se déclenche aussitôt : on se réveille au plus tard à ce terme, et on réarme. */
const MAX_TIMER_MS = 2_147_483_647;
/** Un retrait qui échoue pour l'une de ces raisons attend le réseau ; refusé pour toute autre, on arrête tout plutôt que laisser la personne servie. */
const WITHDRAWAL_WAITS_ON: ReadonlySet<SharedLocationShareProblem> = new Set(['offline', 'unconfirmed']);

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
  const withdrawalsKey = sharedLocationWithdrawalsKey(storageKey);
  const load = (): SharedLocationRoster => decodeSharedLocationRoster(storage.getItem(storageKey), storage.getItem(withdrawalsKey));
  const restored = load();
  const store = createStore<SharedLocationSharingState>(() => ({ roster: restored, busy: false }));
  const gate = createSerialGate();
  let abandoned = false;
  let lastSent: SharedLocationSent | null = null;
  let unfollow: (() => void) | null = null;
  let cancelDeadline: (() => void) | null = null;

  const roster = (): SharedLocationRoster => store.getState().roster;
  /* Le centre n'agit que pour le compte qui l'a créé, et tant qu'il est connecté : la socket appartient au compte courant. */
  const isLive = (): boolean => !abandoned && owner !== '' && currentAccount() === owner;

  /*
   * Une écriture refusée (quota, stockage bloqué) ne casse pas la révocation : la liste reste en mémoire, le minuteur
   * tient, et la liste gardée — désormais en retard — n'est plus relue tant qu'une écriture n'a pas repris.
   */
  let storageBehind = false;
  const persist = (next: SharedLocationRoster): void => {
    const withdrawals = encodeSharedLocationWithdrawals(next);
    try {
      if (rosterOps.hasRecipients(next)) storage.setItem(storageKey, encodeSharedLocationRoster(next));
      else storage.removeItem(storageKey);
      if (withdrawals === null) storage.removeItem(withdrawalsKey);
      else storage.setItem(withdrawalsKey, withdrawals);
      storageBehind = false;
    } catch {
      storageBehind = true;
    }
  };

  const adopt = (next: SharedLocationRoster): void => {
    store.setState({ roster: next });
    persist(next);
  };

  /* La liste gardée fait foi : un autre onglet du même compte a pu arrêter ou ajouter quelqu'un. */
  const reread = (): void => {
    if (storageBehind) return;
    const kept = load();
    if (rosterOps.equals(kept, roster())) return;
    store.setState({ roster: kept });
    if (!rosterOps.hasRecipients(kept)) {
      lastSent = null;
      stopFollowing();
    }
    scheduleDeadline();
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

  /* L'échéance la plus proche réveille le centre ; un retrait en attente le réveille au rythme du rejeu, au plus tard. */
  const scheduleDeadline = (): void => {
    const at = rosterOps.nextDeadline(roster());
    const untilDeadline = at === null ? null : Math.min(MAX_TIMER_MS, Math.max(0, at - now()) + DEADLINE_SLACK_MS);
    const untilRetry = rosterOps.hasPendingWithdrawals(roster()) ? SHARED_LOCATION_RETRY_MS : null;
    const delays = [untilDeadline, untilRetry].filter((delay): delay is number => delay !== null);
    if (delays.length === 0) return disarm();
    arm(Math.min(...delays));
  };

  const didMove = async (fix: SharedLocationFix): Promise<void> => {
    if (!gate.tryEnter()) return;
    try {
      const current = roster();
      if (!isLive() || !rosterOps.hasRecipients(current) || rosterOps.hasPendingWithdrawals(current) || !shouldSendSharedLocation(fix, now(), lastSent)) return;
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

  /*
   * Un autre onglet du même compte a pu mettre une personne en retrait PENDANT que ce démarrage attendait son accusé :
   * la liste servie la contient encore. Le retrait gagne (dans le doute, on arrête) et se rejoue aussitôt.
   */
  const withKeptWithdrawals = (next: SharedLocationRoster): SharedLocationRoster =>
    Object.entries((storageBehind ? EMPTY_ROSTER : load()).withdrawals)
      .filter(([id]) => rosterOps.entry(next, id) !== null)
      .reduce((folded, [id, until]) => rosterOps.union(rosterOps.withdrawing(folded, id, now()), { entries: {}, withdrawals: { [id]: until } }), next);

  const engage = (served: SharedLocationRoster, fix: SharedLocationFix): void => {
    const next = withKeptWithdrawals(served);
    adopt(next);
    lastSent = { fix, at: now() };
    if (rosterOps.hasRecipients(next)) startFollowing();
    else stopFollowing();
    if (rosterOps.equals(next, served)) scheduleDeadline();
    else arm(0);
  };

  /* Une passerelle d'avant #18205 refuse l'échéance par personne : la même liste repart sans, et l'onglet retire chacun à son échéance, comme avant. */
  const startTolerant = async (payload: SharedLocationStartPayload): Promise<SharedLocationVerdict> => {
    const verdict = await emitter.start(payload);
    const legacy = verdict.kind === 'refused' && verdict.outcome === 'invalid' ? sharedLocationPayloadWithoutDeadlines(payload) : null;
    return legacy === null || !isLive() ? verdict : emitter.start(legacy);
  };

  /* La liste envoyée solde tous les retraits en attente : c'est elle que le serveur sert dès qu'il l'accepte. */
  const publish = async (wanted: SharedLocationRoster, fix: SharedLocationFix, previous: SharedLocationRoster): Promise<SharedLocationShareProblem | null> => {
    const next = rosterOps.settled(wanted);
    const payload = sharedLocationStartPayloadOf({ recipients: rosterOps.deadlinedRecipients(next, now()), durationMinutes: rosterOps.serverDurationMinutes(next, now()), fix });
    if (payload === null) return 'invalid';
    if (!isLive()) return 'failed';
    /* Avant l'accusé, la liste gardée couvre les deux : un onglet fermé pendant l'attente garde « Arrêter » pour chacun. */
    persist(rosterOps.union(previous, next));
    const verdict = await startTolerant(payload);
    if (!isLive()) return 'failed';
    if (verdict.kind === 'started') {
      engage(next, fix);
      return null;
    }
    if (verdict.outcome === 'unconfirmed') engage(rosterOps.union(previous, next), fix);
    else persist(roster());
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
  const republish = async (wanted: SharedLocationRoster): Promise<SharedLocationShareProblem | null> => {
    if (!rosterOps.hasRecipients(wanted)) return stopAll();
    const fix = freshLastFix() ?? (await silentFix());
    if (fix === null) return stopAll();
    if (!isLive()) return 'failed';
    return publish(wanted, fix, roster());
  };

  /* La dernière position envoyée, tant qu'elle a l'âge d'un battement : au-delà, la republier la ferait passer pour fraîche. */
  const freshLastFix = (): SharedLocationFix | null =>
    lastSent !== null && now() - lastSent.at <= SHARED_LOCATION_UPDATE_GATE.heartbeatMs ? lastSent.fix : null;

  /* Un retrait refusé pour autre chose que le réseau (débit, liste invalide) ne se rejoue pas des heures : on ARRÊTE tout. */
  const withdrawingRepublish = async (wanted: SharedLocationRoster): Promise<SharedLocationShareProblem | null> => {
    const problem = await republish(wanted);
    if (problem === null || !isLive() || WITHDRAWAL_WAITS_ON.has(problem)) return problem;
    return stopAll();
  };

  /* Un relevé SANS demande de permission : un retrait ou une échéance ne fait jamais surgir la demande du navigateur. */
  const silentFix = async (): Promise<SharedLocationFix | null> => {
    if (!(await fixes.isGranted())) return null;
    const current = await fixes.currentFix();
    return current.kind === 'fix' ? current.fix : null;
  };

  const locked = async (operation: () => Promise<SharedLocationShareProblem | null>): Promise<SharedLocationShareProblem | null> => {
    await gate.enter();
    try {
      if (!isLive()) return 'failed';
      reread();
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
    stopSharing: (userId) =>
      locked(async () => {
        const problem = await withdrawingRepublish(rosterOps.removing(rosterOps.pruned(roster(), now()), userId));
        if (problem === null || !isLive() || rosterOps.entry(roster(), userId) === null) return problem;
        adopt(rosterOps.withdrawing(roster(), userId, now()));
        scheduleDeadline();
        if (!rosterOps.hasRecipients(roster())) {
          lastSent = null;
          stopFollowing();
        }
        return 'withdrawal-pending';
      }),
    reconcile: async () => {
      await locked(async () => {
        if (rosterOps.isSettled(roster(), now())) {
          scheduleDeadline();
          return null;
        }
        const pruned = rosterOps.pruned(roster(), now());
        if (rosterOps.isEmpty(pruned) && !rosterOps.hasRecipients(roster())) {
          adopt(EMPTY_ROSTER);
          disarm();
          return null;
        }
        const problem = await withdrawingRepublish(pruned);
        if (problem !== null && isLive()) arm(SHARED_LOCATION_RETRY_MS);
        return problem;
      });
    },
    refresh: () => {
      if (isLive()) reread();
    },
    abandon: () => {
      abandoned = true;
      disarm();
      stopFollowing();
    },
  };

  /* Une liste gardée d'un chargement précédent reprend : le partage serveur court toujours jusqu'à son terme, et « Arrêter » doit rester à un geste. */
  if (!rosterOps.isEmpty(restored) && isLive()) {
    scheduleDeadline();
    void fixes.isGranted().then((granted) => {
      if (granted && isLive() && rosterOps.hasRecipients(roster())) startFollowing();
    });
  }
  return center;
}
