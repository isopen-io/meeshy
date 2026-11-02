import { createStore, type StoreApi } from 'zustand/vanilla';

import type { GameBlock } from '@meeshy/shared/types/game';
import type { PhotoCatchUpStandingPayload } from '@meeshy/shared/types/game-photo';
import type { PhotoInvitations } from '@meeshy/shared/types/game-photo-settings';
import { GLORY_DIVISIONS, GLORY_RANKS, type GloryDivision5, type GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import { PHOTO_ALERT_POLICY, photoAlertFor, photoAlertPacing, type PhotoAlertPacing, type PhotoAlertPolicy } from '@meeshy/shared/utils/game/photo-alerts';
import { catchUpStandingOf, photoCatchUp, photoStepsReached, photoTrackOf, type PhotoCatchUpStanding } from '@meeshy/shared/utils/game/photo-catch-up';
import { photoDayOfMomentId } from '@meeshy/shared/utils/game/photo-moments';

import type { SafeStorage } from '@/lib/storage';

import { catchUpMoments, dayMoment, type PhotoMoment } from './moments';
import type { Notebook } from './notebook';

/**
 * LE COORDINATEUR DES INVITATIONS À IMMORTALISER (#10174, L18 ; § 5.16.3 du prompt des Cadres de gloire ;
 * D6, D19, D20 de #10183).
 *
 * UNE file de un, pour toute l'application : les étapes nées d'un GESTE (la célébration en cours les remet
 * par `celebrate`) et les étapes PASSIVES (trouvées à chaque lecture fraîche du bloc `game`, `observe`) y
 * entrent par le même chemin, et la loi partagée (`photoAlertFor`, #10173) décide ce qui s'annonce, ce qui
 * se propose, et ce qui s'accuse. Tant qu'une invitation attend un geste, la suivante attend (`busy`) sans
 * que la situation avance : elle sera réévaluée quand la file se libère.
 *
 * LA MÉMOIRE APPAREIL, PAR COMPTE (`localStorage`, sous `try/catch`) : la « dernière situation annoncée »
 * — c'est elle qui rattrape l'étape franchie app fermée, par différence des étapes photographiables, jamais
 * par comparaison à la lecture précédente en mémoire —, les invitations montrées (le rythme : plafond du
 * jour, écart minimal, délai de grâce d'une session) et les étapes nouvelles depuis la dernière visite du
 * carnet (la pastille). La ligne de base SERVIE (`game.photo.baseline`) l'emporte quand elle existe ; sinon
 * la première lecture d'un compte sur cet appareil enregistre la situation SANS alerte.
 *
 * Ce module ne touche ni le DOM ni le réseau : l'accusé de présentation est un port (`acknowledge`), que
 * `displayed` appelle UNE fois par invitation, avec toutes les étapes atteintes et l'étape proposée.
 */
export type PhotoAlertSurface = 'gesture' | 'passive';

export type PendingPhotoAlert = {
  readonly userId: string;
  /** L'étape la plus marquante ATTEINTE : « Nouveau rang · Légende II ». */
  readonly announce: PhotoMoment;
  /** L'étape OUVERTE de sa piste, celle que le déroulé immortalise : peut différer de l'annonce. */
  readonly propose: PhotoMoment;
  readonly reached: readonly string[];
  readonly surface: PhotoAlertSurface;
};

export type PhotoAlertState = {
  readonly pending: PendingPhotoAlert | null;
  /** Les étapes nouvelles depuis la dernière visite du carnet, pour le compte lu en dernier (la pastille). */
  readonly noticed: readonly string[];
};

export type PhotoAlertMemory = {
  readonly standing: PhotoCatchUpStanding | null;
  readonly shown: readonly { readonly at: number; readonly dayKey: string }[];
  readonly noticed: readonly string[];
};

/** Ce que le carnet de l'appareil sait : les identités gardées, et toutes celles qu'il connaît (en attente comprises). */
export type NotebookIds = { readonly kept: readonly string[]; readonly known: readonly string[] };

export type PhotoAlertSource = {
  readonly userId: string;
  readonly game: GameBlock;
  /** Lu seulement quand une étape neuve est trouvée : l'écran ne paie pas IndexedDB à chaque lecture du jeu. */
  readonly kept: () => Promise<NotebookIds>;
};

export type PhotoAlertDecision = 'baseline' | 'none' | 'wait' | 'busy' | 'alert';

export type PhotoAlertDeps = {
  readonly storage: SafeStorage;
  readonly now?: () => number;
  /** L'ouverture de la session : aucune invitation passive pendant le délai de grâce. `null` : pas de délai. */
  readonly sessionStartedAt: number | null;
  /** L'accusé de présentation (`POST …/photo-moments/presented`), appelé une fois par invitation montrée. */
  readonly acknowledge: (stepIds: readonly string[]) => void;
};

export type PhotoAlerts = {
  readonly store: StoreApi<PhotoAlertState>;
  /** La ligne de base de l'appareil, sans alerte : à poser à la première lecture d'un compte. */
  readonly adopt: (input: { readonly userId: string; readonly game: GameBlock }) => void;
  /** Une lecture fraîche du jeu : les étapes franchies depuis la dernière situation annoncée. */
  readonly observe: (source: PhotoAlertSource) => Promise<PhotoAlertDecision>;
  /** Les moments qu'une célébration vient de produire. */
  readonly celebrate: (source: PhotoAlertSource, moments: readonly PhotoMoment[]) => Promise<PhotoAlertDecision>;
  /** L'invitation est à l'écran (bannière, feuille, carte) : rythme, pastille, accusé — une fois. */
  readonly displayed: (alert: PendingPhotoAlert) => void;
  /** « Immortaliser » : rend l'invitation et libère la file. */
  readonly consume: () => PendingPhotoAlert | null;
  /** « Plus tard » : libère la file ; l'étape reste au carnet. */
  readonly later: () => void;
  readonly badge: (userId: string) => boolean;
  readonly carnetVisited: (userId: string) => void;
};

const KEY = (userId: string): string => `meeshy.game.photo-alerts.${userId}`;
const EMPTY: PhotoAlertMemory = { standing: null, shown: [], noticed: [] };
const SHOWN_KEPT = 12;

const RANKS: ReadonlySet<string> = new Set<string>([...GLORY_RANKS.map((rank) => rank.key), 'mythe']);

const isStanding = (value: unknown): value is PhotoCatchUpStanding => {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['rank'] === 'string' &&
    RANKS.has(r['rank']) &&
    (r['division'] === null || (GLORY_DIVISIONS as readonly number[]).includes(r['division'] as number)) &&
    typeof r['levelRecord'] === 'number' &&
    typeof r['prestige'] === 'number' &&
    typeof r['minted'] === 'number' &&
    typeof r['flameRecord'] === 'number'
  );
};

/** La ligne de base servie, relue dans le type de la loi ; une ligne illisible vaut « aucune ». */
export const servedBaseline = (payload: PhotoCatchUpStandingPayload | null | undefined): PhotoCatchUpStanding | null =>
  payload != null && isStanding(payload) ? { ...payload, rank: payload.rank as GloryRankOrMythic, division: payload.division as GloryDivision5 | null } : null;

/** Le réglage de compte « Me proposer d'immortaliser » dans les mots de la loi. */
export function invitationsPolicy(invitations: PhotoInvitations | undefined): PhotoAlertPolicy {
  switch (invitations) {
    case 'major':
      return { ...PHOTO_ALERT_POLICY, invitations: 'big-moments' };
    case 'never':
      return { ...PHOTO_ALERT_POLICY, invitations: 'never' };
    case 'every':
    case undefined:
      return PHOTO_ALERT_POLICY;
  }
}

export type PhotoAlertContext = { readonly routeHub: boolean; readonly callLive: boolean; readonly typing: boolean };

/** Jamais hors d'un hub (onboarding, appel, composer, story, visionneuse sont ailleurs), pendant un appel ni une saisie. */
export const photoAlertContextFree = ({ routeHub, callLive, typing }: PhotoAlertContext): boolean => routeHub && !callLive && !typing;

/**
 * « Plus tard » : l'étape attend au carnet (une étape de piste s'y déduit, une réalisation du jour s'y écrit),
 * et une réalisation du jour ne garde que la PLUS RÉCENTE en attente (D6).
 */
export async function deferLater(notebook: Pick<Notebook, 'defer' | 'list' | 'remove'>, moment: PhotoMoment): Promise<void> {
  if (photoDayOfMomentId(moment.id) !== null) {
    const entries = await notebook.list().catch(() => []);
    const olderDays = entries.filter((entry) => entry.status === 'pending' && entry.momentId !== moment.id && photoDayOfMomentId(entry.momentId) !== null);
    await Promise.all(olderDays.map((entry) => notebook.remove(entry.id)));
  }
  await notebook.defer(moment);
}

const localDayKey = (at: number): string => {
  const date = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const readMemory = (storage: SafeStorage, userId: string): PhotoAlertMemory => {
  try {
    const raw: unknown = JSON.parse(storage.getItem(KEY(userId)) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return EMPTY;
    const r = raw as Record<string, unknown>;
    const shown = Array.isArray(r['shown'])
      ? r['shown'].flatMap((entry: unknown) => {
          if (typeof entry !== 'object' || entry === null) return [];
          const e = entry as Record<string, unknown>;
          return typeof e['at'] === 'number' && typeof e['dayKey'] === 'string' ? [{ at: e['at'], dayKey: e['dayKey'] }] : [];
        })
      : [];
    const noticed = Array.isArray(r['noticed']) ? r['noticed'].filter((id: unknown): id is string => typeof id === 'string') : [];
    return { standing: isStanding(r['standing']) ? r['standing'] : null, shown, noticed };
  } catch {
    return EMPTY;
  }
};

const ids = (standing: PhotoCatchUpStanding, policy: PhotoAlertPolicy): readonly string[] => photoStepsReached(standing, policy).map((step) => step.id);

export function createPhotoAlerts(deps: PhotoAlertDeps): PhotoAlerts {
  const now = deps.now ?? Date.now;
  const store = createStore<PhotoAlertState>(() => ({ pending: null, noticed: [] }));
  /* La séance tient même si le stockage refuse : la dernière mémoire écrite reste lisible ici. */
  const session = new Map<string, PhotoAlertMemory>();
  const acknowledged = new WeakSet<PendingPhotoAlert>();

  const read = (userId: string): PhotoAlertMemory => session.get(userId) ?? readMemory(deps.storage, userId);
  const write = (userId: string, memory: PhotoAlertMemory): void => {
    session.set(userId, memory);
    store.setState({ noticed: memory.noticed });
    try {
      deps.storage.setItem(KEY(userId), JSON.stringify(memory));
    } catch {
      /* Stockage refusé : la mémoire tient pour la séance. */
    }
  };

  const pacingOf = (memory: PhotoAlertMemory, surface: PhotoAlertSurface): PhotoAlertPacing => ({
    now: now(),
    dayKey: localDayKey(now()),
    sessionStartedAt: deps.sessionStartedAt,
    surface,
    shown: memory.shown,
  });

  const momentOf = (id: string, offered: readonly PhotoMoment[], standing: PhotoCatchUpStanding, policy: PhotoAlertPolicy): PhotoMoment | null => {
    const given = offered.find((moment) => moment.id === id);
    if (given !== undefined) return given;
    const day = photoDayOfMomentId(id);
    if (day !== null) return dayMoment(day);
    return catchUpMoments(photoCatchUp(standing, [], policy)).find((entry) => entry.moment.id === id)?.moment ?? null;
  };

  const decide = async (source: PhotoAlertSource, memory: PhotoAlertMemory, reached: readonly string[], offered: readonly PhotoMoment[], surface: PhotoAlertSurface): Promise<PhotoAlertDecision> => {
    const { game, userId } = source;
    const photo = game.photo;
    const policy = invitationsPolicy(photo?.invitations);
    const standing = catchUpStandingOf(game);
    const pacing = pacingOf(memory, surface);
    if (photoAlertPacing(pacing, policy) === 'wait') return 'wait';
    const notebook = await source.kept();
    const served = photo?.moments ?? [];
    const presented = served.filter((m) => m.presentedAt !== null || m.notifiedAt !== null || m.keptAt !== null).map((m) => m.stepId);
    const kept = [...notebook.kept, ...served.filter((m) => m.keptAt !== null).map((m) => m.stepId)];
    write(userId, { ...memory, standing });
    const alert = photoAlertFor({
      reached,
      standing,
      kept,
      presented,
      baseline: servedBaseline(photo?.baseline) ?? memory.standing,
      policy,
      treasuryPeak: photo?.treasuryPeakTier ?? null,
      pacing,
    });
    if (alert === null || notebook.known.includes(alert.propose)) return 'none';
    const announce = momentOf(alert.announce, offered, standing, policy);
    const propose = momentOf(alert.propose, offered, standing, policy);
    if (announce === null || propose === null) return 'none';
    store.setState({ pending: { userId, announce, propose, reached: alert.reached, surface } });
    return 'alert';
  };

  const adopt: PhotoAlerts['adopt'] = ({ userId, game }) => {
    const memory = read(userId);
    if (memory.standing === null) write(userId, { ...memory, standing: catchUpStandingOf(game) });
    else store.setState({ noticed: memory.noticed });
  };

  return {
    store,
    adopt,
    observe: async (source) => {
      const memory = read(source.userId);
      if (memory.standing === null) {
        adopt(source);
        return 'baseline';
      }
      const policy = invitationsPolicy(source.game.photo?.invitations);
      const standing = catchUpStandingOf(source.game);
      const before = new Set(ids(memory.standing, policy));
      const reached = ids(standing, policy).filter((id) => !before.has(id));
      if (reached.length === 0) {
        if (JSON.stringify(standing) !== JSON.stringify(memory.standing)) write(source.userId, { ...memory, standing });
        else store.setState({ noticed: memory.noticed });
        return 'none';
      }
      if (store.getState().pending !== null) return 'busy';
      return decide(source, memory, reached, [], 'passive');
    },
    celebrate: async (source, moments) => {
      const memory = read(source.userId);
      if (memory.standing === null) {
        adopt(source);
        return 'baseline';
      }
      if (store.getState().pending !== null) return 'busy';
      /* D6 : la réalisation du jour cède toujours à une étape de piste. */
      const tracked = moments.some((moment) => photoTrackOf(moment.id) !== null);
      const admitted = moments.filter((moment) => !tracked || photoDayOfMomentId(moment.id) === null);
      if (admitted.length === 0) return 'none';
      return decide(
        source,
        memory,
        admitted.map((moment) => moment.id),
        admitted,
        'gesture',
      );
    },
    displayed: (alert) => {
      if (acknowledged.has(alert)) return;
      acknowledged.add(alert);
      const memory = read(alert.userId);
      const at = now();
      const noticed = [...new Set([...memory.noticed, alert.announce.id, alert.propose.id])];
      write(alert.userId, { ...memory, shown: [...memory.shown, { at, dayKey: localDayKey(at) }].slice(-SHOWN_KEPT), noticed });
      deps.acknowledge([...new Set([...alert.reached, alert.propose.id])]);
    },
    consume: () => {
      const { pending } = store.getState();
      if (pending !== null) store.setState({ pending: null });
      return pending;
    },
    later: () => {
      if (store.getState().pending !== null) store.setState({ pending: null });
    },
    badge: (userId) => read(userId).noticed.length > 0,
    carnetVisited: (userId) => {
      const memory = read(userId);
      if (memory.noticed.length > 0) write(userId, { ...memory, noticed: [] });
      else store.setState({ noticed: [] });
    },
  };
}
