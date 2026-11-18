/**
 * LA CARTE D'UN SANG SUIT SA POSITION CONTINUE EN DIRECT (#19400) : à chaque point enregistré,
 * `location:blood-moved` { userId, at } part à la room `user:<lecteur>` de chaque compte qui
 * pourrait LIRE l'historique de l'émetteur à cet instant — jugé comme `readBloodLocationHistory` :
 *
 * - candidats : les liens Sang de l'émetteur et ses collègues de l'équipe, chacun admis par le
 *   drapeau (l'émetteur aussi) ;
 * - la loi `location.history` (niveau, blocage, âge, équipe) et le consentement de l'émetteur, relu
 *   en base à CHAQUE point ;
 * - rien vers un lecteur qu'un fantôme ciblé masque (le fantôme global ne range aucun point) ; rien
 *   vers un lecteur qui a coupé la position continue de l'émetteur (`bloodLocationMute`) ; rien pour
 *   un point arrivé à une vitesse impossible (l'appelant ne l'appelle pas).
 *
 * Le signal ne porte AUCUNE coordonnée : le client relit la carte ou l'historique, et c'est cette
 * lecture — jamais le signal — qui ouvre les coordonnées et écrit au journal des consultations. Au
 * plus un signal par paire et par {@link BLOOD_MOVED_SIGNAL_SECONDS}, cadence prise AVANT l'envoi
 * par le magasin strict : une panne n'envoie rien.
 */
import { BLOOD_MOVED_SIGNAL_SECONDS, type BloodMovedEventData } from '@meeshy/shared/types/blood-location';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { comptesAuMoins } from '../friendship';
import { pairAccessAmong } from '../relations/pairAccess';
import { relationConsentGrantedAmong } from '../relations/relationConsent';
import { teamPeerCandidates } from '../relations/teamPeers';
import { bloodLocationMutedFor } from './bloodLocationMute';
import type { BloodLocationDeps } from './bloodLocationTypes';

const READER_LIMIT = 200;

const pairKeyOf = (ownerId: string, readerId: string): string => `blood-moved:${ownerId.toLowerCase()}:${readerId.toLowerCase()}`;

async function candidatesOf(deps: BloodLocationDeps, ownerId: string, hidden: ReadonlySet<string>): Promise<readonly string[]> {
  const [linked, team] = await Promise.all([
    comptesAuMoins(deps.prisma, ownerId, 'BLOOD', { limit: READER_LIMIT }),
    teamPeerCandidates(deps.prisma, ownerId),
  ]);
  return [...new Set([...linked.map((account) => account.id), ...team])].filter((id) => id !== ownerId && !hidden.has(id) && deps.enabledFor(id));
}

/** Les candidats qui pourraient lire l'historique de `ownerId` maintenant : loi et consentement relu. */
async function readersOf(deps: BloodLocationDeps, ownerId: string, candidates: readonly string[]): Promise<readonly string[]> {
  const feature = 'location.history';
  const granted = await relationConsentGrantedAmong(deps.prisma, { ownerId, otherIds: candidates, feature });
  const law = await pairAccessAmong(deps.prisma, {
    feature,
    subjectId: ownerId,
    otherIds: candidates,
    subjectIs: 'target',
    now: new Date(deps.now()),
    consentOf: (id) => (granted.has(id) ? 'granted' : 'refused'),
  });
  return candidates.filter((id) => law.get(id)?.allowed === true);
}

async function claimed(deps: BloodLocationDeps, key: string): Promise<boolean> {
  try {
    return await deps.claimProximityCooldown(key, BLOOD_MOVED_SIGNAL_SECONDS);
  } catch (error) {
    deps.report?.(error);
    return false;
  }
}

export async function signalBloodMoved(deps: BloodLocationDeps, ownerId: string, recordedAt: Date, hidden: ReadonlySet<string>): Promise<void> {
  if (!deps.io || !deps.enabledFor(ownerId)) return;
  const candidates = await candidatesOf(deps, ownerId, hidden);
  if (candidates.length === 0) return;
  const readers = await readersOf(deps, ownerId, candidates);
  if (readers.length === 0) return;
  const muted = await bloodLocationMutedFor(deps.prisma, ownerId, readers);
  const data: BloodMovedEventData = { userId: ownerId, at: recordedAt.toISOString() };
  for (const readerId of readers.filter((id) => !muted.has(id))) {
    if (await claimed(deps, pairKeyOf(ownerId, readerId))) deps.io.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.BLOOD_MOVED, data);
  }
}
