# Cycle 22 — `translation:request` : le chemin cache parlait une langue qu'aucun client ne lit

Routine « amélioration continue temps réel ». Le cycle 21 (PR #3012/#3013) avait
fermé le rejeu HORS LIGNE de `message:translation`. Ce cycle repart du MÊME
événement par l'autre bout : non plus « qui le reçoit », mais **quelle forme il
a selon le chemin qui l'émet**.

## Constat

**D1 — `SERVER_EVENTS.MESSAGE_TRANSLATION` avait deux constructeurs, et un seul
respectait le contrat.**

`_handleTextTranslationReady` (retour ZMQ, cache MISS) émettait un
`TranslationEvent` correct. La branche CACHE de `_handleTranslationRequest` —
la réponse à un `translation:request` explicite — construisait sa propre charge
utile : `{ messageId, translatedText, targetLanguage, confidenceScore }`. Ni
tableau `translations`, ni le nom `translatedContent` que `TranslationData`
porte.

Or le web sort de `handleTranslationEvent` par un `return` nu dès qu'il ne
trouve ni `translation` ni `translations`, et iOS décode `TranslationEvent` dont
`translations` n'est pas optionnel. Des deux côtés, l'événement disparaît **en
silence**.

Effet : « traduire ce message » ne faisait RIEN quand la traduction était déjà
en cache — le chemin censé être instantané. Elle ne « marchait » que sur cache
MISS. Le Prisme Linguistique devenu fonction de l'état du cache serveur.

**Pourquoi ça a survécu** : le test de cette branche assertait la forme cassée
(`translatedText` à la racine). Récidive du D4 du cycle 7.

## Correctifs

- [x] `socketio/buildTranslationEvent.ts` — constructeur UNIQUE des deux chemins
- [x] `cached` dit la provenance au lieu d'un `false` en dur
- [x] `id` unique par émission (le web déduplique sur `messageId_id`)
- [x] `confidenceScore` par `??` (une confiance de 0 est une valeur)
- [x] Web : le `return` silencieux devient un `logger.warn` nommant les clés
- [x] Le test qui figeait la forme cassée énonce le contrat

## Gates

- [x] 1 RED discriminant vu rouge avant correctif
- [x] 11 témoins sur le constructeur, 2 côté web
- [x] `MeeshySocketIOManager.test.ts` : 337 verts (336 pré-existants inchangés)
- [x] Suite gateway complète verte
- [x] Web : 63 suites / 2215 verts
- [x] `tsc --noEmit` gateway 0 ; web 1229 = base pré-existante inchangée
- [x] CHANGELOG + journal d'audit (§ Cycle 22)

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 22 — méthode (deux
matrices d'events), défaut, correctif, et les 5 surfaces vérifiées correctes à
ne pas re-instruire.


# Cycle 24 — la présence payait le serveur entier pour savoir qui l'avait bloquée

Routine « amélioration continue temps réel ». Les cycles 21–23 avaient pris
`message:translation` puis `conversation:updated`. Ce cycle change de famille
(`user:status`, la présence) et de QUESTION : non plus « qui reçoit / quelle
forme / pour qui est-ce juste », mais **en fonction de quoi le coût d'une
diffusion grandit**.

## Constat

**D1 — une transition de présence portait un `$in` dimensionné par la gateway.**

`_broadcastUserStatus` passait `[...connectedUsers.keys()]` — toute la
population connectée — en liste de candidats à `getBlockedUserIdsAmong`. La
forme `$in` de cette sonde est juste pour une AUDIENCE ; ici c'était le serveur.

Le chemin s'exécute à chaque connexion, chaque déconnexion, et en rafale au
balayage `updateOfflineUsers`. Le coût d'UNE connexion grandissait donc avec le
nombre de personnes déjà connectées → quadratique en connexions.

Second terme, synchrone : `ids.includes(bid)` dans une boucle sur
`blockedUserIds` — `|blocked| × |connectés|` comparaisons sur la boucle
d'événements, à chaque transition.

**Pourquoi ça a survécu** : la règle a DEUX implémentations et l'autre est juste
(`StatusHandler._getBlockedSocketIdsInRoom` borne ses candidats aux participants
de la conversation, et dit s'aligner sur `_broadcastUserStatus`). Les deux
rendent le même résultat ; elles ne diffèrent que par la TAILLE de la liste de
candidats — la seule propriété qu'aucun test ne regardait.

## Correctifs

- [x] `utils/blocking.ts` — `getBlockRelatedUserIds` : relation de blocage
      complète, SANS liste de candidats, bornée par la relation elle-même
- [x] `getBlockedUserIdsAmong` conservé (sa forme `$in` est juste pour ses 3
      autres appelants, dont les candidats sont de vraies audiences)
- [x] `ids.includes` → `Set` dans `getBlockedUserIdsAmong` (bénéficie à tous)
- [x] `@@index([blockedUserIds])` sur `User` — sans lui le nouveau chemin serait
      déplacé, pas borné
- [x] Échange neutre en comportement : l'intersection avec les sockets vivants
      se fait en mémoire au lieu d'en base

## Gates

- [x] 1 RED discriminant vu rouge avant correctif (vérifié en restaurant le code
      pré-correctif, puis restauré)
- [x] `blocking.test.ts` : 17 verts (12 pré-existants + 5 témoins)
- [x] `MeeshySocketIOManager.test.ts` : 339 verts (337 pré-existants inchangés)
- [x] `prisma validate` : schéma valide avec le nouvel index
- [x] `tsc --noEmit` gateway : 0
- [x] Suite gateway complète : 718 suites / 17588 tests verts
- [x] CHANGELOG + journal d'audit (§ Cycle 24)

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 24 — les quatre sondes
(dont deux neuves : contrat d'ACK, `CLIENT_EVENTS` × écouteurs gateway), le
défaut, le correctif, et les quatre surfaces vérifiées correctes à ne pas
re-instruire.

# Cycle 25 — le client choisissait l'adresse de la diffusion

Routine « amélioration continue temps réel ». Les cycles 21–24 ont pris
`message:translation`, `conversation:updated` et `user:status`. Ce cycle change
de famille (les réactions sociales) et de QUESTION : non plus « qui reçoit /
quelle forme / combien ça coûte », mais **d'où vient l'ADRESSE d'une diffusion**.

## Constat

**D1 — `comment:reaction-*` diffusait vers le `postId` du payload CLIENT.**

Le handler tient déjà la vérité (`loadCommentPostAcl` lui rend le post du
commentaire, pour son verdict d'audience) et la jetait. Conséquences : sur un
repost simple l'événement partait vers une room vide (les lecteurs sont dans
celle de la racine, où le commentaire vit aussi) — silencieux, ACK `success` ;
et un `postId` arbitraire injectait l'agrégation d'un commentaire dans le cache
d'un post étranger.

Survécu parce que `PostReactionHandler` implémente la MÊME règle correctement
(`targetPostId`) : les deux copies coïncident en nominal et ne diffèrent que là
où aucun test ne regardait. Un mock incohérent figeait même le défaut.

**D2 — les deux `handleRequestSync` n'avaient aucune garde d'audience.**

La garde de la room ne bornait rien : au lieu de s'abonner, il suffisait de
demander l'état. Le versant commentaire rend les `userIds` de chaque réacteur —
roster nominatif d'un commentaire sur un post `PRIVATE`, à partir du seul
`commentId`.

## Correctifs

- [x] `CommentReactionHandler` — room, payload et notification portent
      `thread.postId` (déjà chargé, zéro requête ajoutée), add ET remove
- [x] `CommentReactionHandler.handleRequestSync` — garde `canUserConsumePost`
- [x] `PostReactionHandler.handleRequestSync` — garde `resolveConsumptionTarget`
      (audience + redirection repost), refus indistinct
- [x] Mock d'ACL du doublon de test aligné sur un monde possible

## Gates

- [x] 10 RED discriminants vus rouges avant correctif (6 D1 + 4 D2)
- [x] 4 suites de réactions : 140 verts
- [x] Suite gateway complète : 719 suites / 17608 tests verts
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + journal d'audit (§ Cycle 25) + leçon 257

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 25 — la sonde neuve
(« autorité de l'entrée »), la matrice handlers × adresse, les deux défauts, et
les quatre surfaces vérifiées correctes à ne pas re-instruire.
