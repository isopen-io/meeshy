/**
 * LA MISSION EN DUO HEBDOMADAIRE (#9385) — à deux, avec un ami accepté.
 * `docs/product/jeu-meeshy-conception.html` § II.7 : « objectif commun,
 * récompense double si les deux finissent leur part ».
 *
 * Elle s'ouvre au niveau 20 (record), pour les deux. Le duo est un OBJET à
 * deux (`invited` → `active` → `completed`, ou `abandoned` / `expired`) : un
 * duo à la fois par personne.
 *
 * Le tirage est déterministe — graine = la PAIRE triée des deux comptes et la
 * semaine —, donc identique pour les deux, quel que soit celui qui regarde. La
 * part de chacun se mesure sur le niveau le plus BAS des deux : on ne punit pas
 * l'ami qui débute. Le plafond de la part empêche l'excédent de l'un de finir
 * la part de l'autre : « à deux » veut dire que les deux jouent.
 */

import { seededRng, pickIndex } from './day-prng.js';
import { MISSION_SIGNALS, axisSignal, missionObjective, missionReward, type MissionSignal } from './missions.js';

export const DUO_MIN_LEVEL = 20;
/** Les points de base d'une mission en duo : une semaine, soit l'équivalent de deux difficiles. */
export const DUO_BASE_POINTS = 300;
/** Quand les deux finissent, chacun touche le double. */
export const DUO_REWARD_MULTIPLIER = 2;

export type DuoTemplate = {
  readonly key: string;
  readonly signal: MissionSignal;
  /** La part de CHACUN, avant la bande de niveau. */
  readonly basePartTarget: number;
  readonly prism: boolean;
};

export const DUO_TEMPLATES: readonly DuoTemplate[] = [
  { key: 'duo-messages', signal: axisSignal('content.text_message'), basePartTarget: 40, prism: false },
  { key: 'duo-voice', signal: axisSignal('content.audio_message'), basePartTarget: 5, prism: false },
  { key: 'duo-reactions', signal: axisSignal('tool.reaction'), basePartTarget: 20, prism: false },
  { key: 'duo-replies', signal: 'reply-distinct-conversations', basePartTarget: 8, prism: false },
  { key: 'duo-stories', signal: axisSignal('content.story'), basePartTarget: 3, prism: false },
  { key: 'duo-prism', signal: 'foreign-language-message', basePartTarget: 8, prism: true },
];

export type DuoMission = {
  readonly weekKey: string;
  readonly templateKey: string;
  readonly signal: MissionSignal;
  readonly prism: boolean;
  /** Ce que CHACUN doit faire. */
  readonly partTarget: number;
  /** La barre commune : la somme des deux parts. */
  readonly commonTarget: number;
  readonly basePoints: number;
};

const pairSeed = (a: string, b: string): string => [a, b].sort().join('&');

/**
 * Chaque gabarit de duo reste un signal que la passerelle observe déjà — la liste des signaux, pas celle des
 * gabarits du jour : retirer une mission du jour (#9634) ne change pas le duo d'une semaine en cours.
 */
const KNOWN_SIGNALS: ReadonlySet<MissionSignal> = new Set(MISSION_SIGNALS);
const catalog: readonly DuoTemplate[] = DUO_TEMPLATES.filter((t) => KNOWN_SIGNALS.has(t.signal));

/** La mission de la semaine du duo, `null` quand aucun gabarit ne convient aux deux. */
export function drawDuoMission(params: {
  readonly userA: string;
  readonly userB: string;
  readonly weekKey: string;
  readonly levelA: number;
  readonly levelB: number;
  /** Les signaux impossibles pour L'UN des deux. */
  readonly unavailableSignals: readonly MissionSignal[];
}): DuoMission | null {
  const blocked = new Set(params.unavailableSignals);
  const pool = catalog.filter((t) => !blocked.has(t.signal));
  const rng = seededRng({ userId: pairSeed(params.userA, params.userB), dayKey: params.weekKey, salt: 'duo' });
  const picked = pool[pickIndex(rng, pool.length)];
  if (picked === undefined) return null;
  const partTarget = missionObjective({ baseTarget: picked.basePartTarget, level: Math.min(params.levelA, params.levelB) });
  return {
    weekKey: params.weekKey,
    templateKey: picked.key,
    signal: picked.signal,
    prism: picked.prism,
    partTarget,
    commonTarget: partTarget * 2,
    basePoints: DUO_BASE_POINTS,
  };
}

const count = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

export type DuoProgress = {
  /** Ma part, plafonnée à ce qu'on me demande. */
  readonly mine: number;
  readonly partner: number;
  readonly common: number;
  readonly commonTarget: number;
  readonly mineDone: boolean;
  readonly partnerDone: boolean;
  readonly bothDone: boolean;
};

export function duoProgress(params: { readonly partTarget: number; readonly mine: number; readonly partner: number }): DuoProgress {
  const mine = Math.min(count(params.mine), params.partTarget);
  const partner = Math.min(count(params.partner), params.partTarget);
  const mineDone = mine >= params.partTarget;
  const partnerDone = partner >= params.partTarget;
  return {
    mine,
    partner,
    common: mine + partner,
    commonTarget: params.partTarget * 2,
    mineDone,
    partnerDone,
    bothDone: mineDone && partnerDone,
  };
}

/**
 * Ce que ma part vaut AU TOTAL : rien tant qu'elle n'est pas faite, la mission
 * seule quand l'autre n'a pas fini, le double quand les deux ont fini. Le
 * niveau et la Flamme sont les MIENS. La passerelle crédite la différence avec
 * ce qu'elle a déjà versé (le double se complète quand le second finit).
 */
export function duoReward(params: {
  readonly level: number;
  readonly flameDays: number;
  readonly mineDone: boolean;
  readonly partnerDone: boolean;
}): { readonly points: number; readonly doubled: boolean } {
  if (!params.mineDone) return { points: 0, doubled: false };
  const base = missionReward({ basePoints: DUO_BASE_POINTS, level: params.level, flameDays: params.flameDays });
  return params.partnerDone
    ? { points: base * DUO_REWARD_MULTIPLIER, doubled: true }
    : { points: base, doubled: false };
}

export type DuoInviteRefusal = 'self' | 'locked' | 'invitee-locked' | 'not-friends' | 'already-in-duo' | 'invitee-in-duo';

export function canInviteToDuo(params: {
  readonly inviterLevelRecord: number;
  readonly inviteeLevelRecord: number;
  readonly areFriends: boolean;
  readonly inviterHasDuo: boolean;
  readonly inviteeHasDuo: boolean;
  readonly self: boolean;
}): { readonly allowed: true } | { readonly allowed: false; readonly reason: DuoInviteRefusal } {
  if (params.self) return { allowed: false, reason: 'self' };
  if (!(params.inviterLevelRecord >= DUO_MIN_LEVEL)) return { allowed: false, reason: 'locked' };
  if (!(params.inviteeLevelRecord >= DUO_MIN_LEVEL)) return { allowed: false, reason: 'invitee-locked' };
  if (!params.areFriends) return { allowed: false, reason: 'not-friends' };
  if (params.inviterHasDuo) return { allowed: false, reason: 'already-in-duo' };
  if (params.inviteeHasDuo) return { allowed: false, reason: 'invitee-in-duo' };
  return { allowed: true };
}

export const DUO_STATUSES = ['invited', 'active', 'completed', 'abandoned', 'expired'] as const;
export type DuoStatus = (typeof DUO_STATUSES)[number];
export type DuoAction = 'accept' | 'abandon' | 'expire' | 'complete';

/** Le statut suivant, `null` quand le geste n'a pas de sens dans l'état actuel. */
export function duoTransition(params: {
  readonly status: DuoStatus;
  readonly action: DuoAction;
  readonly actor: 'inviter' | 'invitee';
}): DuoStatus | null {
  const { status, action, actor } = params;
  if (status === 'invited' && action === 'accept') return actor === 'invitee' ? 'active' : null;
  if ((status === 'invited' || status === 'active') && action === 'abandon') return 'abandoned';
  if ((status === 'invited' || status === 'active') && action === 'expire') return 'expired';
  if (status === 'active' && action === 'complete') return 'completed';
  return null;
}
