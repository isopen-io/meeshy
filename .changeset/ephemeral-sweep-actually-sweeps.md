---
'@meeshy/gateway': patch
---

Le balayage du contenu éphémère balaie enfin — il n'appariait aucun post, et il n'en connaissait qu'un type sur deux.

`ExpiredStoriesCleanupService` tourne toutes les heures depuis sa mise en service et n'a, en deux
passes, jamais détruit une story périmée. Trois défauts d'une même famille, tous dans la même
fonction, dont le premier masquait les deux autres.

**D1 — la passe de soft-delete n'appariait aucun post.** Son filtre était
`deletedAt: null`. Sur le connecteur MongoDB de Prisma, ce filtre ne matche que les documents où le
champ est **présent-et-null** ; or `post.create` n'écrit jamais cette colonne, donc sur un post
vivant elle est **ABSENTE**. Tout le reste du dépôt lit la vivacité par `NOT_DELETED`
(`{ isSet: false }`), dont le module dédié existe précisément parce que le filtre naïf avait déjà
vidé le feed, les reels et les stories en production — toutes les routes renvoyaient `data: []`
sur une collection pleine. Cette passe en portait le dernier exemplaire du modèle `Post`, du côté
ÉCRITURE cette fois : au lieu de masquer tous les posts vivants d'une lecture, il les excluait tous
d'un balayage. `softDeleted` valait 0 à chaque heure. Et comme la passe de hard-delete exige un
`deletedAt` non nul, elle ne voyait par conséquent que les stories supprimées **à la main** : ni la
purge des médias (G7), ni la libération des usages de sons, ni le retrait des notifications
(cycle 53) ne s'étaient jamais appliqués à une story périmée.

**D2 — le balayage ne connaissait qu'un des deux types éphémères.** Il filtrait `type: 'STORY'`.
Un `STATUS` (mood) expire en 1 h, disparaît bien des lectures à l'échéance
(`getStatuses`/`getDiscoverStatuses` filtrent `expiresAt > now`), et sa ligne vivait pour toujours —
avec ses médias, ses usages de sons et ses notifications. La cause est une liste dupliquée : celui
qui POSE l'échéance (`PostService`) et celui qui l'HONORE en portaient chacun sa copie, et elles
avaient divergé. Les deux dérivent désormais d'une table unique, `posts/ephemeralPosts.ts` : un type
éphémère ajouté là reçoit son échéance ET son balayage.

**D3 — la fournée du hard-delete n'était bornée par rien**, ce qui était sans conséquence tant que
D1 la gardait vide. Corrigée, la première passe affronte tout l'historique. Or le retrait des
notifications **rejette** à son plafond de drainage (40 000 lignes) et s'exécute AVANT toute
destruction : sans borne il aurait renoncé, rien n'aurait été détruit, et la passe suivante aurait
retrouvé le même ensemble — non pas lente, bloquée. La fournée est bornée à 500 posts (réglable),
prise du plus anciennement périmé au plus récent, et une fournée pleine est journalisée : le
rattrapage converge en passes horaires au lieu d'échouer d'un bloc.

Le nom de la classe ne dit toujours que « Stories » et reste inchangé volontairement — des plans et
des analyses archivés le citent. La liste des types balayés est celle de `ephemeralPosts.ts`, pas
celle du nom.

Aucune réparation rétroactive : le correctif ne vaut que pour les passes à venir, qui rattraperont
d'elles-mêmes le passif accumulé, fournée par fournée.
