## Leçon 109 — une invalidation qui ne matche aucun cache est une PANNE, et sa correction n'est pas de la rebrancher (2026-08-11, routine messaging, cycle 78)

`use-reactions-query.ts` invalidait `conversations.lists()` sur chaque réaction, commentaire
explicite à l'appui (« réaction ajoutée = conversation modifiée »). La sidebar lit
`conversations.infinite()` : préfixes disjoints, donc **l'intention déclarée n'a jamais été
exécutée**. C'est pire que du code mort : le commentaire fait foi pour le prochain lecteur.

Le réflexe est de rebrancher sur la bonne clé. Deux questions AVANT :

1. **L'intention est-elle vraie ?** Ici non : une ligne de liste ne porte rien qui dérive des
   réactions. Le piège était un homonyme — `ConversationList` rend bien un `reaction`, mais
   c'est l'emoji de PRÉFÉRENCE de conversation, sans aucun rapport. Vérifier ce que la vue
   AFFICHE, pas ce que le nom suggère.
2. **Que coûterait la version qui marche ?** Sur un cache `infinite`, une invalidation relit
   TOUTES les pages chargées. Rebrancher aurait réintroduit, sur chaque réaction, le refetch que
   le cycle précédent venait de retirer du chemin de focus.

Quand les deux réponses sont « non » et « cher », le correctif est la SUPPRESSION. Une
invalidation morte qu'on répare sans rouvrir son intention devient une régression de perf
présentée comme un correctif.

Corollaire de test : une `invalidateQueries` ne refetch que les requêtes ACTIVES. Un témoin qui
pose son cache à la main (`setQueryData`, `fetchQuery`) reste muet et passe au vert sans rien
prouver. Il faut monter de VRAIS observateurs — et sur les DEUX formes de clé, pour que le
témoin échoue aussi bien sur l'invalidation morte que sur sa « correction » coûteuse.
