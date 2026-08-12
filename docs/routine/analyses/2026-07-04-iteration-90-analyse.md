# Iteration 90 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `4caf0317` (« docs(story-sota): cycle report it.1-40 — session handoff, user decisions and
next-session queue » — HEAD au démarrage, working tree propre). Branche de travail
`claude/ecstatic-archimedes-1a4aer` alignée sur `origin/main`, 0 commit non-mergé à préserver.

PR ouvertes au démarrage : #1431 (android/contacts — friendship SSOT), #1430 (iOS a11y —
AchievementBadgeView Dynamic Type), #1429 (gateway realtime — replay edit/delete aux destinataires
offline, branche `claude/ecstatic-archimedes-y0zdju`, même famille de tâche que celle-ci mais fichiers
disjoints : `MeeshySocketIOManager.ts`/`MessageHandler.ts`/`delivery-queue.ts`). Cible retenue **hors de
tous ces fichiers** : le report explicite le plus récent du backlog routine — **F52** (itération 89,
`tasks/socketio-events-cleanup.md`/analyse 89-A), un résidu de correction gateway pur, vérifiable en
jest sans toolchain Swift/Kotlin.

## Cible : F52 — `triggerStoryTextTranslation` (légende de story) n'excluait pas la langue source de la liste des langues cibles

### Current state
`services/gateway/src/services/PostService.ts` a deux pipelines de traduction de story, tous deux
alimentés par la même SSOT `resolveAudienceTargetLanguages(authorId)` :
- `triggerStoryTextObjectTranslation` (overlays de texte) — filtre déjà
  `allTargetLanguages.filter(l => l !== sourceLanguage)` avant d'envoyer le job ZMQ (l.402).
- `triggerStoryTextTranslation` (légende/`content`) — envoyait la liste d'audience **brute** (source
  incluse) à `zmqClient.translateToMultipleLanguages`.

### Problems identified
Un auteur dont l'audience partage (au moins partiellement) sa propre langue déclenche un job de
traduction **source→source** (ex. `fr→fr`) pour chaque story avec légende. Le handler de résultat ZMQ
(`$runCommandRaw` sur `translations.<lang>`) écrit ce résultat **auto-traduit** dans
`Post.translations.fr`, écrasant potentiellement une entrée déjà cohérente avec une paraphrase NLLB de
l'original. Violation directe de la règle Prisme « Coherence » — le contenu déjà dans la langue
préférée du viewer doit rester l'original exact, jamais une resucée machine.

### Root cause
Sibling-drift (familles #40/#42/#45/#50/#55/#56/#57/#59 de `tasks/lessons.md`) : le filtre a été ajouté
sur le pipeline `textObjects` (plus récent, it.9 Task 15) mais jamais rétro-porté sur son aîné
`content`, alors que les deux partagent la même fonction de résolution d'audience et le même risque.

### Business impact
Coût réseau/compute NLLB gaspillé (job de traduction qui ne traduit rien) + dérive qualité perçue
directement par tout viewer dans la même langue que l'auteur (légende potentiellement reformulée par la
machine au lieu de rester l'original exact de l'auteur).

### Technical impact
Recalcul de `sourceLanguage` déplacé avant la résolution d'audience (au lieu d'après), puis
`targetLanguages = allTargetLanguages.filter(l => l !== sourceLanguage)` — mirror exact du sibling,
mêmes noms de variables. Zéro changement de signature, zéro requête supplémentaire, comportement
inchangé pour toute audience ne partageant pas la langue source.

### Risk assessment
TRÈS FAIBLE — adopte l'invariant déjà validé en production sur le sibling `textObjects`. Seul
changement observable : moins de jobs ZMQ envoyés (jamais plus), et plus aucune écriture
`translations.<source>`.

### Validation criteria
- `PostService.storyCaptionSourceFilter.test.ts` (neuf, 3 cas) : RED prouvé (le mock ZMQ capture la
  langue source non filtrée avant le fix), GREEN après.
- Suites `posts|Post` : 0 régression.
- `tsc --noEmit` gateway : pas de nouvelle erreur (baseline pré-existant `SequenceService.ts` →
  `@prisma/client` inchangé, confirmé identique via `git stash`).

## Résultat
✅ RED prouvé (2/3 tests neufs échouaient : liste cible non filtrée / job envoyé alors qu'il ne devrait
pas), GREEN après fix. `posts|Post` : 1128/1128 tests verts sur 51/52 suites (le seul échec,
`core.story-translation.test.ts`, est le TS2305 préexistant `@prisma/client` — confirmé identique sur
`git stash`, non lié à ce diff). `tsc --noEmit` : 1 erreur, identique avant/après (même baseline).

## Améliorations futures (report)
- **F51** : `FirebaseNotificationService` — implémentation FCM parallèle inutilisée, candidat
  suppression/consolidation (reporté itérations 87→89, toujours ouvert).
- **W3/W5** (itération 89) : composer web visibilités + préchargement média slide suivant — hors
  périmètre gateway pur de ce cycle.
