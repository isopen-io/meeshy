---
'@meeshy/gateway': patch
---

Un `/l/<token>` qui visait une story DÉTRUITE restait actif pour toujours et redirigeait vers une page morte.

Le retrait interactif d'un post — l'app comme la console de modération — coupe ses liens de partage :
c'est le troisième effet de `applyPostRemovalEffects`, écrit il y a trois cycles, et son commentaire
en donne la raison exacte — « le soft-delete ne bascule que `deletedAt`, le `onDelete: Cascade` de
Prisma ne se déclenche jamais, les `/l/<token>` qui visent ce post resteraient donc opérationnels ».

Le balayage du contenu éphémère (`ExpiredStoriesCleanupService`) est l'AUTRE chemin qui rend un post
inatteignable, et le SEUL du gateway qui détruise réellement la ligne `Post`. Il ne coupait rien.

Rien ne pouvait le rattraper ensuite : `TrackingLink.targetId` n'a ni relation ni cascade vers
`Post` — le champ porte indifféremment un `postId`, un `conversationId` ou un `userId`, et le schéma
l'écrit. Une fois la ligne `Post` détruite, plus aucun chemin du gateway ne sait relier le lien à sa
cible disparue. Le lien survivait donc `isActive: true` : la route `/l/:token` comptait son clic,
incrémentait `totalClicks` et `lastClickedAt`, écrivait un `TrackingLinkClick`, puis redirigeait
vers une page morte — là où le même contenu retiré à la main répond 410 `LINK_INACTIVE`. Côté
résolution typée, `resolveTarget` rendait `isActive: true` avec un `targetId` que plus rien ne
résout, et la page web comme le `DeepLinkRouter` iOS ouvraient un post inexistant. Le même objet
avait deux fins de vie selon le chemin de retrait — et la plus fréquente des deux, l'expiration, que
TOUTE story finit par atteindre, était la mauvaise.

Ce défaut n'était visible qu'aujourd'hui : jusqu'au cycle précédent le balayage n'appariait aucun
post, donc aucune story n'était jamais détruite. Le rendre effectif rendait effectif ce qu'il
oubliait de faire.

La règle vit désormais dans son propre module, `posts/deactivatePostTrackingLinks.ts`, appliquée par
les deux chemins et réécrite par aucun. Trois choix y sont fixés :

- **Désactivation, jamais suppression** — les `TrackingLinkClick` sont une histoire d'audience qui
  survit à sa cible, et le tableau de bord du partageur les lit encore.
- **`allPostIds` et jamais `ids`** — un repost est détruit par la cascade de son original sans avoir
  jamais été soft-deleté pour son propre compte (son `expiresAt` est postérieur de plusieurs
  heures), et c'est justement le repost qu'on partage.
- **Avant toute destruction, et il rejette** — même contrat que ses deux voisins de bloc
  (`retractPostNotifications`, `releasePosts`) et pour la même raison : sans relation ni cascade,
  détruire les posts après une désactivation en échec laisserait des liens que plus aucun chemin
  n'atteindrait, la passe suivante ne voyant plus les posts. Le retrait interactif, lui, garde son
  régime best-effort — quand il s'exécute, `deletedAt` est déjà committé et rien ne doit transformer
  une suppression réussie en 500.

Aucune réparation rétroactive : les liens des posts détruits AVANT ce correctif restent actifs en
base. Le correctif ne vaut que pour les passes à venir.
