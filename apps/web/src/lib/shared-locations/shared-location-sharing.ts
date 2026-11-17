import type { SharedLocationOwnSnapshot } from '@meeshy/shared/types/shared-location';
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
 *
 * PLUSIEURS APPAREILS, UN PARTAGE (#18389) : la passerelle n'en connaît qu'un par compte, et
 * c'est lui qui fait foi. `sync()` relit ce qu'elle sert (à chaque socket accrochée et à chaque
 * `location:share-own-changed`) et s'y recale, retraits en attente d'ici gagnants
 * (`rosterOps.withServed`) : un retrait fait ailleurs s'applique ici, un ajout fait ailleurs
 * n'est plus effacé par la liste périmée de cet onglet.
 *
 * PLUSIEURS ONGLETS, UNE LISTE (#18431) : les onglets d'un même compte partagent la liste par
 * `localStorage`. Chaque opération passe par `acrossTabs` (`navigator.locks`, un verrou par compte) :
 * un « Arrêter » ne court jamais pendant qu'un démarrage d'un autre onglet attend son accusé, et
 * relit la liste que ce démarrage vient d'adopter avant de retirer la personne.
 *
 * Une liste REÇUE d'un autre appareil (adoptée par `sync()` quand ce navigateur ne partageait rien) ne
 * fait jamais partir la position d'ici : pas de suivi, pas même au rechargement (marque
 * `<clé>.received`), et une échéance s'y solde sans rien envoyer — la passerelle tient
 * l'échéance de chacun (#18205). Seul un geste d'ici (« Partager », « Arrêter ») envoie
 * quelque chose ; « Partager » fait de cet onglet celui qui publie.
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
  /** Se recale sur le partage que la passerelle sert : un autre appareil du compte a pu le changer (#18389). */
  sync(): Promise<void>;
  abandon(): void;
};

/** Sérialise une opération avec celles des autres onglets du même compte ; sans verrou partagé, elle court seule. */
export type SharedLocationAcrossTabs = <T>(run: () => Promise<T>) => Promise<T>;

const ALONE: SharedLocationAcrossTabs = (run) => run();

/** La part de `LockManager` (Web Locks) employée : un verrou EXCLUSIF par nom. */
type SharedLocationLockManager = {
  readonly request: <T>(name: string, options: { readonly mode: 'exclusive' }, callback: () => Promise<T>) => Promise<T>;
};

const isLockManager = (candidate: unknown): candidate is SharedLocationLockManager =>
  typeof candidate === 'object' && candidate !== null && typeof (candidate as { readonly request?: unknown }).request === 'function';

/** Le verrou `navigator.locks` du compte ; un navigateur sans Web Locks garde le verrou de l'onglet seul (comportement d'avant #18431). */
export function sharedLocationAcrossTabs(locks: unknown, name: string): SharedLocationAcrossTabs {
  if (!isLockManager(locks)) return ALONE;
  return (run) => locks.request(name, { mode: 'exclusive' }, run);
}

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
  served = async () => null,
  acrossTabs = ALONE,
}: {
  readonly emitter: SharedLocationEmitter;
  readonly fixes: SharedLocationFixSource;
  readonly storage: SafeStorage;
  readonly storageKey: string;
  readonly now?: () => number;
  readonly schedule: (delayMs: number, run: () => void) => () => void;
  readonly owner: string;
  readonly currentAccount: () => string | null;
  /** Le partage que la passerelle sert au compte ; `null` quand la relecture n'a rien rendu (hors ligne, passerelle d'avant). */
  readonly served?: () => Promise<SharedLocationOwnSnapshot | null>;
  /** Le verrou partagé avec les autres onglets du même compte (#18431). */
  readonly acrossTabs?: SharedLocationAcrossTabs;
}): SharedLocationSharingCenter {
  const withdrawalsKey = sharedLocationWithdrawalsKey(storageKey);
  const receivedKey = `${storageKey}.received`;
  const load = (): SharedLocationRoster => decodeSharedLocationRoster(storage.getItem(storageKey), storage.getItem(withdrawalsKey));
  const restored = load();
  const store = createStore<SharedLocationSharingState>(() => ({ roster: restored, busy: false }));
  const gate = createSerialGate();
  let abandoned = false;
  let lastSent: SharedLocationSent | null = null;
  let unfollow: (() => void) | null = null;
  let cancelDeadline: (() => void) | null = null;
  /* La liste vient d'un autre appareil : cet onglet ne publie pas sa position (#18389). */
  let received = storage.getItem(receivedKey) === '1';
  const markReceived = (next: boolean): void => {
    received = next;
    try {
      if (next) storage.setItem(receivedKey, '1');
      else storage.removeItem(receivedKey);
    } catch {
      /* En mémoire, la marque tient : au pire, un rechargement reprendrait le suivi, comme avant #18389. */
    }
  };

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
    received = storage.getItem(receivedKey) === '1';
    if (!rosterOps.hasRecipients(kept) || received) {
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
    markReceived(false);
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
      if (isLive() && verdict.kind === 'refused' && verdict.outcome === 'not-sharing') await wipeUnlessChangedElsewhere(current);
    } finally {
      gate.leave();
    }
  };

  /* « Pas de partage » répond à la liste d'AVANT l'envoi : un autre onglet a pu en démarrer une depuis, qu'on ne vide pas (#18431). */
  const wipeUnlessChangedElsewhere = async (sentWith: SharedLocationRoster): Promise<void> => {
    await acrossTabs(async () => {
      if (!isLive()) return;
      reread();
      if (rosterOps.equals(roster(), sentWith)) wipe();
    });
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

  const engage = (served: SharedLocationRoster, fix: SharedLocationFix | null): void => {
    const next = withKeptWithdrawals(served);
    adopt(next);
    if (fix !== null) lastSent = { fix, at: now() };
    if (rosterOps.hasRecipients(next) && !received) startFollowing();
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

  /*
   * La liste envoyée solde tous les retraits en attente : c'est elle que le serveur sert dès qu'il l'accepte. Sans
   * position (liste seule, #19284), un seul envoi : une passerelle qui la connaît connaît aussi l'échéance par personne.
   */
  const publish = async (wanted: SharedLocationRoster, fix: SharedLocationFix | null, previous: SharedLocationRoster): Promise<SharedLocationShareProblem | null> => {
    const next = rosterOps.settled(wanted);
    const payload = sharedLocationStartPayloadOf({ recipients: rosterOps.deadlinedRecipients(next, now()), durationMinutes: rosterOps.serverDurationMinutes(next, now()), fix });
    if (payload === null) return 'invalid';
    if (!isLive()) return 'failed';
    /* Avant l'accusé, la liste gardée couvre les deux : un onglet fermé pendant l'attente garde « Arrêter » pour chacun. */
    persist(rosterOps.union(previous, next));
    const verdict = fix === null ? await emitter.start(payload) : await startTolerant(payload);
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

  /*
   * « Pas de partage » couvre aussi une session remplacée par un autre appareil pendant l'envoi : la passerelle dit ce
   * qui court. Un partage servi ⇒ le retrait reste en attente et se rejoue (la liste seule ignore qui n'est plus servi) ;
   * aucun, ou une relecture qui ne conclut pas sur une passerelle muette ⇒ la liste se vide, sans arrêt ni relevé.
   */
  const settleNotSharing = async (): Promise<SharedLocationShareProblem | null> => {
    const truth = await served().catch(() => null);
    if (!isLive()) return 'failed';
    if (truth !== null && truth.recipients.length > 0) return 'unconfirmed';
    wipe();
    return null;
  };

  /*
   * Retirer quelqu'un ou solder une échéance republie la LISTE SEULE (#19284) : la passerelle reprend le point qu'elle
   * garde, et cet onglet n'envoie pas sa position — il peut n'avoir fait que recevoir la liste d'un autre appareil
   * (#18580). Sans partage côté passerelle, il n'y a plus rien à retirer chez personne. Une passerelle d'avant refuse
   * la liste seule : la liste repart avec une position, la dernière envoyée, sinon celle de l'appareil ; sans l'une ni
   * l'autre, TOUT s'arrête.
   */
  const republish = async (wanted: SharedLocationRoster): Promise<SharedLocationShareProblem | null> => {
    if (!rosterOps.hasRecipients(wanted)) return stopAll();
    const listOnly = await publish(wanted, null, roster());
    if (listOnly !== 'invalid' && listOnly !== 'not-sharing') return listOnly;
    if (!isLive()) return 'failed';
    if (listOnly === 'not-sharing') return settleNotSharing();
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

  /* Le verrou de l'onglet seul : ce qui attend l'utilisateur (une demande de permission) s'y tient, jamais sous celui des autres onglets. */
  const gated = async (run: () => Promise<SharedLocationShareProblem | null>): Promise<SharedLocationShareProblem | null> => {
    await gate.enter();
    try {
      store.setState({ busy: true });
      return await run();
    } finally {
      store.setState({ busy: false });
      gate.leave();
    }
  };

  /* Sous le verrou du compte, la liste gardée est relue : un autre onglet a pu la changer pendant l'attente (#18431). */
  const acrossAccountTabs = (operation: () => Promise<SharedLocationShareProblem | null>): Promise<SharedLocationShareProblem | null> =>
    acrossTabs(async () => {
      if (!isLive()) return 'failed';
      reread();
      return operation();
    });

  const locked = (operation: () => Promise<SharedLocationShareProblem | null>): Promise<SharedLocationShareProblem | null> =>
    gated(() => acrossAccountTabs(operation));

  const center: SharedLocationSharingCenter = {
    store,
    entry: (userId) => rosterOps.entry(rosterOps.pruned(roster(), now()), userId),
    showsRow: (userId, offered) => offered || center.entry(userId) !== null,
    share: ({ userId, precision, durationMinutes }) =>
      gated(async () => {
        if (!isLive()) return 'failed';
        const current = await fixes.currentFix();
        if (current.kind === 'denied') return 'location-denied';
        if (current.kind === 'unavailable') return 'location-unavailable';
        return acrossAccountTabs(async () => {
          markReceived(false);
          const previous = roster();
          const next = rosterOps.adding(rosterOps.pruned(previous, now()), { userId, precision, durationMinutes, now: now() });
          return publish(next, current.fix, previous);
        });
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
          markReceived(false);
          disarm();
          return null;
        }
        if (received && !rosterOps.hasPendingWithdrawals(pruned)) {
          if (rosterOps.isEmpty(pruned)) wipe();
          else adopt(pruned);
          scheduleDeadline();
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
    sync: async () => {
      await locked(async () => {
        const truth = await served().catch(() => null);
        if (truth === null || !isLive()) return null;
        const before = roster();
        const next = rosterOps.withServed(before, truth, now());
        if (rosterOps.equals(next, before)) return null;
        adopt(next);
        if (!rosterOps.hasRecipients(next)) {
          lastSent = null;
          stopFollowing();
          markReceived(false);
        } else if (!rosterOps.hasRecipients(before)) markReceived(true);
        scheduleDeadline();
        return null;
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
    scheduleDeadline();
    void fixes.isGranted().then((granted) => {
      if (granted && isLive() && !received && rosterOps.hasRecipients(roster())) startFollowing();
    });
  }
  return center;
}
