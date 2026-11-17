/**
 * LA CARTE DE TOUS MES PROCHES — le dernier point de chaque Sang (#19202).
 *
 * `GET /relations/locations?include=blood` servait jusque-là les seuls partages temporaires : la
 * carte devait lire l'historique de chaque Sang, un appel et une ligne de journal par Sang et par
 * rafraîchissement. Ici, un seul passage, jugé EXACTEMENT comme l'historique
 * (`readBloodLocationHistory`) :
 *
 * - les candidats sont mes liens Sang et mes collègues de l'équipe (la loi les ouvre sans lien) ;
 * - le drapeau vaut pour les deux comptes : hors drapeau, le lecteur ne lit rien et un émetteur
 *   n'existe pas, sans journal ;
 * - la loi `location.history` (niveau, blocage, âge, équipe) et le consentement de l'émetteur,
 *   relu en base à chaque appel ;
 * - la consultation est notée AVANT de juger le fantôme : un fantôme rend la même absence qu'un Sang
 *   sans point, après le même travail ;
 * - le dernier point non masqué au lecteur par un fantôme ciblé passé.
 *
 * Le journal ne prend une ligne que si aucune consultation de ce Sang par ce lecteur n'y figure
 * depuis `BLOOD_MAP_CONSULTATION_WINDOW_MINUTES` — une lecture d'historique comprise.
 */
import { BLOOD_LOCATION_HISTORY_DAYS, BLOOD_MAP_CONSULTATION_WINDOW_MINUTES } from '@meeshy/shared/types/blood-location';
import { SHARED_LOCATION_CIRCLES, type SharedLocationBloodItem, type SharedLocationCircle } from '@meeshy/shared/types/shared-location';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { comptesAuMoins } from '../friendship';
import { pairAccessAmong } from '../relations/pairAccess';
import { relationConsentGrantedBy } from '../relations/relationConsent';
import { teamPeerCandidates } from '../relations/teamPeers';
import { openPoint } from './bloodLocationSeal';
import { noteConsultation } from './bloodLocationService';
import type { BloodLocationDeps } from './bloodLocationTypes';

/** Au-delà, la carte s'arrête aux Sangs les plus proches : un compte a peu de Sangs. */
const BLOOD_MAP_CANDIDATE_LIMIT = 100;
/** Les points récents qu'on ouvre pour trouver le dernier qui ne m'est pas masqué. */
const LATEST_SCAN = 50;
const DAY_MS = 24 * 3_600_000;

const circleOf = (level: RelationLevel | undefined): SharedLocationCircle | undefined =>
  SHARED_LOCATION_CIRCLES.find((circle) => circle === level);

async function candidatesOf(deps: BloodLocationDeps, viewerId: string): Promise<readonly string[]> {
  const [linked, team] = await Promise.all([
    comptesAuMoins(deps.prisma, viewerId, 'BLOOD', { limit: BLOOD_MAP_CANDIDATE_LIMIT }),
    teamPeerCandidates(deps.prisma, viewerId),
  ]);
  return [...new Set([...linked.map((account) => account.id), ...team])].filter((id) => id !== viewerId && deps.enabledFor(id));
}

/** Les émetteurs que la loi et leur consentement m'ouvrent, avec le cercle que la loi vient de juger. */
async function allowedOwners(deps: BloodLocationDeps, viewerId: string, ownerIds: readonly string[]): Promise<ReadonlyMap<string, SharedLocationCircle | undefined>> {
  const feature = 'location.history';
  const granted = await relationConsentGrantedBy(deps.prisma, { ownerIds, otherId: viewerId, feature });
  const law = await pairAccessAmong(deps.prisma, {
    feature,
    subjectId: viewerId,
    otherIds: ownerIds,
    subjectIs: 'viewer',
    now: new Date(deps.now()),
    consentOf: (ownerId) => (granted.has(ownerId) ? 'granted' : 'refused'),
  });
  return new Map(ownerIds.flatMap((ownerId) => {
    const verdict = law.get(ownerId);
    return verdict?.allowed === true ? [[ownerId, circleOf(verdict.effectiveLevel)] as const] : [];
  }));
}

/** Note la consultation de la carte pour chaque Sang que ce lecteur n'a pas déjà consulté dans la fenêtre — le journal lu en UNE requête. */
async function noteMapConsultations(deps: BloodLocationDeps, observedIds: readonly string[], observerId: string): Promise<void> {
  const since = new Date(deps.now() - BLOOD_MAP_CONSULTATION_WINDOW_MINUTES * 60_000);
  const recent = await deps.prisma.bloodLocationConsultation.findMany({
    where: { observerId, observedId: { in: [...observedIds] }, consultedAt: { gt: since } },
    distinct: ['observedId'],
    select: { observedId: true },
  });
  const seen = new Set(recent.map((row) => row.observedId));
  await Promise.all(observedIds.filter((observedId) => !seen.has(observedId)).map((observedId) => noteConsultation(deps, observedId, observerId)));
}

/** Ceux qui me masquent aujourd'hui leur position : fantôme global, ou fantôme ciblé sur moi. */
async function ghostedFor(deps: BloodLocationDeps, viewerId: string, ownerIds: readonly string[]): Promise<ReadonlySet<string>> {
  const [global, targeted] = await Promise.all([
    deps.prisma.user.findMany({ where: { id: { in: [...ownerIds] }, locationGhostAt: { not: null } }, select: { id: true } }),
    deps.prisma.relationFeatureSetting.findMany({ where: { ownerId: { in: [...ownerIds] }, otherId: viewerId, ghostAt: { not: null } }, select: { ownerId: true } }),
  ]);
  return new Set([...global.map((row) => row.id), ...targeted.map((row) => row.ownerId)]);
}

/** Le premier point, du plus récent, qui ne m'est pas masqué : on n'ouvre que ce qu'il faut. */
function firstVisible(ownerId: string, viewerId: string, rows: readonly { readonly sealed: string; readonly recordedAt: Date }[]) {
  for (const row of rows) {
    const point = openPoint(ownerId, row.sealed);
    if (point && !point.hiddenFrom.includes(viewerId)) return { point, recordedAt: row.recordedAt };
  }
  return null;
}

async function latestPointOf(deps: BloodLocationDeps, ownerId: string, viewerId: string): Promise<Omit<SharedLocationBloodItem, 'circle'> | null> {
  const now = deps.now();
  const rows = await deps.prisma.bloodLocationPoint.findMany({
    where: { ownerId, recordedAt: { gte: new Date(now - BLOOD_LOCATION_HISTORY_DAYS * DAY_MS) }, expiresAt: { gt: new Date(now) } },
    orderBy: { recordedAt: 'desc' },
    take: LATEST_SCAN,
    select: { sealed: true, recordedAt: true },
  });
  const latest = firstVisible(ownerId, viewerId, rows);
  if (!latest) return null;
  const { point, recordedAt } = latest;
  return { userId: ownerId, latitude: point.latitude, longitude: point.longitude, ...(point.accuracy === undefined ? {} : { accuracy: point.accuracy }), recordedAt: recordedAt.toISOString() };
}

export async function bloodLocationMapFor(deps: BloodLocationDeps, viewerId: string): Promise<readonly SharedLocationBloodItem[]> {
  if (!deps.enabledFor(viewerId)) return [];
  const candidates = await candidatesOf(deps, viewerId);
  if (candidates.length === 0) return [];
  const allowed = await allowedOwners(deps, viewerId, candidates);
  const owners = [...allowed.keys()];
  if (owners.length === 0) return [];
  await noteMapConsultations(deps, owners, viewerId);
  const ghosted = await ghostedFor(deps, viewerId, owners);
  const points = await Promise.all(owners.filter((ownerId) => !ghosted.has(ownerId)).map((ownerId) => latestPointOf(deps, ownerId, viewerId)));
  return points.flatMap((point) => {
    if (!point) return [];
    const circle = allowed.get(point.userId);
    return [{ ...point, ...(circle === undefined ? {} : { circle }) }];
  });
}
