---
"@meeshy/web": patch
---

Un seul cache de liste de conversations — la forme plate sans lecteur est retirée

`queryKeys.conversations` exposait `lists()` / `list(filters)` (`['conversations','list', …]`) à
côté de `infinite()` (`['conversations','infinite']`). Les deux préfixes sont DISJOINTS, et aucun
écran ne lisait le premier : la sidebar passe par `useConversationsPaginationRQ` →
`useInfiniteConversationsQuery`. Une dizaine d'écrivains l'alimentaient quand même, à chaque
événement — autant de no-ops silencieux, et un code qui se lisait comme si deux caches étaient
tenus en phase alors qu'un seul existait.

Retirés : la clé plate, ses écrivains, les hooks sans consommateur (`useConversationsQuery`,
`useConversationsWithPagination`, les mutations create/delete de conversation) et tout
`use-send-message-mutation.ts`, dont les quatre mutations n'avaient elles non plus aucun appelant —
l'envoi réel passe par l'orchestrateur Socket.IO.

Deux corrections de comportement au passage : les `invalidateQueries` déclenchées par une réaction
ciblaient la clé plate et ne s'exécutaient donc jamais (supprimées — la ligne de liste ne dépend
d'aucune réaction de message), et `useInfiniteConversationsQuery` acceptait un `filters` que sa clé
de requête n'incluait pas, donc silencieusement ignoré.

Les témoins de `use-socket-cache-sync` qui n'assertaient que la forme plate — « déplacer la
conversation en tête », « avancer l'aperçu sur suppression », « purger la conversation refusée » —
ont été rebranchés sur le cache réellement lu, et vérifiés rouges contre une écriture cassée avant
tout retrait : le chemin que la sidebar emprunte n'avait jusqu'ici aucune couverture.
