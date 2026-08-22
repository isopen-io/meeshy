/**
 * Mise en forme des communautés pour la réponse HTTP.
 */

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
