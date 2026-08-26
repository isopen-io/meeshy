/**
 * Mise en forme des communautés pour la réponse HTTP.
 */
import { userMinimalSchema } from '@meeshy/shared/types/api-schemas';

type CommunityWithCount = {
  _count: { members: number; Conversation: number };
  members?: unknown;
  [key: string]: unknown;
};

/**
 * Aplatit l'agrégat Prisma `_count` vers les champs `memberCount` /
 * `conversationCount` que `communitySchema` déclare.
 *
 * Toute route qui rend une communauté DOIT passer par ici avant `reply.send` :
 * fast-json-stringify sérialise strictement contre le schéma de réponse et
 * laisse tomber sans bruit l'objet brut `_count`, qu'aucun schéma ne déclare —
 * sans l'aplatissement le client lit toujours 0. `members` est retiré au
 * passage : `communitySchema` ne le porte pas, le sérialiseur l'effacerait de
 * toute façon.
 *
 * C'est la même loi que celle qui vidait `creator` et `members[]` en `{}` sur
 * `GET /communities/search` (§ « Un schéma de réponse sans `properties`
 * EFFACE » dans le CLAUDE.md de la passerelle) : le schéma de réponse décide
 * seul de ce qui sort, et un champ que la requête produit sous un autre NOM
 * n'existe pas pour lui.
 */
export function flattenCommunityCounts(community: CommunityWithCount) {
  const { _count, members: _members, ...rest } = community;
  return {
    ...rest,
    memberCount: _count.members,
    conversationCount: _count.Conversation
  };
}

/**
 * Schéma de réponse d'UNE conversation de communauté — la liste FERMÉE que
 * servent `GET /communities/:id/conversations` (par élément) et
 * `POST /communities/:id/conversations/:conversationId` (l'objet rendu).
 *
 * Les deux handlers chargent la conversation par le MÊME `include`
 * (`participants`, dont `user` en `select`), et un `include` rend TOUTES les
 * colonnes scalaires de `Participant` : sa propre présence (`isOnline`,
 * `lastActiveAt` de la ligne), mais aussi `sessionTokenHash` — le SHA-256 du
 * jeton de session anonyme — et le composite `anonymousSession` (adresse IP,
 * empreinte d'appareil). Seule une liste fermée les retient à la
 * sérialisation : la route POST a servi `additionalProperties: true` jusqu'au
 * 2026-08-26 et publiait tout cela à l'admin qui rattachait la conversation.
 * Un site UNIQUE, pour que la seconde route ne puisse plus rouvrir ce que la
 * première ferme.
 *
 * Le handler produit `participants`, jamais `members` (le schéma d'origine
 * déclarait l'inverse), et `user` doit porter `userMinimalSchema` : un
 * `{ type: 'object' }` nu est vidé en `{}` par fast-json-stringify.
 */
export const communityConversationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    identifier: { type: 'string', nullable: true },
    title: { type: 'string', nullable: true },
    type: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    banner: { type: 'string', nullable: true },
    isActive: { type: 'boolean', nullable: true },
    memberCount: { type: 'number', nullable: true },
    lastMessageAt: { type: 'string', format: 'date-time', nullable: true },
    communityId: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    participants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string', nullable: true },
          displayName: { type: 'string', nullable: true },
          role: { type: 'string', nullable: true },
          isActive: { type: 'boolean', nullable: true },
          user: { ...userMinimalSchema, nullable: true }
        }
      }
    },
    _count: {
      type: 'object',
      properties: {
        messages: { type: 'number' },
        participants: { type: 'number' }
      }
    }
  }
} as const;
