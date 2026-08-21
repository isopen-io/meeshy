/**
 * Ce qu'un participant a le droit de faire, résolu une seule fois.
 *
 * Deux couches, et leur ordre est le sujet :
 *
 * - `Participant.permissions` est un INSTANTANÉ pris au join, recopié depuis le
 *   lien de partage emprunté (`routes/anonymous.ts`). Il ne suit pas le lien :
 *   un hôte qui décoche `allowAnonymousFiles` après coup ne retire rien à qui
 *   est déjà entré.
 * - `anonymousSession.rights` est un DELTA posé par l'hôte sur CE participant.
 *   Un droit qu'il ne nomme pas n'est pas « faux », il est « non dit » : il
 *   suit l'instantané. C'est ce qui permet d'ouvrir un seul droit sans geler
 *   les six autres à leur valeur du moment.
 *
 * `??` porte exactement cette sémantique — `false` est une réponse, `undefined`
 * une abstention. Ne jamais le remplacer par `||`, qui confondrait les deux et
 * rendrait tout droit fermé par surcharge impossible à distinguer d'un silence.
 *
 * Extrait de `middleware/auth.ts`, qui en était le seul porteur. La fiche de
 * participant et le plancher d'historique posent la même question : trois
 * lecteurs de la même règle divergeraient.
 */

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

/**
 * Le delta que l'hôte pose sur un participant. Tout champ est facultatif.
 *
 * `null` y est admis autant qu'`undefined` : sur le connecteur MongoDB, un
 * `Boolean?` de type composite se relit `null`, jamais `undefined`. Les deux
 * disent la même chose — « non dit » — et `??` les traite identiquement. Écrire
 * `Partial<ParticipantPermissions>` ici ferait mentir la signature sur ce que
 * Prisma rend réellement.
 */
export type ParticipantRightsOverride = {
  readonly [K in keyof ParticipantPermissions]?: boolean | null;
};

/** Ce qu'il faut d'une ligne `Participant` pour répondre à la question. */
export type ParticipantRightsSource = {
  readonly permissions: ParticipantPermissions;
  readonly anonymousSession?: { readonly rights?: ParticipantRightsOverride | null } | null;
};

export function resolveParticipantRights(
  participant: ParticipantRightsSource,
): ParticipantPermissions {
  const { permissions } = participant;
  const rights = participant.anonymousSession?.rights;
  if (!rights) return { ...permissions };

  return {
    canSendMessages: rights.canSendMessages ?? permissions.canSendMessages,
    canSendFiles: rights.canSendFiles ?? permissions.canSendFiles,
    canSendImages: rights.canSendImages ?? permissions.canSendImages,
    canSendVideos: rights.canSendVideos ?? permissions.canSendVideos,
    canSendAudios: rights.canSendAudios ?? permissions.canSendAudios,
    canSendLocations: rights.canSendLocations ?? permissions.canSendLocations,
    canSendLinks: rights.canSendLinks ?? permissions.canSendLinks,
  };
}
