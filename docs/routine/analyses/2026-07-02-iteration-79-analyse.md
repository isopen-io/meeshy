# Iteration 79 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `f4dc4b57` (PR #1349 « exact @mention resolution » de l'iter 78 mergée ; PR #1344 call
resilience également mergée). Branche de travail `claude/brave-archimedes-4n6448` recréée à neuf
depuis `origin/main`.

Cible retenue = follow-up **F44** consigné en iter 78 (`docs/routine/analyses/…-iteration-78`,
`tasks/lessons.md` #45) : le 3e cache `identifier → ObjectId` non borné du gateway. C'est la
continuité directe de la vague de bornage iter 42/76 — une cible auto-contenue, à fix prouvé, et
sans conflit avec les PR récentes.

## Cible iter 79 — `resolveConversationId` : cache `identifier → ObjectId` non borné (fuite mémoire REST)

### Current state
`services/gateway/src/utils/conversation-id-cache.ts` mémorise `identifier → ObjectId` dans une
`Map` module-level pour éviter une requête DB par résolution. `resolveConversationId` est importé
par **~15 fichiers de routes REST** (`routes/conversations/{core,messages,messages-advanced,
participants,leave,ban,sharing,threads,stats,delete-for-me}.ts`, `routes/message-read-status.ts`,
`routes/translation-non-blocking.ts`) + `MessageValidator`/`MessagingService` sur le chemin
d'envoi de message — soit des dizaines d'endpoints chauds.

### Problem identified
La `Map` n'était **jamais bornée, balayée ni invalidée** : chaque identifiant de conversation
distinct jamais résolu via HTTP y reste pour toute la durée de vie du process. Croissance
linéaire avec le nombre cumulé d'identifiants distincts vus.

### Root cause
C'est la **3e copie** de ce cache dans le codebase. Les deux autres ont déjà été bornées :
`socket-helpers.ts` (`normalizeConversationId`, borne FIFO `CONVERSATION_ID_CACHE_MAX = 2000`,
iter 42) et la copie privée de `MeeshySocketIOManager` (« bounded to 2000 entries LRU »). Le
commentaire de `socket-helpers.ts` référence explicitement le miroir de bornage, mais **cette 3e
copie REST n'avait jamais reçu la borne** — trou dans l'application de l'audit.

### Business impact
FAIBLE fonctionnellement (aucun changement de comportement observable), MOYEN en scalabilité : le
gateway (process long-vécu, jamais recyclé hors redéploiement) accumule une entrée par identifiant
distinct résolu sur toutes les routes de conversation. Pression mémoire évitable.

### Technical impact
- Cohérence : cache REST aligné sur l'idiome FIFO **exact** des deux caches soeurs (SSOT de
  pattern), constante exportée `CONVERSATION_ID_CACHE_MAX` (testable).
- Fix strictement additif : l'éviction ne se déclenche qu'au-delà de 2000 entrées **fraîches** ;
  l'entrée évincée (la plus ancienne) sera re-résolue en 1 requête au prochain accès.

### Risk assessment
**Faible.** Aucun chemin chaud ralenti (une comparaison de taille + éviction O(1) uniquement quand
`size >= 2000`). Les identifiants restent des données **immuables** (identifier → ObjectId ne
change jamais) donc l'éviction n'introduit aucune incohérence — au pire un miss re-résolu. Idiome
copié à l'identique du sibling déjà en prod depuis iter 42.

### Proposed improvement (implémenté)
`services/gateway/src/utils/conversation-id-cache.ts` :
- `export const CONVERSATION_ID_CACHE_MAX = 2000;`
- Avant `cache.set`, si `cache.size >= CONVERSATION_ID_CACHE_MAX` → supprimer `cache.keys().next().value`
  (FIFO), exactement comme `socket-helpers.ts`.

### Expected benefits
- Suppression de la croissance mémoire non bornée sur les routes REST de conversation.
- 3e (et dernière) copie du cache `conversationId` désormais bornée → cohérence complète.

### Implementation complexity
Faible — 1 fichier de prod (+11/-1, dont commentaire), 1 test d'éviction (remplit le cap + 1,
prouve que la plus ancienne entrée est re-query et qu'une entrée récente reste en cache).

### Validation criteria
- [x] `jest` `conversation-id-cache.test.ts` : **9/9** (8 existants + 1 éviction FIFO).
- [x] `jest` `utils/` + `MessageValidator` + `MessagingService` : **961/961** (27 suites), 0 régression.

## Follow-ups restants

| # | Constat | Impact |
|---|---------|--------|
| F45 | `services/gateway/src/utils/participant-lookup-cache.ts` — TTL lazy sans sweep périodique ni max-size ; peuplé à chaque envoi de message. Ajouter sweep `unref()` + borne. | MOYEN |
| SSOT | Les 3 copies du cache `conversationId` restent dupliquées (désormais toutes bornées). Unifier en 1 helper partagé toucherait la DI du constructeur `MeeshySocketIOManager` — reporté (prudence). | FAIBLE |
| F41 | `OfflineQueue`/`OutboxFlusher` reconciliation (iOS SDK) — pas de toolchain Swift ici. | HAUT |

## Gain
Le cache `identifier → ObjectId` des routes REST (`resolveConversationId`) est désormais borné
(FIFO 2000, idiome exact des caches soeurs). Fuite mémoire supprimée sur les ~15 routes de
conversation + chemin d'envoi. 961 tests verts (dont 1 neuf), 0 régression.
