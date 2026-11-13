/**
 * LA POSITION DU SANG (#13937) — enregistrer, lire, effacer, journaliser, régler. Voir
 * `packages/shared/types/blood-location.ts` pour le contrat.
 *
 * - **Enregistrer** : un point scellé (`bloodLocationSeal`), 30 jours ; rien en fantôme global. Un
 *   fantôme CIBLÉ range le point mais y grave les lecteurs masqués : la période reste cachée à
 *   ceux-là même après la levée du fantôme.
 * - **Lire** l'historique d'un autre : la loi d'accès (`location.history`, niveau Sang, blocage, âge,
 *   équipe) ET le consentement de l'émetteur, relu en base à chaque appel. Le fantôme rend la même
 *   réponse vide qu'un compte sans historique, après le même travail (les points sont lus puis tus) ;
 *   la consultation est notée dans les deux cas. Un émetteur hors drapeau rend aussi la réponse vide, sans journal : la fonction n'existe pas pour lui.
 * - **Journal** : lisible du seul observé ; `excessive` quand un même observateur dépasse 20 lectures
 *   en 24 h. Au-delà, ses lectures ne s'ajoutent plus, elles datent sa dernière ligne ; et chaque
 *   observateur des 30 jours y figure, quel que soit le volume des autres.
 * - **Proximité** : `bloodProximity.ts`, déclenchée à l'enregistrement, jamais bloquante — et jamais
 *   pour un point arrivé à une vitesse impossible depuis le dernier point vraisemblable (rangé, marqué
 *   dans le scellé), ni pour un point sans ancre (premier point, ou premier après un effacement).
 */
import {
  BLOOD_CONSULTATION_EXCESS_PER_DAY,
  BLOOD_LOCATION_HISTORY_DAYS,
  BLOOD_LOCATION_HISTORY_DEFAULT_LIMIT,
  BLOOD_LOCATION_HISTORY_MAX_LIMIT,
  BLOOD_PROXIMITY_MAX_RADIUS_METERS,
  BLOOD_PROXIMITY_MIN_RADIUS_METERS,
  bloodLocationPayloadSchema,
  type BloodLocationConsultations,
  type BloodLocationHistoryPoint,
  type BloodLocationSettingsPayload,
} from '@meeshy/shared/types/blood-location';
import { pairAccessAmong } from '../relations/pairAccess';
import { relationConsentGrantedAmong } from '../relations/relationConsent';
import { alertBloodProximity, isPlausibleMove } from './bloodProximity';
import { openPoint, sealPoint } from './bloodLocationSeal';
import type { BloodLocationDeps } from './bloodLocationTypes';

export type { BloodLocationDeps } from './bloodLocationTypes';

const DAY_MS = 24 * 3_600_000;
const HISTORY_MS = BLOOD_LOCATION_HISTORY_DAYS * DAY_MS;
const JOURNAL_LIMIT = 200;

/** Qui `ownerId` masque aujourd'hui par un fantôme ciblé. */
async function ghostedBy(deps: BloodLocationDeps, ownerId: string): Promise<ReadonlySet<string>> {
  const rows = await deps.prisma.relationFeatureSetting.findMany({ where: { ownerId, ghostAt: { not: null } }, select: { otherId: true } });
  return new Set(rows.map((row) => row.otherId));
}

async function inGlobalGhost(deps: BloodLocationDeps, ownerId: string): Promise<boolean> {
  const row = await deps.prisma.user.findUnique({ where: { id: ownerId }, select: { locationGhostAt: true } });
  return row?.locationGhostAt != null;
}

const ANCHOR_SCAN = 50;

/**
 * L'ancre de la vitesse : le dernier point VRAISEMBLABLE du compte. Un point téléporté est rangé mais
 * n'ancre rien, sans quoi un appelant poserait son ancre où il veut puis un point voisin d'une seconde.
 */
async function anchorOf(deps: BloodLocationDeps, ownerId: string): Promise<{ latitude: number; longitude: number; at: number } | null> {
  const rows = await deps.prisma.bloodLocationPoint.findMany({ where: { ownerId }, orderBy: { recordedAt: 'desc' }, take: ANCHOR_SCAN, select: { sealed: true, recordedAt: true } });
  const anchors = rows.flatMap((row) => {
    const point = openPoint(ownerId, row.sealed);
    return point && point.implausible !== true ? [{ latitude: point.latitude, longitude: point.longitude, at: row.recordedAt.getTime() }] : [];
  });
  return anchors[0] ?? null;
}

export async function recordBloodLocation(deps: BloodLocationDeps, ownerId: string, input: unknown): Promise<{ readonly recorded: boolean }> {
  const parsed = bloodLocationPayloadSchema.safeParse(input);
  if (!parsed.success || (await inGlobalGhost(deps, ownerId))) return { recorded: false };
  const [hidden, anchor] = await Promise.all([ghostedBy(deps, ownerId), anchorOf(deps, ownerId)]);
  const now = deps.now();
  const plausible = isPlausibleMove(anchor, parsed.data, now);
  await deps.prisma.bloodLocationPoint.create({
    data: {
      ownerId,
      sealed: sealPoint(ownerId, { ...parsed.data, hiddenFrom: [...hidden], ...(plausible ? {} : { implausible: true as const }) }),
      recordedAt: new Date(now),
      expiresAt: new Date(now + HISTORY_MS),
    },
  });
  if (plausible && anchor) await alertBloodProximity(deps, ownerId, parsed.data, hidden).catch((error: unknown) => deps.report?.(error));
  return { recorded: true };
}

export type BloodLocationHistoryVerdict =
  | { readonly kind: 'ok'; readonly items: readonly BloodLocationHistoryPoint[] }
  | { readonly kind: 'forbidden'; readonly code: 'RELATION_CONSENT_REQUIRED' | 'FORBIDDEN' };

const clampLimit = (limit: number | undefined): number =>
  Math.min(BLOOD_LOCATION_HISTORY_MAX_LIMIT, Math.max(1, Math.trunc(limit ?? BLOOD_LOCATION_HISTORY_DEFAULT_LIMIT)));

const sinceOf = (since: string | undefined, now: number): Date => {
  const floor = now - HISTORY_MS;
  const asked = since === undefined ? Number.NaN : Date.parse(since);
  return new Date(Number.isFinite(asked) ? Math.max(floor, asked) : floor);
};

async function pointsOf(deps: BloodLocationDeps, ownerId: string, viewerId: string, params: { since?: string; limit?: number }): Promise<readonly BloodLocationHistoryPoint[]> {
  const now = deps.now();
  const rows = await deps.prisma.bloodLocationPoint.findMany({
    where: { ownerId, recordedAt: { gte: sinceOf(params.since, now) }, expiresAt: { gt: new Date(now) } },
    orderBy: { recordedAt: 'desc' },
    take: clampLimit(params.limit),
    select: { sealed: true, recordedAt: true },
  });
  return rows.flatMap((row) => {
    const point = openPoint(ownerId, row.sealed);
    if (!point || point.hiddenFrom.includes(viewerId)) return [];
    return [{ latitude: point.latitude, longitude: point.longitude, ...(point.accuracy === undefined ? {} : { accuracy: point.accuracy }), recordedAt: row.recordedAt.toISOString() }];
  });
}

async function viewerMayRead(deps: BloodLocationDeps, viewerId: string, ownerId: string): Promise<BloodLocationHistoryVerdict | null> {
  const granted = await relationConsentGrantedAmong(deps.prisma, { ownerId, otherIds: [viewerId], feature: 'location.history' });
  const verdicts = await pairAccessAmong(deps.prisma, {
    feature: 'location.history',
    subjectId: viewerId,
    otherIds: [ownerId],
    subjectIs: 'viewer',
    now: new Date(deps.now()),
    consentOf: () => (granted.has(viewerId) ? 'granted' : 'refused'),
  });
  const verdict = verdicts.get(ownerId);
  if (verdict?.allowed === true) return null;
  return { kind: 'forbidden', code: verdict?.reason === 'consent' ? 'RELATION_CONSENT_REQUIRED' : 'FORBIDDEN' };
}

/**
 * Note une lecture. Au-delà du seuil d'excès sur 24 h, l'excès est déjà signalé : la dernière ligne
 * de l'observateur prend l'heure de cette lecture au lieu d'en ajouter une — un observateur qui lit
 * en boucle ne gonfle pas le journal (au plus seuil + 1 lignes par jour).
 */
async function noteConsultation(deps: BloodLocationDeps, observedId: string, observerId: string): Promise<void> {
  const now = deps.now();
  const stamp = { consultedAt: new Date(now), expiresAt: new Date(now + HISTORY_MS) };
  const ofPair = { observedId, observerId };
  const lastDay = await deps.prisma.bloodLocationConsultation.count({ where: { ...ofPair, consultedAt: { gte: new Date(now - DAY_MS) } } });
  if (lastDay <= BLOOD_CONSULTATION_EXCESS_PER_DAY) {
    await deps.prisma.bloodLocationConsultation.create({ data: { ...ofPair, ...stamp } });
    return;
  }
  const last = await deps.prisma.bloodLocationConsultation.findFirst({ where: ofPair, orderBy: { consultedAt: 'desc' }, select: { id: true } });
  if (last) await deps.prisma.bloodLocationConsultation.updateMany({ where: { id: last.id }, data: stamp });
}

export async function readBloodLocationHistory(
  deps: BloodLocationDeps,
  viewerId: string,
  ownerId: string,
  params: { readonly since?: string; readonly limit?: number },
): Promise<BloodLocationHistoryVerdict> {
  if (viewerId === ownerId) return { kind: 'ok', items: await pointsOf(deps, ownerId, '', params) };
  const refusal = await viewerMayRead(deps, viewerId, ownerId);
  if (refusal) return refusal;
  if (!deps.enabledFor(ownerId)) return { kind: 'ok', items: [] };
  await noteConsultation(deps, ownerId, viewerId);
  const [global, targeted, items] = await Promise.all([inGlobalGhost(deps, ownerId), ghostedBy(deps, ownerId), pointsOf(deps, ownerId, viewerId, params)]);
  return { kind: 'ok', items: global || targeted.has(viewerId) ? [] : items };
}

export async function eraseBloodLocationHistory(deps: BloodLocationDeps, ownerId: string): Promise<{ readonly erased: number }> {
  const { count } = await deps.prisma.bloodLocationPoint.deleteMany({ where: { ownerId } });
  return { erased: count };
}

export async function listBloodLocationConsultations(deps: BloodLocationDeps, observedId: string): Promise<BloodLocationConsultations> {
  const now = deps.now();
  const where = { observedId, consultedAt: { gte: new Date(now - HISTORY_MS) } };
  const select = { observerId: true, consultedAt: true } as const;
  const [recent, latestPerObserver] = await Promise.all([
    deps.prisma.bloodLocationConsultation.findMany({ where, orderBy: { consultedAt: 'desc' }, take: JOURNAL_LIMIT, select }),
    deps.prisma.bloodLocationConsultation.findMany({ where, orderBy: { consultedAt: 'desc' }, distinct: ['observerId'], select }),
  ]);
  const seen = new Set(recent.map((row) => `${row.observerId}:${row.consultedAt.getTime()}`));
  const rows = [...recent, ...latestPerObserver.filter((row) => !seen.has(`${row.observerId}:${row.consultedAt.getTime()}`))].sort(
    (a, b) => b.consultedAt.getTime() - a.consultedAt.getTime(),
  );
  const dayAgo = now - DAY_MS;
  const activeToday = latestPerObserver.filter((row) => row.consultedAt.getTime() >= dayAgo).map((row) => row.observerId);
  const counts = await Promise.all(
    activeToday.map(async (observerId) => [observerId, await deps.prisma.bloodLocationConsultation.count({ where: { observedId, observerId, consultedAt: { gte: new Date(dayAgo) } } })] as const),
  );
  const excessiveObserverIds = counts.filter(([, count]) => count > BLOOD_CONSULTATION_EXCESS_PER_DAY).map(([id]) => id);
  return {
    items: rows.map((row) => ({ observerId: row.observerId, consultedAt: row.consultedAt.toISOString() })),
    excessive: excessiveObserverIds.length > 0,
    excessiveObserverIds,
  };
}

const clampRadius = (meters: number): number => Math.min(BLOOD_PROXIMITY_MAX_RADIUS_METERS, Math.max(BLOOD_PROXIMITY_MIN_RADIUS_METERS, meters));

/**
 * La loi ouvrirait-elle la position du Sang entre les deux, consentement mis à part ? Un réglage
 * pour un inconnu, un compte inexistant ou un Proche n'a pas lieu d'être : il ne crée aucune ligne.
 */
async function locationMayOpenWith(deps: BloodLocationDeps, ownerId: string, otherId: string): Promise<boolean> {
  const verdicts = await Promise.all(
    (['location.history', 'location.proximity'] as const).map((feature) =>
      pairAccessAmong(deps.prisma, { feature, subjectId: ownerId, otherIds: [otherId], subjectIs: 'target', now: new Date(deps.now()), consentOf: () => 'granted' }),
    ),
  );
  return verdicts.some((verdict) => verdict.get(otherId)?.allowed === true);
}

export async function updateBloodLocationSettings(deps: BloodLocationDeps, ownerId: string, settings: BloodLocationSettingsPayload): Promise<{ readonly ok: boolean }> {
  const at = new Date(deps.now());
  if (settings.userId === undefined) {
    if (settings.ghost === undefined) return { ok: false };
    await deps.prisma.user.update({ where: { id: ownerId }, data: { locationGhostAt: settings.ghost ? at : null } });
    return { ok: true };
  }
  if (settings.userId === ownerId || !(await locationMayOpenWith(deps, ownerId, settings.userId))) return { ok: false };
  const data = {
    ...(settings.ghost === undefined ? {} : { ghostAt: settings.ghost ? at : null }),
    ...(settings.proximityRadiusMeters === undefined ? {} : { proximityRadiusMeters: clampRadius(settings.proximityRadiusMeters) }),
  };
  await deps.prisma.relationFeatureSetting.upsert({
    where: { ownerId_otherId: { ownerId, otherId: settings.userId } },
    create: { ownerId, otherId: settings.userId, ...data },
    update: data,
  });
  return { ok: true };
}
