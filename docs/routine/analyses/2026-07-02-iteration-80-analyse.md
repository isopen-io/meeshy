# Iteration 80 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `b5fa159e` (PR #1349 mergée). Branche de travail `claude/brave-archimedes-csvcbl`
alignée sur `origin/main` (working tree propre, aucun commit non-mergé à préserver).

PR ouvertes au démarrage : #1351 (web socket.io recover after `reconnect_failed`),
**#1350** (`conversation-id-cache.ts` borné FIFO 2000 — traite le 1er des deux follow-ups
du lesson #45), #1346 (iOS a11y `ConversationView+MessageRow`). Cible choisie **indépendante**
de ces trois PR (fichier `participant-lookup-cache.ts` — aucun conflit de merge attendu ;
#1350 borne un fichier voisin mais distinct).

Revue Priorité 2 (features déjà modernisées, vague de bornage mémoire iter 42/76/79) :
le lesson #45 et la note « Future Considerations » de la PR #1350 pointent **explicitement**
`participant-lookup-cache.ts` comme le prochain follow-up mémoire (F45). C'est une cible
propre, auto-contenue, testable localement (gateway TS), et non dupliquée par les PR ouvertes.
Cible retenue.

## Cible iter 80 — Cache de lookup participant non borné (fuite mémoire hot path envoi de message)

### Current state
`services/gateway/src/utils/participant-lookup-cache.ts` mémorise le `Participant` résolu par
`(participantId, conversationId)` sur **chaque envoi de message** (`MessagingService`, étape
`messaging.participantLookup`) — c'est le chemin le plus chaud du gateway. Le cache est un
`Map<string, Entry>` module-level avec un TTL de 30 s (`Entry.expiresAt`).

Deux mécanismes de suppression existaient :
1. **Lecture lazy** de la MÊME clé après expiration (`getCachedParticipant` → `entry.expiresAt <= now`
   → `cache.delete(key)` → `undefined`) ;
2. **`invalidateParticipantLookup`** (appelé explicitement par `leave`/`ban`/`delete-for-me`/
   `participants` remove).

**Aucune borne de taille, aucun balayage des entrées froides.**

### Problem identified
Une entrée pour un `(participantId, conversationId)` qui envoie **un seul** message puis ne revient
jamais (participant qui quitte silencieusement, one-shot, churn de conversations) **n'est jamais
évincée** : elle expire (30 s) mais reste dans la Map pour toute la durée de vie du process. Les
sites `invalidate*` ne couvrent que les mutations explicites (leave/ban/kick/delete-for-me) — un
départ passif ou une conversation abandonnée n'y passe jamais.

Résultat : **une entrée accumulée par paire (participant, conversation) unique ayant jamais envoyé
un message** → croissance mémoire non bornée. Exactement le pattern « TTL sans balayage » corrigé
pour `StatusHandler.identityCache` (iter 76), `socket-helpers.normalizeConversationId` (iter 42),
et `conversation-id-cache` (PR #1350, iter 79). Ce cache était le dernier de la famille encore non
borné.

### Root cause
Anti-pattern « TTL sans balayage » : le TTL sur `expiresAt` protège la **fraîcheur** (pas de
`Participant.isActive` périmé servi > 30 s) mais **pas la mémoire** — un TTL vérifié uniquement à
la lecture de la même clé ne récupère jamais les entrées froides d'un `userId`/conversation qui ne
revient pas.

### Business impact
FAIBLE fonctionnellement (aucun changement de comportement observable). MOYEN en scalabilité : le
gateway vise 100k msg/s ; `participantLookup` court sur **chaque** envoi de message. Sur un
déploiement long-vécu à fort brassage (conversations éphémères, participants one-shot), la Map
croît linéairement avec le nombre cumulé de paires uniques — pression mémoire évitable sur le
process gateway (jamais recyclé hors redéploiement).

### Technical impact
- Cohérence : `participant-lookup-cache` aligné sur l'idiome déjà établi (`_cacheIdentity` de
  `StatusHandler`, `conversation-id-cache` de #1350).
- Borne déterministe `PARTICIPANT_LOOKUP_CACHE_MAX = 5_000` (même valeur que
  `IDENTITY_CACHE_MAX_SIZE` — cache voisin per-hot-path avec TTL, cardinalité comparable).
- Éviction à l'insertion d'une **nouvelle** clé au plafond : d'abord balayage des entrées expirées
  (`evictExpired`), puis FIFO sur la plus ancienne si toujours au plafond. Le rafraîchissement
  d'une clé **existante** ne déclenche PAS d'éviction (garde `!cache.has(key)`) — évite d'évincer
  une entrée vivante lors d'un simple refresh.
- Pas de timer module-level (`setInterval`) : un cache fonctionnel sans lifecycle n'a pas de point
  de teardown propre ; la borne à l'insertion suffit à garantir la mémoire de façon déterministe
  et testable (choix plus élégant que StatusHandler qui doit gérer un timer car il est classé).

### Risk assessment
TRÈS FAIBLE. Changement strictement additif : l'éviction ne se déclenche qu'au-delà de 5000
entrées fraîches (contrôle O(1) de taille + delete). Le mapping `(participant, conversation) →
Participant` étant re-résolvable en une requête, une entrée évincée re-query simplement — aucune
fenêtre d'incohérence. Aucun site consommateur (`MessagingService`) n'est modifié.

### Proposed improvements
1. `export const PARTICIPANT_LOOKUP_CACHE_MAX = 5_000`.
2. `evictExpired()` interne (balaye les entrées `expiresAt <= now`).
3. `cacheParticipant` : au plafond et clé nouvelle → `evictExpired()` puis FIFO sur la plus
   ancienne.

### Expected benefits
- Mémoire du process gateway bornée sur le chemin d'envoi de message le plus chaud.
- Homogénéité : les 4 caches de la famille (identity, socket-helpers, conversation-id, participant)
  suivent désormais le même idiome de bornage.

### Implementation complexity
TRIVIALE — 1 fichier de code (+~13 lignes), 1 fichier de test (+3 cas), 0 changement de signature
publique, 0 site consommateur touché.

### Validation criteria
- `participant-lookup-cache.test.ts` : 12/12 (9 existants + 3 éviction) ✅
- `MessagingService.test.ts` (consommateur) : 62/62, 0 régression ✅
- Nouveaux tests : (a) au plafond, la plus ancienne clé est évincée ; (b) au plafond avec entrées
  expirées, le sweep les préfère à la FIFO ; (c) refresh d'une clé existante n'évince rien.

## Résultat
Implémenté + validé (74 tests verts sur les 2 suites concernées). Dernier cache non borné de la
famille mémoire gateway désormais borné — clôt le follow-up F45 (lesson #45).
