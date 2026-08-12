# Iteration 77 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `62fc3b73` (branche locale périmée resynchronisée `--hard` sur `origin/main`).
Branche de travail `claude/brave-archimedes-ym9yvf` recréée à neuf depuis `origin/main`
(`git checkout -B ... origin/main`).

PR ouvertes au démarrage : #1341 (`MessageReadStatusService` dedup key), #1339 (`StatusHandler`
identityCache borné — itération 76), #1338 (`call:heartbeat` authz), #1337 (iOS a11y StoryViewer),
#1335 (races broadcast realtime + cache conversationId borné). Aucune ne touche
`MessageTranslationService` → cible choisie **indépendante** (0 conflit de merge attendu).

Revue Priorité 1 (features récentes / audit realtime en cours) : les follow-ups #41–43 de
l'audit realtime (PR #1335, `tasks/lessons.md`) restaient ouverts. #42 est traité par la PR #1339.
**#43 (race d'ordonnancement de la retraduction après édition de message)** est retenu ici :
gateway TypeScript (testable localement), impact direct sur le **Prisme Linguistique** (règle
critique n°1), indépendant des PR ouvertes.

## Cible iter 77 — Race d'ordonnancement des réponses de retraduction après édition (#43)

### Current state
À chaque `message:edit` (`MessageHandler.handleMessageEdit`), le contenu est réécrit,
`translations` remis à `null`, et `retranslateMessageAsync` déclenche une retraduction
fire-and-forget → requête ZMQ vers le translator → réponse asynchrone `translationCompleted` →
`_saveTranslationToDatabase` écrit la traduction dans `Message.translations` (JSON), sérialisé par
`messageTranslationMutex` (protège du *lost update*, PAS de l'ordonnancement).

La déduplication `processedTasks` (clé `taskId_lang`) empêche le double-traitement du **même**
taskId, mais deux éditions rapides produisent **deux taskIds distincts**.

### Problem identified
Deux éditions rapprochées (ou l'édition qui court avec la traduction initiale) génèrent deux
requêtes ZMQ. Les réponses peuvent **arriver dans le désordre** (le translator est un pool de
workers concurrents ; rien ne garantit l'ordre FIFO des `translationCompleted` par message).
Si la réponse d'un **contenu périmé** (édition A) arrive **après** celle du contenu courant
(édition B), elle **écrase** la bonne traduction :

```
edit A → contenu "A", retranslate task T_A
edit B → contenu "B", retranslate task T_B          (T_B est le dernier voulu)
T_B complete → translations[fr] = traduction("B")   ✅
T_A complete (en retard) → translations[fr] = traduction("A")   ❌ périmé
```

Résultat : `Message.content == "B"` mais `translations[fr]` traduit "A" → le lecteur voit une
traduction qui ne correspond pas au message (violation directe du Prisme Linguistique).

### Root cause
Aucun **ordering guard** : `_handleTranslationCompleted` accepte tout résultat non-dupliqué sans
vérifier qu'il correspond bien à la **dernière** (re)traduction dispatchée pour ce message.
`TranslationResult` ne transporte pas le texte source → impossible de comparer au contenu courant
sans replumbing cross-service (translator). Un garde **gateway-side** par taskId suffit.

### Business impact
MOYEN : la fenêtre de course est étroite (retraduction < ~5 s) mais l'édition-correction rapide
est un usage courant, et le symptôme (traduction ne matchant pas le texte) est **visible et
déroutant** — exactement ce que le Prisme doit garantir.

### Technical impact
- 1 `Map<messageId, {taskId, ts}>` en mémoire (dernière retraduction dispatchée par message).
- Garde early-return dans `_handleTranslationCompleted` : drop si `taskId` supplanté.
- Borné : balayage TTL 1 h par le **timer existant** (pas de nouveau timer) + plafond FIFO 5000.

### Risk assessment
**Faible.**
- Registre alimenté **uniquement** sur le chemin de retraduction (édition), pas sur la traduction
  initiale → la `Map` ne grandit que pour les messages **édités** (ensemble réduit), et un message
  jamais retraduit n'est **jamais** considéré périmé (garde inerte, `latest === undefined`).
- Couvre aussi la course traduction-initiale-vs-1ère-édition : T_initiale (non enregistrée)
  complétant après T_édition (enregistrée) est droppée car `taskId` ≠ dernier.
- Multi-langues : toutes les langues partagent le taskId de leur dispatch → aucune fausse
  élimination entre langues d'un même task.
- TTL 1 h ≫ round-trip ZMQ (timeout 5 s) → aucune retraduction en vol ne peut être évincée à tort.

### Proposed improvement (implémenté)
`services/gateway/src/services/message-translation/MessageTranslationService.ts` :
- `latestRetranslationTask: Map<string, {taskId, ts}>` + `_registerLatestRetranslationTask()`
  (borné TTL + FIFO) appelé après le `sendTranslationRequest` de `_processRetranslationAsync`.
- `_isStaleTranslationResult(messageId, taskId)` + garde early-return dans
  `_handleTranslationCompleted` avant `_saveTranslationToDatabase`.
- Balayage TTL greffé sur `processedTasksCleanupInterval` (timer 30 min existant, aucun nouveau).

### Expected benefits
- Suppression du clobber de traduction périmée sur édition rapide → cohérence Prisme garantie.
- Coût mémoire borné, hot path (traduction initiale) intouché.

### Implementation complexity
Faible — 1 fichier de prod (3 champs + 2 helpers + 1 garde + greffe cleanup), 3 tests de
régression dans le fichier `branches` existant.

### Validation criteria
- [x] `jest` `MessageTranslationService.branches.test.ts` : **44/44** (41 existants + 3 neufs :
      drop du task supplanté, save du task le plus récent, garde inerte si jamais retraduit).
- [x] `jest` `MessageTranslationService*` + `MessageHandler*` : **652/652** (11 suites), 0 régression.
- [x] `tsc --noEmit` : 0 erreur neuve dans le fichier touché (seul résidu : import
      `@meeshy/shared/prisma/client` non résolu — pré-existant/environnemental, client Prisma non
      généré sous ce sandbox).

## Follow-ups restants (audit realtime)
- #41 `OfflineQueue`/`OutboxFlusher` reconciliation (iOS SDK) — plus gros/risqué, pas de toolchain
  Swift ici.
