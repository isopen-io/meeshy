/**
 * La fiche par cercle, lue sur la paire réelle (#18861, chantier #18857).
 *
 * L'orchestrateur LIT — les deux accords, le blocage, la communauté, l'âge et le
 * rôle — puis rend le verdict de la loi (`resolveProfileCircleView`, shared). Il
 * n'écrit AUCUNE comparaison de niveaux : la fiche ne peut pas dire autre chose
 * que le service réel, puisque les deux passent par `resolveRelationAccess`.
 *
 * Toutes les features de la fiche sont lues d'un coup (âge, rôle, communauté
 * toujours) : la fiche les couvre toutes, aucune lecture n'est économisable.
 * Une lecture qui échoue LÈVE : l'appelant ferme.
 */
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import {
  profileFieldOpen,
  profileFieldServed,
  resolveProfileCircleView,
  type ProfileCircleView,
  type ProfileGatedField,
} from '@meeshy/shared/utils/profile-circle-view';
import { getBlockedUserIdsAmong } from '../../utils/blocking';
import { accordsEntre } from '../friendship';
import { coMembersAmong, peopleOf, type PairAccessDb } from './pairAccess';

export async function readProfileCircleView(
  prisma: PairAccessDb,
  params: { readonly viewerId: string; readonly targetId: string; readonly now?: Date },
): Promise<ProfileCircleView> {
  const { viewerId, targetId } = params;
  if (!viewerId || viewerId === targetId) {
    return resolveProfileCircleView({
      viewerId,
      targetId,
      grantedByViewer: 'PUBLIC',
      grantedByTarget: 'PUBLIC',
      sharesCommunity: false,
      viewerMinor: 'unknown',
      targetMinor: 'unknown',
    });
  }
  const [accords, blocked, people, coMembers] = await Promise.all([
    accordsEntre(prisma, viewerId, targetId),
    getBlockedUserIdsAmong(prisma, viewerId, [targetId]),
    peopleOf(prisma, [viewerId, targetId], params.now ?? new Date()),
    coMembersAmong(prisma, viewerId, [targetId]),
  ]);
  const viewer = people.get(viewerId);
  const target = people.get(targetId);
  return resolveProfileCircleView({
    viewerId,
    targetId,
    grantedByViewer: accords.byViewer,
    grantedByTarget: accords.byTarget,
    sharesCommunity: coMembers.has(targetId),
    blockedEitherWay: blocked.has(targetId),
    viewerMinor: viewer?.age ?? 'unknown',
    targetMinor: target?.age ?? 'unknown',
    viewerRole: viewer?.role ?? null,
    targetRole: target?.role ?? null,
  });
}

const GATED_FIELDS: readonly ProfileGatedField[] = ['country', 'timezone'];

/** La colonne de la ligne que porte chaque champ gardé. */
const COLUMN_OF = { country: 'registrationCountry', timezone: 'timezone' } as const satisfies Record<ProfileGatedField, string>;

export type GatedColumns = { registrationCountry?: string | null; timezone?: string | null };

/**
 * Retire de la ligne les champs que la présence SERVIE ne laisse pas partir : le
 * pays suit « en ligne », le fuseau la présence détaillée. La visibilité est
 * celle que `resolvePresenceVisibility` vient de rendre pour CE lecteur — cercle,
 * préférences de la cible, désactivation, blocage, rôle — et la MÊME décide de
 * `isOnline` / `lastActiveAt` : aucun second verdict ne peut ouvrir l'heure locale
 * d'une personne qui a caché sa présence. Le champ fermé est RETIRÉ, jamais rendu
 * `null` : `null` dirait « la personne n'en a pas », ce que le lecteur n'a pas à savoir.
 */
export function withPresenceGatedFields<T extends GatedColumns>(row: T, visibility: PresenceVisibility): T {
  const kept = { ...row };
  for (const field of GATED_FIELDS) if (!profileFieldServed(visibility, field)) delete kept[COLUMN_OF[field]];
  return kept;
}

type SeenColumns = GatedColumns & { isOnline?: unknown; lastActiveAt?: unknown };

/**
 * La fiche du propriétaire telle que la voit un lecteur de la vue résolue
 * (« Voir comme ») : pays et fuseau par la porte de leur champ, la présence par
 * celle de ses deux capacités — un Ami lit « en ligne » et rien d'autre.
 */
export function profileSeenAs<T extends SeenColumns>(view: ProfileCircleView, row: T): T {
  const kept = { ...row };
  for (const field of GATED_FIELDS) if (!profileFieldOpen(view, field)) delete kept[COLUMN_OF[field]];
  if (view.capabilities.presence?.state !== 'open') delete kept.isOnline;
  if (view.capabilities.presenceDetailed?.state !== 'open') delete kept.lastActiveAt;
  return kept;
}
