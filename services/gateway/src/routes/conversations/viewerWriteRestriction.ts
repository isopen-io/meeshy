/**
 * Ce que la liste et le détail des conversations SERVENT de la règle des 13-17
 * ans (#9927) — `viewerWriteRestriction` et, sur la ligne de liste, Meeshy
 * Global rangée dans les archives d'un mineur déclaré.
 *
 * Rien n'est écrit : `UserConversationPreferences.isArchived` garde la valeur
 * que l'utilisateur a choisie, et la règle la RECOUVRE à chaque lecture tant
 * qu'il est mineur. Un `PUT /user-preferences/conversations/:id` qui désarchive
 * Global écrit donc sa préférence sans rien changer à ce que la liste sert ;
 * à 18 ans, la préférence stockée reparaît d'elle-même.
 *
 * La date de naissance n'est lue qu'une fois par requête, et seulement si la
 * page contient une conversation de type `global` : une liste sans Global ne
 * paie rien.
 */

import { GLOBAL_CONVERSATION_TYPE, viewerWriteRestrictionOf } from '@meeshy/shared/utils/global-minor-restriction';
import type { ViewerWriteRestriction } from '@meeshy/shared/types/conversation';
import { CONVERSATION_PREFERENCES_DEFAULTS } from '../../config/user-preferences-defaults';

export interface ViewerBirthDateReader {
  user: {
    findUnique(args: { where: { id: string }; select: { birthDate: true } }): Promise<{ birthDate?: Date | null } | null>;
  };
}

export async function loadViewerBirthDate(
  prisma: ViewerBirthDateReader,
  params: {
    readonly userId: string | null | undefined;
    readonly isAnonymous: boolean;
    readonly conversationTypes: readonly (string | null | undefined)[];
  }
): Promise<Date | null> {
  if (params.isAnonymous || !params.userId) return null;
  if (!params.conversationTypes.includes(GLOBAL_CONVERSATION_TYPE)) return null;
  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { birthDate: true } });
  return user?.birthDate ?? null;
}

/**
 * La ligne de préférences servie quand le lecteur n'en a aucune en base — les
 * colonnes que la liste déclare au fil (`conversationMinimalSchema`), à leur
 * valeur par défaut, archivée.
 */
const ARCHIVED_DEFAULT_PREFERENCES = {
  isPinned: CONVERSATION_PREFERENCES_DEFAULTS.isPinned,
  isMuted: CONVERSATION_PREFERENCES_DEFAULTS.isMuted,
  isArchived: true,
  tags: CONVERSATION_PREFERENCES_DEFAULTS.tags,
  categoryId: CONVERSATION_PREFERENCES_DEFAULTS.categoryId,
  customName: CONVERSATION_PREFERENCES_DEFAULTS.customName,
  reaction: CONVERSATION_PREFERENCES_DEFAULTS.reaction,
} as const;

export function servedListRowRestriction<P extends object>(params: {
  readonly conversationType: string | null | undefined;
  readonly birthDate: Date | null;
  readonly now: Date;
  readonly userPreferences: readonly P[] | undefined;
}): {
  readonly viewerWriteRestriction: ViewerWriteRestriction | null;
  readonly userPreferences: readonly (P | typeof ARCHIVED_DEFAULT_PREFERENCES)[] | undefined;
} {
  const viewerWriteRestriction = viewerWriteRestrictionOf({
    conversationType: params.conversationType,
    birthDate: params.birthDate,
    now: params.now,
  });
  if (viewerWriteRestriction === null) return { viewerWriteRestriction, userPreferences: params.userPreferences };
  const stored = params.userPreferences ?? [];
  return {
    viewerWriteRestriction,
    userPreferences: stored.length > 0
      ? stored.map((row) => ({ ...row, isArchived: true }))
      : [ARCHIVED_DEFAULT_PREFERENCES],
  };
}
