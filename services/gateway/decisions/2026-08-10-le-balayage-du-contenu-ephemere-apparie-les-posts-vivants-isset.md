## 2026-08-10 : Le balayage du contenu éphémère apparie les posts VIVANTS (`isSet: false`), et il connaît les DEUX types éphémères

**Statut** : Accepté

**Contexte** : `ExpiredStoriesCleanupService` tourne toutes les heures depuis sa mise en service et n'avait, en deux passes, jamais détruit une story périmée. Le cycle précédent y avait branché le retrait des notifications (ADR ci-dessus) et le lot G7 la purge des médias — sur un chemin qui ne s'exécutait pas. Trois défauts d'une même famille, dans la même fonction, dont le premier masquait les deux autres.

1. **La passe de soft-delete n'appariait aucun post.** Son filtre était `deletedAt: null`. Sur le connecteur MongoDB de Prisma, un filtre nul ne matche QUE les documents où le champ est présent-et-null ; or `post.create` n'écrit jamais cette colonne, donc sur un post vivant elle est ABSENTE. C'est exactement le piège qui avait vidé le feed, les reels et les stories en production (`data: []` sur une collection pleine) et qui a fait naître `NOT_DELETED` (`{ isSet: false }`) dans son propre module — cette passe en portait le dernier exemplaire du modèle `Post`, du côté ÉCRITURE cette fois. `softDeleted` valait 0 à chaque heure ; la passe de hard-delete, qui exige un `deletedAt` non nul, ne voyait donc que les stories supprimées à la main.
2. **Le balayage ne connaissait qu'un des deux types éphémères** (`type: 'STORY'`). Un `STATUS` expire en 1 h, disparaît bien des lectures à l'échéance, et sa ligne vivait pour toujours. La cause est une liste dupliquée entre celui qui POSE l'échéance (`PostService`) et celui qui l'HONORE.
3. **La fournée du hard-delete n'était bornée par rien** — sans conséquence tant que 1. la gardait vide.

**Décision** :
- **La vivacité se lit par `NOT_DELETED`, jamais par `deletedAt: null`.** Le filtre positif `{ not: null }` de la passe de hard-delete est correct et RESTE : la passe précédente vient d'écrire une vraie date, et l'état cherché est bien présent-et-non-null. C'est le filtre positif qui était faux, pas le négatif.
- **Les types éphémères et leurs durées vivent dans une table unique**, `services/posts/ephemeralPosts.ts`. `PostService.createPost` et le balayage en dérivent tous les deux ; la liste des types est elle-même dérivée des clés de la table des durées. Un type éphémère ajouté là reçoit son échéance ET son balayage.
- **La fournée du hard-delete est bornée** (500 posts, réglable par constructeur), prise du plus anciennement périmé au plus récent. Le seuil est exprimé en posts alors que ce qu'il protège se compte en notifications : le retrait rejette au-delà de 40 000 lignes, et 500 × 40 en laisse la moitié de marge. Une fournée pleine est journalisée.
- **Le nom de la classe reste `ExpiredStoriesCleanupService`** alors qu'elle balaie aussi les statuts : des plans et analyses archivés le citent, et les réécrire fausserait des archives. La doc de classe porte la correction ; la liste des types balayés est celle de `ephemeralPosts.ts`, pas celle du nom.

**Alternatives rejetées** :
- **Balayer sur `expiresAt` seul, sans filtre de type.** Équivalent aujourd'hui (seuls les types éphémères reçoivent une échéance) et sans liste à tenir à jour, mais il avalerait silencieusement tout futur post permanent auquel on donnerait une échéance pour une autre raison. La liste explicite est greppable et refuse ce genre d'élargissement tacite.
- **Renommer la classe en `ExpiredEphemeralPostsCleanupService`.** Le gain de justesse ne compense pas l'invalidation de six documents d'archive qui la citent nommément.
- **Rattraper le passif par un script de migration.** La borne fait converger le rattrapage d'elle-même, passe après passe, sans accès MongoDB ni fenêtre de maintenance.
- **Une fournée non bornée avec un plafond de retrait relevé.** Déplace le mur sans le supprimer, et fait grossir le pic de lectures concurrentes que le plafond existe justement pour borner.

**Conséquences** :
- **Le balayage devient effectif pour la première fois.** À la mise en production, il rattrape tout le passif — stories périmées jamais détruites et statuts jamais balayés — par fournées de 500 posts par heure, soit 12 000 par jour. Les effets branchés en aval (purge des médias G7, libération des usages de sons, retrait des notifications) s'exécutent enfin, sur un volume de rattrapage nettement supérieur au régime permanent.
- **La récupération de disque est différée, jamais perdue.** Une fournée pleine signale qu'il reste du passif ; c'est le signal que le cycle précédent notait comme manquant.
- **Ce que la décision n'assure PAS** : aucune réparation rétroactive des lignes déjà orphelines (médias au `postId` nul, usages de sons, notifications de posts détruits à la main avant ce correctif) ; les `TrackingLink` d'une story détruite ne sont toujours pas désactivés par cette passe ; la fenêtre d'archive auteur de `getStatuses` n'existe pas comme celle des stories, et le soft-delete rend désormais un statut périmé invisible à son auteur dès l'heure suivante — ce qui était déjà le cas de fait puisque `getStatuses` filtre l'expiration.

**Tests** : 13 neufs (`ExpiredStoriesCleanupService.ephemeral.test.ts`), dont 3 sur la table des durées elle-même. Sondes de fidélité en cinq temps — `NOT_DELETED` → `null` : 2 rouges ; type scalaire au soft-delete : 2 ; type scalaire au hard-delete : 3 ; borne retirée : 3 ; `STATUS` retiré de la table : 3. Le double Prisma HONORE le filtre de type au lieu de rendre la même ligne quelle que soit la question — sans cela le témoin de bout en bout restait vert sur un balayage borné aux stories.
