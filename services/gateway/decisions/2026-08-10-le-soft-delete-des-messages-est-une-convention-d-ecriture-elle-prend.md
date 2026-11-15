## 2026-08-10 : Le soft-delete des messages est une convention d'ÉCRITURE — elle prend un nom

**Statut** : Accepté

**Contexte** : deux modèles de ce dépôt portent une colonne de soft-delete `deletedAt DateTime?`, et ils ont résolu le même piège MongoDB par deux moitiés opposées.

`Post` a choisi le côté LECTURE. Un post vivant n'a pas de colonne `deletedAt` du tout, et toutes ses requêtes apparient l'ABSENCE (`NOT_DELETED` = `{ isSet: false }`, `services/posts/softDelete.ts`). Le filtre naïf `deletedAt: null` n'apparie que le présent-et-null : appliqué à ce modèle il ne rend AUCUN post vivant, ce qui a vidé feed / reels / stories en production — le post-mortem est en tête de `services/posts/postIncludes.ts`, et le cycle 54 a retrouvé le dernier exemplaire du piège dans le balayage du contenu éphémère, où il rendait la passe entièrement inerte.

`Message` a choisi le côté ÉCRITURE. Ses lectures — ~119 sites : aperçu de conversation, compte de non-lus, delta `/sync`, admission d'édition et de suppression, statistiques — filtrent toutes `deletedAt: null`, et c'est CHAQUE créateur qui rend ce filtre vrai en écrivant la colonne à `null`. Le choix est cohérent et fonctionne ; il a seulement un défaut de forme : il n'était porté par aucun nom. Sept `message.create` répartis dans six fichiers répétaient le littéral, chacun pour son compte, sans qu'aucun ne dise pourquoi.

**Deux d'entre eux l'avaient perdu** : `CallService.createCallSummaryMessage` et `CallService.createLiveCallMessage`. Les lignes qu'ils écrivaient n'étaient donc appariées par aucune des lectures ci-dessus — un « Appel audio en cours » ne devenait jamais l'aperçu de sa conversation, un « Appel manqué » ne faisait monter aucun badge, et les deux étaient absents du delta `/sync` et introuvables à l'édition comme à la réaction. Aucune suite ne pouvait le voir : la sonde de fidélité de ce cycle a montré que vider l'invariant ne faisait tomber AUCUN témoin pré-existant, sur aucun des sept chemins.

**Décision** :
- **La convention prend un nom** : `LIVE_MESSAGE_MARK` (`services/messaging/liveMessage.ts`), étalé par les sept créateurs. Son en-tête écrit l'asymétrie entre les deux modèles, qui est la seule chose qu'un huitième créateur a besoin de savoir.
- **Un témoin sur la SOURCE, pas sept sur les créateurs.** Les sept étalant la même constante, un témoin unique sur `LIVE_MESSAGE_MARK` (présent-et-null, et rien d'autre) les tient tous ; deux témoins sur `CallService` prouvent séparément que l'étalement a bien lieu là où il manquait.
- **Aucun changement de schéma.** `deletedAt` reste `DateTime?`. Ce qui est écrit est l'état VIVANT explicite, pas une valeur par défaut que Prisma poserait — il ne le fait pas.

**Alternatives rejetées** :
- **Ajouter le littéral aux deux sites fautifs et s'arrêter là.** Corrige les symptômes et laisse intacte la cause : sept copies d'une règle sans propriétaire, dont la prochaine divergence sera aussi silencieuse que celle-ci.
- **Basculer les lectures du modèle `Message` sur `NOT_DELETED`** pour aligner les deux modèles côté lecture. Ce serait le geste symétrique, et il est faux ici : les messages EXISTANTS portent tous un `deletedAt` présent-et-null écrit par leurs créateurs, donc `{ isSet: false }` ne les apparierait PAS. Un tel alignement demanderait une migration de données avant la première ligne de code, et rendrait tous les messages invisibles entre les deux. C'est l'erreur inverse du post-mortem de `postIncludes.ts`, avec les mêmes conséquences.
- **Un `@default` Prisma sur la colonne.** Prisma n'écrit pas de valeur par défaut `null` pour un champ optionnel, et l'ajouter ne réparerait aucune ligne déjà écrite.
- **Le prédicat défensif `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]`** sur les 119 lectures — l'idiome que ce dépôt emploie déjà pour `leftAt`, `expiresAt` et `parentId`. Il rendrait les deux modèles indifférents à la convention d'écriture, ce qui est la solution de fond. Écarté pour ce cycle : 119 sites, aucun témoin existant sur l'invariant, et une passe qui ne serait plus un correctif mais une réécriture des lectures de messages. La constante nommée en est le préalable — elle rend l'invariant greppable, donc cette passe planifiable.

**Conséquences** :
- **Les messages d'appel deviennent des messages ordinaires** pour l'aperçu, le badge de non-lus, `/sync` et la réaction. C'est un changement observable : une conversation dont le dernier événement est un appel remonte désormais dans la liste avec le bon libellé, et un appel manqué badge.
- **Aucune réparation rétroactive.** Les messages d'appel déjà écrits sans la colonne restent invisibles de ces lectures. Ils sont réparables par un `updateMany` sur `messageSource: 'system'` + `clientMessageId` préfixé `call-summary:` dont la colonne est absente — sur le patron de `repair-mention-user-ids.ts`. Action humaine : cette routine n'a aucun accès MongoDB.
- **Ce que la décision n'assure PAS** : les 119 lectures restent dépendantes de la discipline des créateurs ; rien n'empêche mécaniquement un huitième `message.create` d'omettre le marqueur — seul le prédicat défensif ci-dessus le ferait, et il reste à instruire.

**Tests** : 4 neufs — 2 sur la source (`liveMessage.test.ts` : présent-et-null, et rien d'autre) et 2 sur les deux créateurs qui l'avaient perdu (`CallService.summary.test.ts`, `CallService.liveMessage.test.ts`). Sondes de fidélité en trois temps — marqueur retiré du résumé d'appel : 1 rouge, le témoin jumeau reste vert ; retiré du message vivant : 1 rouge, symétrique ; constante vidée (`{}`) : 2 rouges et RIEN d'autre sur 45 suites voisines, ce qui a établi que l'invariant n'était couvert nulle part et motivé le témoin de source. Gate complet : 643 suites / 16 273 tests verts, `tsc --noEmit` 0 erreur.
