## Leçon 73 — Une piste héritée peut être vraie sur le défaut et fausse sur son remède (2026-08-10, routine messaging, cycle 52)

Le cycle 51 léguait une piste bien formée : « le même mécanisme a un sixième candidat, la
suppression d'un commentaire ; `context.commentId` est écrit par sept types ». La leçon 18 dit d'en
faire une hypothèse à réfuter. Réfutation tentée sur le **défaut** : confirmé. Mais la piste
énonçait aussi, en passant, comment le corriger — et c'est là qu'elle était fausse.

Deux des huit types producteurs (`post_comment` et `comment_like`) n'écrivent PAS
`context.commentId` : leur lien ne vit que dans `metadata.commentId`. Le premier est la notification
la plus fréquente de toute la famille. Un retrait transposé littéralement du jumeau côté post — qui
ne connaît que `context.<clé>` — aurait laissé la majorité du volume en base, **en passant tous ses
tests**, puisque les tests auraient été écrits sur la même énumération erronée.

Ce que ça change à la méthode : la leçon 18 dit de vérifier qu'une piste désigne un vrai défaut.
Elle ne suffit pas. **Le remède qu'une piste suggère est une seconde hypothèse, indépendante de la
première, et elle se réfute par le même geste : relire les écrivains un par un.** Une piste qui
énumère des sites (« sept types écrivent cette clé ») est une liste transcrite de mémoire par la
session précédente — le format même dont la leçon 71 dit qu'il ne montre pas ce qui lui manque.

La trace de l'asymétrie était dans le code depuis longtemps, à un endroit qu'on ne lit pas comme
une alerte : le payload APNs fait `params.context.commentId || params.metadata.commentId`. **Un
repli entre deux chemins est l'aveu écrit qu'aucun des deux n'est complet.** Chercher les `||`
entre deux accès de forme parallèle est un moyen bon marché de trouver les colonnes dont le nom
promet plus que les écrivains ne tiennent.
