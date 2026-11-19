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
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { applyPresenceVisibility, type PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import {
  profileFieldServed,
  resolveProfileCircleView,
  resolveProfileCircleViewAs,
  resolveProfilePresenceAs,
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
    targetDeactivated: target?.deactivated ?? false,
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

type SeenColumns = GatedColumns & { isOnline?: boolean | null; lastActiveAt?: Date | null };

/** Ce que « Voir comme » lit du propriétaire : ses préférences de présence. */
export type OwnerPresencePreferences = { readonly showOnlineStatus: boolean; readonly showLastSeen: boolean };

/**
 * « Voir comme » (`?as=`) : la vue du cercle ET la présence qu'un lecteur ordinaire
 * de ce cercle recevrait du propriétaire RÉEL — son âge déclaré et son rôle pour la
 * loi d'accès, ses préférences et sa désactivation pour la loi des valeurs. Rien
 * n'est relâché pour le propriétaire : il voit ce que le service réel servirait.
 */
export async function readProfileSeenAs(
  prisma: PairAccessDb,
  privacy: { getPreferences(userId: string): Promise<OwnerPresencePreferences> },
  params: { readonly ownerId: string; readonly level: RelationLevel; readonly now?: Date },
): Promise<{ readonly view: ProfileCircleView; readonly visibility: PresenceVisibility }> {
  const [people, prefs] = await Promise.all([
    peopleOf(prisma, [params.ownerId], params.now ?? new Date()),
    privacy.getPreferences(params.ownerId),
  ]);
  const owner = people.get(params.ownerId);
  const facts = { targetMinor: owner?.age ?? 'unknown', targetRole: owner?.role ?? null } as const;
  return {
    view: resolveProfileCircleViewAs({ level: params.level, targetId: params.ownerId, ...facts }),
    visibility: resolveProfilePresenceAs({
      level: params.level,
      ...facts,
      targetShowOnlineStatus: prefs.showOnlineStatus,
      targetShowLastSeen: prefs.showLastSeen,
      targetIsDeactivated: owner?.deactivated ?? true,
    }),
  };
}

/**
 * La fiche du propriétaire telle que la voit un lecteur de « Voir comme » : pays,
 * fuseau, « en ligne » et dernière vue par la présence que ce lecteur RECEVRAIT
 * (`readProfileSeenAs`) — la même porte que pour un lecteur réel. Un champ fermé
 * est retiré ; « en ligne » sans la date garde la garde anti-stale de l'Ami.
 */
export function profileSeenAs<T extends SeenColumns>(visibility: PresenceVisibility, row: T): T {
  const kept = withPresenceGatedFields(row, visibility);
  if ('isOnline' in kept) {
    const served = applyPresenceVisibility({ isOnline: kept.isOnline ?? null, lastActiveAt: kept.lastActiveAt ?? null }, visibility);
    kept.isOnline = served.isOnline;
  }
  if (!visibility.showOnline) delete kept.isOnline;
  if (!visibility.showLastSeenTimestamp) delete kept.lastActiveAt;
  return kept;
}
