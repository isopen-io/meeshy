# Iteration 81 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `ed63724f` (PR #1346 mergée). Branche de travail `claude/brave-archimedes-bz21dv`
réalignée sur `origin/main` (working tree propre, aucun commit non-mergé à préserver).

Revue des deux dernières itérations mémoire (79 & 80) : toutes deux bornent un cache de la
« famille gateway » (FIFO / FIFO+sweep) et **désignent explicitement le même follow-up
prioritaire** — l'unification SSOT/DRY des copies dupliquées de l'idiome de cache borné en un
seul helper générique `boundedTtlCache<K,V>({ max, ttlMs })` (cf. « Améliorations futures » des
plans 79 & 80). Cible retenue : **dette technique / SSOT**, Priorité 1-2 (feature récemment
développée : la vague de bornage mémoire iter 42/76/79/80).

## Cible iter 81 — Unifier 5 implémentations dupliquées du cache borné (SSOT)

### Current state
L'idiome « Map borné » avait été copié-collé **5 fois** à travers les hot paths du gateway, en
deux variantes :

**Variante A — borne FIFO pure (données immuables `identifier → ObjectId`, sans TTL) :**
1. `utils/conversation-id-cache.ts` (`resolveConversationId`, routes REST)
2. `socketio/utils/socket-helpers.ts` (`normalizeConversationId`, handlers)
3. `socketio/MeeshySocketIOManager.ts` (`normalizeConversationId` privé — duplicata quasi exact)

**Variante B — borne FIFO + balayage TTL (mémoization courte durée qui doit rester fraîche) :**
4. `socketio/handlers/StatusHandler.ts` (`identityCache` : `evictExpired` + FIFO, TTL 60 s)
5. `utils/participant-lookup-cache.ts` (`evictExpired` + FIFO, TTL 30 s)

Chaque copie réimplémentait à la main : le contrôle `size >= MAX`, l'éviction FIFO
(`cache.keys().next().value` + `delete`), et — pour la variante B — le balayage des entrées
expirées avant la FIFO plus la vérification lazy de `expiresAt` à la lecture.

### Problem identified
Violation DRY à 5 exemplaires. Un même invariant (mémoire bornée + fraîcheur TTL optionnelle)
était codé, testé et documenté 5 fois. Conséquences :
- **Divergence latente** : StatusHandler bornait, mais `conversation-id-cache`,
  `socket-helpers` et le cache privé du manager n'ont été bornés qu'aux itérations 42/79 — la
  logique identique était appliquée à des dates différentes, preuve du coût de la duplication.
- **Surface de bug** : chaque copie répète le pattern subtil « ne pas évincer lors d'un refresh
  de clé existante » et « balayer les expirées avant la FIFO ». Une copie oubliant un détail
  diverge silencieusement.
- **Coût de maintenance** : toute amélioration future (LRU vrai, métriques, hit-rate) devrait
  toucher 5 fichiers.

### Root cause
Absence de SSOT pour un building block transversal. L'idiome est assez simple pour être recopié,
assez subtil (sweep-avant-FIFO, no-evict-on-refresh, lazy-expiry) pour que la duplication soit
risquée.

### Business impact
NUL fonctionnellement (aucun changement de comportement observable). Élevé en maintenabilité et
en cohérence : clôt définitivement la « famille mémoire gateway » sous une seule source de vérité.

### Technical impact
- Nouveau module `utils/bounded-cache.ts` : `class BoundedTtlCache<K, V>` — `ttlMs` optionnel
  (`undefined` → borne FIFO pure sans expiration ; défini → FIFO + sweep TTL). Interface
  Map-compatible sur le sous-ensemble réellement utilisé (`get`/`set`/`has`/`delete`/`clear`/
  `size`/`evictExpired`).
- 5 consommateurs migrés vers cette SSOT ; **0 changement de signature publique** (les constantes
  `CONVERSATION_ID_CACHE_MAX`, `PARTICIPANT_LOOKUP_CACHE_MAX` et les fonctions exportées restent).
- Suppression de ~60 lignes de logique d'éviction dupliquée (dont les méthodes privées
  `_cacheIdentity` / `_evictExpiredIdentities` de StatusHandler, désormais `set` / `evictExpired`
  de la SSOT).
- Comportement strictement préservé : sweep-avant-FIFO, no-evict-on-refresh (garde `!has(key)`),
  lazy-expiry à la lecture, `Infinity` comme `expiresAt` pour la variante sans TTL.

### Risk assessment
FAIBLE. Refactor à comportement constant, couvert par les suites existantes. Un seul test
white-box a dû être ajusté (`MeeshySocketIOManager.test.ts` appelait `cache.keys()` — méthode
Map volontairement non exposée par la SSOT car fuite d'abstraction pour un cache ; réécrit pour
cibler la clé la plus ancienne connue `key-0`). Le comportement d'éviction lui-même est désormais
couvert de façon générique par `bounded-cache.test.ts`.

### Proposed improvements
1. `utils/bounded-cache.ts` + tests (13 cas : FIFO pur, TTL, sweep+FIFO, refresh no-evict, delete/
   clear/size).
2. Migration des 5 consommateurs.
3. Ajustement du test white-box du manager.

### Expected benefits
- SSOT unique pour le cache borné : toute évolution future (métriques, LRU, hit-rate) = 1 fichier.
- Suppression totale de la duplication de l'idiome d'éviction.
- Cohérence : les 5 caches partagent désormais la même implémentation prouvée et testée une fois.

### Implementation complexity
FAIBLE — 1 nouveau module + 1 suite de tests, 5 migrations mécaniques, 1 test white-box ajusté.

### Validation criteria
- `bounded-cache.test.ts` : 13/13 ✅
- 9 suites consommatrices directes : 474/474 ✅
- Balayage large `src/socketio` + `src/__tests__/unit/{utils,socketio,handlers}` : 78 suites,
  2351/2351 ✅
- `tsc --noEmit` : 0 erreur nouvelle dans les fichiers modifiés (seules subsistent les erreurs
  pré-existantes `@meeshy/shared/prisma/client` liées à l'absence de client généré dans l'env).

## Résultat
Implémenté + validé (2351 tests verts sur le périmètre affecté). La « famille mémoire gateway »
(identity, socket-helpers, conversation-id, participant-lookup, cache privé du manager) est
désormais unifiée derrière une **source de vérité unique** `BoundedTtlCache`. Clôt le follow-up
SSOT annoncé par les itérations 79 & 80 (lesson #45).
