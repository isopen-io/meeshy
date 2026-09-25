## Leçon 75 — avant d'étendre un mécanisme, vérifier qu'il s'exécute (2026-08-10, routine messaging, cycle 54)

Le backlog demandait d'étendre le balayage du contenu éphémère aux posts `STATUS`, que rien ne
nettoie. La tête était juste. Mais en lisant ce que ce balayage faisait des `STORY` — le type qu'il
connaît — il s'est avéré qu'il n'en faisait rien : son filtre de soft-delete était `deletedAt: null`
sur une colonne dont l'état vivant est ABSENT, donc il n'appariait aucun post, donc la seconde passe
(qui exige un `deletedAt` non nul) ne voyait que les stories supprimées à la main. Trois cycles de
travail — purge des médias G7, libération des usages de sons, retrait des notifications du cycle 53 —
avaient été branchés sur un chemin mort, et chacun avait été validé par des tests qui doublent
Prisma et ne peuvent donc pas voir qu'un `where` n'apparie rien.

**Leçons :**

1. **Étendre un mécanisme suppose qu'il marche. Le vérifier coûte une lecture ; ne pas le vérifier
   coûte le cycle entier.** Avant d'ajouter un cas à une passe/un job/un handler, lire son chemin
   nominal en entier et se demander « qu'est-ce qui prouve que ceci s'exécute aujourd'hui ? ». Un
   job périodique n'a pas d'utilisateur pour signaler qu'il ne fait rien : son silence est
   indistinguable de son succès. Ici le tell était dans le code même — `softDeleted` retourné,
   journalisé, et jamais autre chose que 0.
2. **Un double de base de données ne teste jamais qu'un prédicat apparie.** Les suites qui couvrent
   cette passe étaient nombreuses, précises et vertes : elles vérifient l'ORDRE des effets, les
   `$in`, les cascades. Aucune ne pouvait attraper un `where` qui ne matche rien, parce que le
   double rend ce qu'on lui dit de rendre. Le prédicat lui-même n'est vérifiable que par lecture,
   contre la sémantique RÉELLE du connecteur — ou par un test d'intégration sur une vraie base,
   qu'aucune de ces suites n'est.
3. **Quand un dépôt a payé un piège une fois, chercher ses derniers exemplaires.** `deletedAt: null`
   sur MongoDB avait déjà vidé le feed en production, ce qui a produit `NOT_DELETED` dans son propre
   module ET un commentaire de post-mortem. Le cycle précédent venait de corriger la même erreur sur
   `firstMessageSentAt` en revue pré-merge. Un `grep "deletedAt: null"` sur le modèle concerné aurait
   trouvé le survivant en une commande — et il en restait exactement un. **Un piège documenté est une
   requête à lancer, pas seulement une leçon à retenir.**
4. **Réparer une chose morte peut en éteindre une vivante.** `getStories` renvoie à un auteur ses
   stories périmées pendant sept jours, sous garde `deletedAt: NOT_DELETED` — fonctionnalité qui ne
   marchait QUE parce que le soft-delete était inert. La réparer telle quelle aurait vidé « Mes
   stories » en une heure. Avant de rendre effectif un code qui ne s'exécutait pas, énumérer qui
   dépendait de son inertie : chercher les lectures gardées par le champ que le code mort allait
   se mettre à écrire.
5. **Une sonde de fidélité qui ne fait tomber que les témoins « de forme » dénonce le témoin « de
   comportement ».** La sonde D2b faisait rougir les deux assertions sur la forme du `where` et
   laissait VERT le témoin de bout en bout — parce que son double rendait la même ligne quelle que
   soit la question. Quand une sonde épargne le témoin le plus intégratif, ce n'est pas que celui-ci
   est redondant : c'est qu'il ne discrimine pas. Faire honorer le filtre par le double, puis
   re-sonder.
6. **Comparer à une BASELINE mesurée, pas à un total mémorisé.** L'environnement portait 20 suites
   qui ne compilent pas pour une raison sans rapport. Annoncer « 620 vertes » contre les « 639 »
   d'un cycle précédent aurait été ininterprétable. Relancer la suite complète sur l'arbre propre
   (`git stash`) et comparer les LISTES de suites en échec transforme une impression en preuve —
   et ne coûte qu'un second passage.
