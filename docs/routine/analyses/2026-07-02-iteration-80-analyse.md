# Iteration 80 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `1178419a` (PR #1350 « bound resolveConversationId cache » de l'iter 79 mergée ; PR #1351
également mergée). Branche `claude/brave-archimedes-4n6448` recréée à neuf depuis `origin/main`.

Cible retenue = follow-up **F45** consigné en iter 79 (`tasks/lessons.md` #45) : le cache de lookup
de participant à TTL *paresseux* sans sweep périodique ni max-size. Continuité directe de la vague
de bornage des caches gateway (iter 42/76/79) — auto-contenue, fix prouvé, sans conflit.

## Cible iter 80 — `participant-lookup-cache` : TTL paresseux sans reclamation mémoire (fuite hot path)

### Current state
`services/gateway/src/utils/participant-lookup-cache.ts` mémorise
`(participantId, conversationId) → Participant` avec un TTL de 30 s, peuplé par
`MessagingService` (`messaging.participantLookup`) sur **chaque envoi de message** — le chemin
d'écriture le plus chaud du gateway. Il évite une requête DB par message pour un participant actif
qui envoie plusieurs messages d'affilée.

### Problem identified
Le TTL **ne récupère pas la mémoire** : une entrée n'est supprimée que (a) paresseusement lors d'un
`get` ultérieur de la **même** clé après expiration, ou (b) via `invalidateParticipantLookup`
(leave/ban/kick/delete-for-me). Une paire `(participant, conversation)` qui envoie quelques messages
puis se tait laisse une entrée **expirée** dans la `Map` pour toute la durée de vie du process.
Aucun sweep périodique, aucune borne de taille → croissance mémoire non bornée sur le hot path.

### Root cause
Anti-pattern « TTL sans balayage » (identique à `StatusHandler.identityCache`, iter 76) : le TTL
protège la **fraîcheur** (pas de Participant périmé servi) mais **pas la mémoire** — un TTL vérifié
uniquement à la lecture de la même clé ne récupère jamais les entrées froides.

### Business impact
FAIBLE fonctionnellement (aucun changement observable), MOYEN en scalabilité : le gateway vise
100k msg/s ; le lookup de participant est sur le chemin d'écriture le plus fréquent. Sur un
déploiement long-vécu à fort brassage de participants, la `Map` croît avec le nombre cumulé de
paires `(participant, conversation)` uniques ayant jamais envoyé un message.

### Technical impact
- Borne **timer-free** cohérente avec l'idiome FIFO des caches soeurs (`socket-helpers`,
  `conversation-id-cache`) tout en réclamant les entrées **expirées** d'abord (esprit du sweep
  `StatusHandler`) — sans introduire de `setInterval` dans un util module-level (pas de lifecycle
  à gérer, pas d'open-handle en test).
- `PARTICIPANT_LOOKUP_CACHE_MAX = 5000` (aligné sur `IDENTITY_CACHE_MAX_SIZE`, le sibling à TTL).

### Risk assessment
**Faible.**
- Chemin chaud **intact** : `evictForInsert` retourne immédiatement tant que `size < 5000` ou que
  la clé existe déjà (mise à jour, pas de croissance). Le balayage O(n) ne s'exécute **qu'au
  franchissement du cap** (amorti rare).
- Aucune incohérence : l'éviction ne supprime que des entrées **expirées** (jamais servies) ou, si
  5000 entrées fraîches coexistent, la plus ancienne — re-résolue en 1 requête DB au prochain envoi.
- Sémantique TTL/`invalidate`/`reset` **inchangée** (les 9 tests existants passent tels quels).

### Proposed improvement (implémenté)
`services/gateway/src/utils/participant-lookup-cache.ts` :
- `export const PARTICIPANT_LOOKUP_CACHE_MAX = 5000;`
- `evictForInsert(key, now)` : no-op si clé existante ou sous le cap ; sinon supprime les entrées
  expirées puis FIFO-évince la plus ancienne jusqu'à repasser sous le cap.
- `cacheParticipant` appelle `evictForInsert` avant `set` (un seul `Date.now()` réutilisé).

### Expected benefits
- Suppression de la croissance mémoire non bornée sur le hot path d'envoi de message.
- Dernier cache non borné du gateway (après iter 42/76/79) désormais borné → cohérence complète.

### Implementation complexity
Faible — 1 fichier de prod (+~20/-4), 3 tests neufs (borne FIFO tient le cap ; réclamation des
expirées avant éviction des vivantes ; mise à jour d'une clé existante n'évince pas).

### Validation criteria
- [x] `jest` `participant-lookup-cache.test.ts` : **12/12** (9 existants + 3 neufs).
- [x] `jest` `utils/` + `MessagingService` : **906/906** (26 suites), 0 régression.

## Follow-ups restants

| # | Constat | Impact |
|---|---------|--------|
| SSOT | Unifier les 3 copies (désormais bornées) du cache `conversationId` en 1 helper partagé — touche la DI du constructeur `MeeshySocketIOManager`, reporté. | FAIBLE |
| F41 | `OfflineQueue`/`OutboxFlusher` reconciliation (iOS SDK) — pas de toolchain Swift ici. | HAUT |

## Gain
Le cache de lookup de participant (`participant-lookup-cache`) est désormais borné (FIFO 5000 avec
réclamation des entrées expirées d'abord, sans timer). Fuite mémoire supprimée sur le chemin
d'écriture le plus chaud. Tous les caches in-process du gateway sont désormais bornés. 906 tests
verts (dont 3 neufs), 0 régression.
