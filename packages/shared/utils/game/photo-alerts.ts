/**
 * LES ALERTES D'IMMORTALISATION (#10173, § 5.16.1) — une loi décide quelle étape ANNONCER, une seule à la fois.
 *
 * `photoAlertFor` rend, pour une transition : l'étape la plus marquante ATTEINTE (`announce`), l'étape OUVERTE
 * de sa piste, celle que `photoOfferFor` proposerait (`propose` — la loi lui DÉLÈGUE l'ordre), et toutes les
 * étapes atteintes à accuser (`reached`). L'annonce et la proposition peuvent différer : un compte qui monte en
 * Légende II sans photo de rang se voit annoncer Légende II et proposer Murmure IV (D20 a), ou Légende II si
 * l'arriéré d'avant la ligne de base se range à part (D20 b).
 *
 * Jamais d'alerte : à la ligne de base (la première évaluation d'un compte), pour le départ, pour une étape
 * franchie avant la ligne de base, déjà photographiée, présentée ou notifiée, ni hors du rythme de la politique.
 *
 * Miroir Swift : `packages/MeeshySDK/Sources/MeeshySDK/Game/GamePhotoAlerts.swift`, loi `photo-alert` des vecteurs.
 */

import { PHOTO_ALERT_POLICY, type PhotoAlertPolicy } from './photo-alert-policy.js';
import { photoOfferFor, photoOfferPriority, photoStepsReached, photoTrackOf, type PhotoCatchUpStanding } from './photo-catch-up.js';
import { photoDayOfMomentId } from './photo-moments.js';
import { TREASURY_TIERS, type TreasuryTierKey } from './treasury.js';

export { PHOTO_ALERT_POLICY, type PhotoAlertPolicy } from './photo-alert-policy.js';

const BIG_RANK = /^rank:[a-z]+:5$/;
const MEESH = /^meesh:(\d+)$/;

/** Les « grands moments » du réglage d'invitation : passage de rang, Mythe, niveau 100, Prestige, Meesh d'or ou prisme, Flamme 100 et 365. */
export function isBigPhotoMoment(momentId: string): boolean {
  if (BIG_RANK.test(momentId) || momentId === 'rank:mythe:0' || momentId === 'level-100:0' || momentId.startsWith('prestige:')) return true;
  if (momentId === 'flame:100' || momentId === 'flame:365') return true;
  const meesh = MEESH.exec(momentId);
  return meesh !== null && Number(meesh[1]) > 0 && Number(meesh[1]) % 100 === 0;
}

/** Le rythme dans l'app : instants en millisecondes depuis l'époque, journées locales `AAAA-MM-JJ`. */
export type PhotoAlertPacing = {
  readonly now: number;
  readonly dayKey: string;
  readonly sessionStartedAt: number | null;
  /** Née d'un geste (la célébration en cours) ou passive (trouvée à la lecture du jeu). */
  readonly surface: 'gesture' | 'passive';
  /** Les invitations déjà montrées, gestes compris. */
  readonly shown: readonly { readonly at: number; readonly dayKey: string }[];
};

const MINUTE = 60_000;

/**
 * `allowed` : l'invitation peut paraître. `silent` : plafond du jour ou écart minimal atteint — la célébration
 * se termine sans carte photo, l'étape va au carnet en silence. `wait` : une invitation passive attend la fin du
 * délai de grâce de la session.
 */
export function photoAlertPacing(pacing: PhotoAlertPacing, policy: PhotoAlertPolicy = PHOTO_ALERT_POLICY): 'allowed' | 'silent' | 'wait' {
  const today = pacing.shown.filter((entry) => entry.dayKey === pacing.dayKey).length;
  if (today >= policy.inApp.perDay) return 'silent';
  const last = pacing.shown.reduce<number | null>((latest, entry) => (latest === null || entry.at > latest ? entry.at : latest), null);
  if (last !== null && pacing.now - last < policy.inApp.minGapMinutes * MINUTE) return 'silent';
  const graceEnds = pacing.sessionStartedAt === null ? null : pacing.sessionStartedAt + policy.inApp.sessionGraceMinutes * MINUTE;
  return pacing.surface === 'passive' && graceEnds !== null && pacing.now < graceEnds ? 'wait' : 'allowed';
}

export type PhotoAlertInput = {
  /** Les identités que la transition atteint (étapes de piste, réalisation du jour, moments hors piste). */
  readonly reached: readonly string[];
  readonly standing: PhotoCatchUpStanding;
  readonly kept: readonly string[];
  /** Les étapes déjà présentées OU notifiées, sur quelque appareil que ce soit. */
  readonly presented: readonly string[];
  /** La situation à la ligne de base ; `null` : première évaluation du compte, aucune alerte. */
  readonly baseline: PhotoCatchUpStanding | null;
  readonly policy?: PhotoAlertPolicy;
  /** Le plus haut palier du trésor atteint (D14, `treasuryPeakTier`) quand il est servi. */
  readonly treasuryPeak?: TreasuryTierKey | null;
  readonly pacing?: PhotoAlertPacing;
};

export type PhotoAlert = { readonly announce: string; readonly propose: string; readonly reached: readonly string[] };

const tierIndex = (tier: TreasuryTierKey | null | undefined): number => TREASURY_TIERS.findIndex((t) => t.key === tier);

const atPeak = (standing: PhotoCatchUpStanding, peak: TreasuryTierKey | null | undefined): PhotoCatchUpStanding =>
  tierIndex(peak) > tierIndex(standing.treasuryTier) ? { ...standing, treasuryTier: peak ?? null } : standing;

const invited = (momentId: string, policy: PhotoAlertPolicy): boolean => {
  switch (policy.invitations) {
    case 'every-step':
      return true;
    case 'big-moments':
      return isBigPhotoMoment(momentId);
    case 'never':
      return false;
  }
};

export function photoAlertFor(input: PhotoAlertInput): PhotoAlert | null {
  const policy = input.policy ?? PHOTO_ALERT_POLICY;
  if (input.baseline === null) return null;
  const standing = atPeak(input.standing, input.treasuryPeak);
  const steps = photoStepsReached(standing, policy).map((step) => step.id);
  const photographable = new Set(steps);
  const backlog = new Set(photoStepsReached(input.baseline, policy).map((step) => step.id));
  const kept = new Set(input.kept);
  const presented = new Set(input.presented);
  const days = input.reached.flatMap((id) => photoDayOfMomentId(id) ?? []).sort();
  const latestDay = days.length === 0 ? null : `day:${days[days.length - 1]}`;

  const isCandidate = (id: string): boolean => {
    if (id === 'start' || kept.has(id) || presented.has(id) || backlog.has(id)) return false;
    if (photoTrackOf(id) !== null) return photographable.has(id);
    return photoDayOfMomentId(id) === null || id === latestDay;
  };
  const reached = [...new Set(input.reached)].filter(isCandidate);
  const announced = reached.filter((id) => invited(id, policy));
  if (announced.length === 0) return null;
  if (input.pacing !== undefined && photoAlertPacing(input.pacing, policy) !== 'allowed') return null;

  const rankOf = (id: string): readonly [number, number] => [photoOfferPriority(id), -steps.indexOf(id)];
  const announce = announced.reduce((best, id) => {
    const [a, b] = rankOf(id);
    const [c, d] = rankOf(best);
    return a < c || (a === c && b < d) ? id : best;
  });
  const lockedBy = policy.backlog === 'apart' ? [...input.kept, ...backlog] : input.kept;
  const propose = photoOfferFor([announce], standing, lockedBy, policy) ?? announce;
  return { announce, propose, reached };
}

/** Une étape du registre partagé (`GamePhotoMoment`). */
export type PhotoMomentRecord = { readonly stepId: string; readonly presentedAt: string | null; readonly notifiedAt: string | null };

/**
 * Le résumé groupé du push : les étapes ni présentées ni notifiées, sans le départ ni la réalisation du jour
 * (annoncée par sa célébration, jamais par push). `null` : rien à notifier.
 */
export function photoAlertDigest(moments: readonly PhotoMomentRecord[]): { readonly stepIds: readonly string[]; readonly count: number } | null {
  const stepIds = [
    ...new Set(
      moments
        .filter((m) => m.presentedAt === null && m.notifiedAt === null && m.stepId !== 'start' && photoDayOfMomentId(m.stepId) === null)
        .map((m) => m.stepId),
    ),
  ];
  return stepIds.length === 0 ? null : { stepIds, count: stepIds.length };
}
