# Iteration 81 — Plan d'implémentation (2026-07-02)

## Objectifs
Établir une **source de vérité unique** (`BoundedTtlCache<K, V>`) pour l'idiome « Map bornée
FIFO (+ TTL optionnel) » dupliqué 5× dans le gateway, et migrer les 5 consommateurs — clôt le
follow-up SSOT annoncé par les itérations 79 & 80.

## Modules affectés
- `services/gateway/src/utils/bounded-cache.ts` — **nouveau** (SSOT + JSDoc)
- `services/gateway/src/__tests__/unit/utils/bounded-cache.test.ts` — **nouveau** (13 cas)
- `services/gateway/src/utils/conversation-id-cache.ts` — migré (variante FIFO pure)
- `services/gateway/src/utils/participant-lookup-cache.ts` — migré (variante TTL)
- `services/gateway/src/socketio/utils/socket-helpers.ts` — migré (variante FIFO pure)
- `services/gateway/src/socketio/MeeshySocketIOManager.ts` — migré (cache privé, variante FIFO)
- `services/gateway/src/socketio/handlers/StatusHandler.ts` — migré (variante TTL ;
  `_cacheIdentity`/`_evictExpiredIdentities` supprimés au profit de `set`/`evictExpired`)
- `services/gateway/src/socketio/__tests__/MeeshySocketIOManager.test.ts` — test white-box ajusté

## Phases d'implémentation
1. **GREEN (SSOT)** : écrire `BoundedTtlCache` (ttlMs optionnel) + 13 tests couvrant les deux
   variantes. Vert avant migration.
2. **Migration variante FIFO pure** : `conversation-id-cache`, `socket-helpers`, cache privé du
   manager → `new BoundedTtlCache({ maxSize })`, suppression de la logique d'éviction inline.
3. **Migration variante TTL** : `participant-lookup-cache`, `StatusHandler.identityCache` →
   `new BoundedTtlCache({ maxSize, ttlMs })`, `_evictStale` appelle `identityCache.evictExpired()`,
   lectures via `get()` (lazy-expiry intégrée).
4. **Ajustement test** : `MeeshySocketIOManager.test.ts` — remplacer `cache.keys()` (méthode Map
   non exposée) par la clé la plus ancienne connue `key-0`.

## Dépendances
Aucune. Indépendant des PR ouvertes. Fichiers gateway isolés.

## Risques estimés
FAIBLE — refactor à comportement constant, entièrement couvert par les suites existantes.
Comportement préservé : sweep-avant-FIFO, no-evict-on-refresh, lazy-expiry, `Infinity` pour la
variante sans TTL.

## Stratégie de rollback
Revert du commit unique. Les 5 caches reviennent à leur implémentation inline (comportement
fonctionnel identique — c'est un pur refactor SSOT).

## Critères de validation
- [x] `bounded-cache.test.ts` : 13/13
- [x] 9 suites consommatrices : 474/474
- [x] Balayage large (78 suites) : 2351/2351, 0 régression
- [x] `tsc` : 0 erreur nouvelle dans les fichiers modifiés

## Statut de complétion
✅ COMPLÉTÉ — SSOT + tests + 5 migrations + doc. 2351 tests verts sur le périmètre affecté.

## Suivi de progression
- [x] Analyse iter 81
- [x] Plan iter 81
- [x] GREEN SSOT (13 tests)
- [x] Migration 5 consommateurs
- [x] Ajustement test white-box manager
- [x] Validation (2351 tests verts)
- [ ] Commit + push

## Améliorations futures
- **Métriques cache** : la SSOT unique rend trivial l'ajout d'un compteur hit/miss et d'un
  `stats()` exposé à l'observabilité (Prometheus) — 1 seul fichier à instrumenter désormais.
- **Vrai LRU** : si un profil de charge montre un hit-rate FIFO sous-optimal, upgrader
  `BoundedTtlCache` vers une politique LRU (touch-on-get) bénéficierait aux 5 caches d'un coup.
- **Extension hors gateway** : d'autres services (`translator` n/a — Python) et le web pourraient
  réutiliser un helper équivalent si un cache borné y émerge ; candidat à remonter dans
  `packages/shared` si un 2e service TS en a besoin (YAGNI pour l'instant — 1 seul consommateur).
