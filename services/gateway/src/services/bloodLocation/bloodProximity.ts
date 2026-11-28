/**
 * L'ALERTE DE PROXIMITÉ entre deux Sangs (#13937, LOC-11, RG-14) : à l'enregistrement d'un point,
 * les Sangs (et les collègues de l'équipe, sans lien) qui se sont consentis la proximité DANS LES DEUX
 * SENS, ni l'un ni l'autre en fantôme, dont la dernière position date de moins d'une heure et tombe dans
 * le rayon réglé (le plus petit des deux), reçoivent chacun `location:blood-proximity` — l'identité de
 * l'autre et un palier de distance, jamais une coordonnée. Au plus UNE alerte par paire toutes les
 * 2 h (`RELATION_THRESHOLDS.proximity.cooldownHours`), prise AVANT l'envoi par un magasin strict : une
 * panne n'envoie rien.
 *
 * Seuls les comptes que le drapeau admet sont candidats : hors liste blanche, aucun événement.
 *
 * L'alerte ne sert pas à LOCALISER (audit #13937) : un point arrivé à une vitesse impossible depuis le
 * précédent ({@link isPlausibleMove}) n'est ni évalué ni pris comme « dernière position » de l'autre ;
 * une paire n'est évaluée qu'une fois par quart d'heure, qu'elle alerte ou non — un essai raté coûte ;
 * un compte n'évalue que {@link PROXIMITY_EVALUATIONS_PER_HOUR} paires par heure. Cadence et compteur
 * sont stricts : une panne n'évalue rien.
 *
 * Un lecteur qui a coupé la position continue de l'autre (#19454, `bloodLocationMute`) ne reçoit plus
 * l'alerte de cette paire ; l'autre la reçoit toujours, et rien ne lui dit la coupure. Une paire coupée
 * dans les deux sens n'est même pas évaluée.
 *
 * Chaque alerte socket a son double poussé (#20540, `notifyProximity`) : même destinataire, même
 * garde de silence, même cadence (prise une fois pour les deux canaux), et le MÊME palier de distance
 * — jamais plus précis que l'alerte socket. Une app fermée l'apprend ainsi ; un échec de notification n'arrête rien.
 *
 * Le consentement est relu en base à CHAQUE enregistrement (`relationConsent`), jamais en cache : un
 * retrait coupe l'alerte suivante. Et la paire est RELUE après la cadence (#20689) — un retrait, un
 * effacement ou un fantôme posé pendant les attentes Redis coupe l'alerte EN VOL ; le notifieur la
 * relit encore juste avant d'écrire, et une ligne écrite pendant un retrait est aussitôt retirée. La loi d'accès (`location.proximity`, niveau, blocage, âge, équipe)
 * est celle de `pairAccessAmong`, dans les deux sens.
 */
import {
  BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS,
  BLOOD_PROXIMITY_FRESH_MINUTES,
  BLOOD_PROXIMITY_MAX_RADIUS_METERS,
  type BloodProximityEventData,
} from '@meeshy/shared/types/blood-location';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { RELATION_THRESHOLDS } from '@meeshy/shared/utils/relation-levels';
import { comptesAuMoins } from '../friendship';
import { pairAccessAmong } from '../relations/pairAccess';
import { pairConsentResolver, relationPairConsentAmong, relationPairConsentBy } from '../relations/relationConsent';
import { teamPeerCandidates } from '../relations/teamPeers';
import { bloodLocationMutedBy, bloodLocationMutedFor } from './bloodLocationMute';
import { openPoint, pointVisibleTo } from './bloodLocationSeal';
import { ownersHidingFrom, veilAllows, type PointVeil } from './bloodLocationVeil';
import type { BloodLocationDeps, BloodProximityNotice } from './bloodLocationTypes';

const CANDIDATE_LIMIT = 200;
/** Au-delà (≈ 250 km/h), un déplacement depuis le point précédent est tenu pour inventé. */
export const PROXIMITY_MAX_SPEED_MPS = 70;
/** Une paire évaluée — alerte ou non — ne l'est plus avant ce délai. */
export const PROXIMITY_PAIR_EVALUATION_MINUTES = 15;
/** Les paires qu'un compte peut évaluer dans une heure d'horloge. */
export const PROXIMITY_EVALUATIONS_PER_HOUR = 60;
const HOUR_MS = 3_600_000;
const EARTH_RADIUS_METERS = 6_371_000;
const DISTANCE_STEPS: readonly BloodProximityEventData['distanceMeters'][] = [100, 250, 500, 1000, 2500, 5000];

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Distance du grand cercle (haversine), en mètres. */
export function distanceMeters(a: { readonly latitude: number; readonly longitude: number }, b: { readonly latitude: number; readonly longitude: number }): number {
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

const stepOf = (meters: number): BloodProximityEventData['distanceMeters'] =>
  DISTANCE_STEPS.find((step) => meters <= step) ?? DISTANCE_STEPS[DISTANCE_STEPS.length - 1];

const pairKeyOf = (a: string, b: string, kind: 'alert' | 'evaluation' = 'alert'): string => {
  const [low, high] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${kind === 'alert' ? 'blood-proximity' : 'blood-proximity-eval'}:${low}:${high}`;
};

const accountKeyOf = (ownerId: string, now: number): string => `blood-proximity-evals:${ownerId.toLowerCase()}:${Math.floor(now / HOUR_MS)}`;

type Point = { readonly latitude: number; readonly longitude: number };

/** Vrai sans point précédent, ou quand la vitesse depuis lui reste possible (seconde plancher). */
export function isPlausibleMove(previous: (Point & { readonly at: number }) | null, next: Point, at: number): boolean {
  if (!previous) return true;
  const seconds = Math.max(1, (at - previous.at) / 1000);
  return distanceMeters(previous, next) / seconds <= PROXIMITY_MAX_SPEED_MPS;
}

/**
 * La notification poussée de chaque alerte (#20540), l'une après l'autre : best-effort, un échec
 * n'arrête rien. Le notifieur relit la paire juste avant d'écrire (#20689) ; une ligne écrite
 * pendant qu'un retrait passait est relue APRÈS et retirée chez son lecteur — une relecture qui
 * lève vaut paire fermée — et son push, parti sans être attendu, est révoqué sans condition.
 */
async function notifyAll(deps: BloodLocationDeps, notices: readonly BloodProximityNotice[]): Promise<void> {
  const notify = deps.notifyProximity;
  if (!notify) return;
  for (const notice of notices) {
    try {
      const admits = (): Promise<boolean> => noticeAdmitted(deps, notice);
      const written = await notify(notice, { admits });
      if (typeof written === 'string' && !(await admits().catch(() => false))) {
        await deps.retractProximityNotices({ kind: 'at', ownerId: notice.otherId, readerId: notice.recipientId, writtenId: written });
      }
    } catch (error) {
      deps.report?.(error);
    }
  }
}

async function claimed(deps: BloodLocationDeps, key: string, ttlSeconds: number): Promise<boolean> {
  try {
    return await deps.claimProximityCooldown(key, ttlSeconds);
  } catch (error) {
    deps.report?.(error);
    return false;
  }
}

/** Les candidats que `ownerId` n'a pas masqués, et qui ne l'ont pas masqué (fantôme global ou ciblé). */
async function unhiddenCandidates(deps: BloodLocationDeps, ownerId: string, candidates: readonly string[], veil: PointVeil): Promise<readonly string[]> {
  const open = candidates.filter((id) => veilAllows(veil, id));
  if (open.length === 0) return [];
  const hidden = await ownersHidingFrom(deps.prisma, ownerId, open);
  return open.filter((id) => !hidden.has(id));
}

/** Le rayon de chacun (mètres) par candidat : le plus petit des deux sens, 500 m sans réglage. */
async function radiusByCandidate(deps: BloodLocationDeps, ownerId: string, candidates: readonly string[]): Promise<ReadonlyMap<string, number>> {
  const [mine, theirs] = await Promise.all([
    deps.prisma.relationFeatureSetting.findMany({ where: { ownerId, otherId: { in: [...candidates] } }, select: { otherId: true, proximityRadiusMeters: true } }),
    deps.prisma.relationFeatureSetting.findMany({ where: { ownerId: { in: [...candidates] }, otherId: ownerId }, select: { ownerId: true, proximityRadiusMeters: true } }),
  ]);
  const radius = (value: number | null | undefined): number => Math.min(BLOOD_PROXIMITY_MAX_RADIUS_METERS, value ?? BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS);
  const own = new Map(mine.map((row) => [row.otherId, radius(row.proximityRadiusMeters)]));
  const other = new Map(theirs.map((row) => [row.ownerId, radius(row.proximityRadiusMeters)]));
  return new Map(candidates.map((id) => [id, Math.min(own.get(id) ?? BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS, other.get(id) ?? BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS)]));
}

/** Les candidats à qui la loi ouvre la proximité dans LES DEUX sens, consentement relu dans chacun. */
async function mutuallyAllowed(deps: BloodLocationDeps, ownerId: string, candidates: readonly string[]): Promise<readonly string[]> {
  const feature = 'location.proximity';
  const [toThem, fromThem] = await Promise.all([
    relationPairConsentAmong(deps.prisma, { ownerId, otherIds: candidates, feature }),
    relationPairConsentBy(deps.prisma, { ownerIds: candidates, otherId: ownerId, feature }),
  ]);
  const [theySee, iSee] = await Promise.all([
    pairAccessAmong(deps.prisma, { feature, subjectId: ownerId, otherIds: candidates, subjectIs: 'target', consentOf: pairConsentResolver(feature, toThem) }),
    pairAccessAmong(deps.prisma, { feature, subjectId: ownerId, otherIds: candidates, subjectIs: 'viewer', consentOf: pairConsentResolver(feature, fromThem) }),
  ]);
  return candidates.filter((id) => theySee.get(id)?.allowed === true && iSee.get(id)?.allowed === true);
}

async function freshPositionOf(deps: BloodLocationDeps, otherId: string, ownerId: string) {
  const since = new Date(deps.now() - BLOOD_PROXIMITY_FRESH_MINUTES * 60_000);
  const row = await deps.prisma.bloodLocationPoint.findFirst({
    where: { ownerId: otherId, recordedAt: { gte: since }, expiresAt: { gt: new Date(deps.now()) } },
    orderBy: { recordedAt: 'desc' },
    select: { sealed: true },
  });
  const point = row ? openPoint(otherId, row.sealed) : null;
  return point && !point.implausible && pointVisibleTo(point, ownerId) ? point : null;
}

/**
 * La paire relue juste avant un canal (#20689) : drapeau, fantôme (global ou ciblé) dans les deux
 * sens, consentement mutuel `location.proximity` sous la loi d'accès, et un point frais et visible
 * de chacun — un effacement d'historique emporte le sien. Toute lecture qui lève : refusé.
 */
export async function bloodProximityPairOpen(deps: BloodLocationDeps, ownerId: string, otherId: string): Promise<boolean> {
  if (!deps.enabledFor(ownerId) || !deps.enabledFor(otherId)) return false;
  const [hiddenFromOwner, hiddenFromOther] = await Promise.all([
    ownersHidingFrom(deps.prisma, ownerId, [otherId]),
    ownersHidingFrom(deps.prisma, otherId, [ownerId]),
  ]);
  if (hiddenFromOwner.size > 0 || hiddenFromOther.size > 0) return false;
  if ((await mutuallyAllowed(deps, ownerId, [otherId])).length === 0) return false;
  const [ownerPoint, otherPoint] = await Promise.all([freshPositionOf(deps, ownerId, otherId), freshPositionOf(deps, otherId, ownerId)]);
  return ownerPoint !== null && otherPoint !== null;
}

/** Une alerte vers `recipientId` : la paire ouverte, et le lecteur n'a pas coupé l'autre (#19454). */
async function noticeAdmitted(deps: BloodLocationDeps, notice: BloodProximityNotice): Promise<boolean> {
  if (!(await bloodProximityPairOpen(deps, notice.otherId, notice.recipientId))) return false;
  const muted = await bloodLocationMutedBy(deps.prisma, notice.recipientId, [notice.otherId]);
  return !muted.has(notice.otherId);
}

const pairOpenOrClosed = (deps: BloodLocationDeps, ownerId: string, otherId: string): Promise<boolean> =>
  bloodProximityPairOpen(deps, ownerId, otherId).catch((error: unknown) => {
    deps.report?.(error);
    return false;
  });

/** Cherche les Sangs proches du nouveau point de `ownerId` et leur envoie l'alerte, une par paire toutes les 2 h. */
export async function alertBloodProximity(
  deps: BloodLocationDeps,
  ownerId: string,
  position: { readonly latitude: number; readonly longitude: number },
  veil: PointVeil,
): Promise<void> {
  const [linked, team] = await Promise.all([
    comptesAuMoins(deps.prisma, ownerId, 'BLOOD', { limit: CANDIDATE_LIMIT }),
    teamPeerCandidates(deps.prisma, ownerId),
  ]);
  const candidates = [...new Set([...linked.map((account) => account.id), ...team])].filter((id) => id !== ownerId && deps.enabledFor(id));
  const visible = await unhiddenCandidates(deps, ownerId, candidates, veil);
  if (visible.length === 0) return;
  const mutual = await mutuallyAllowed(deps, ownerId, visible);
  if (mutual.length === 0) return;
  const [mutedByOwner, mutedOwner] = await Promise.all([
    bloodLocationMutedBy(deps.prisma, ownerId, mutual),
    bloodLocationMutedFor(deps.prisma, ownerId, mutual),
  ]);
  const allowed = mutual.filter((id) => !(mutedByOwner.has(id) && mutedOwner.has(id)));
  if (allowed.length === 0) return;
  const radii = await radiusByCandidate(deps, ownerId, allowed);
  const evaluated: { readonly otherId: string; readonly other: Point }[] = [];
  for (const otherId of allowed) {
    const other = await freshPositionOf(deps, otherId, ownerId);
    if (!other || !(await claimed(deps, pairKeyOf(ownerId, otherId, 'evaluation'), PROXIMITY_PAIR_EVALUATION_MINUTES * 60))) continue;
    evaluated.push({ otherId, other });
  }
  if (evaluated.length === 0) return;
  const total = await deps.countProximityEvaluations(accountKeyOf(ownerId, deps.now()), evaluated.length, HOUR_MS / 1000);
  const budget = Math.max(0, PROXIMITY_EVALUATIONS_PER_HOUR - (total - evaluated.length));
  for (const { otherId, other } of evaluated.slice(0, budget)) {
    const meters = distanceMeters(position, other);
    if (meters > (radii.get(otherId) ?? BLOOD_PROXIMITY_DEFAULT_RADIUS_METERS)) continue;
    if (!(await claimed(deps, pairKeyOf(ownerId, otherId), RELATION_THRESHOLDS.proximity.cooldownHours * 3600))) continue;
    if (!(await pairOpenOrClosed(deps, ownerId, otherId))) continue;
    const distance = stepOf(meters);
    const notices: BloodProximityNotice[] = [];
    if (!mutedOwner.has(otherId)) {
      deps.io?.to(ROOMS.user(otherId)).emit(SERVER_EVENTS.BLOOD_PROXIMITY, { userId: ownerId, distanceMeters: distance });
      notices.push({ recipientId: otherId, otherId: ownerId, distanceMeters: distance });
    }
    if (!mutedByOwner.has(otherId)) {
      deps.io?.to(ROOMS.user(ownerId)).emit(SERVER_EVENTS.BLOOD_PROXIMITY, { userId: otherId, distanceMeters: distance });
      notices.push({ recipientId: ownerId, otherId, distanceMeters: distance });
    }
    await notifyAll(deps, notices);
  }
}
