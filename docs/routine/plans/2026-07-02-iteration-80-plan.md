# Iteration 80 — Plan d'implémentation (2026-07-02)

## Objectifs
Borner le dernier cache mémoire non borné de la famille gateway :
`participant-lookup-cache.ts` (F45, lesson #45). Aligner sur l'idiome FIFO+sweep déjà établi
(`StatusHandler._cacheIdentity`, `conversation-id-cache`).

## Modules affectés
- `services/gateway/src/utils/participant-lookup-cache.ts` (code)
- `services/gateway/src/__tests__/unit/utils/participant-lookup-cache.test.ts` (tests)

Aucun consommateur touché (`MessagingService`, routes `leave`/`ban`/`delete-for-me`/`participants`
utilisent l'API publique inchangée).

## Phases d'implémentation
1. **RED** : +3 tests d'éviction (FIFO au plafond, préférence sweep-expired, no-evict on refresh).
2. **GREEN** :
   - `export const PARTICIPANT_LOOKUP_CACHE_MAX = 5_000`
   - `evictExpired()` interne
   - `cacheParticipant` : borne à l'insertion d'une nouvelle clé (sweep puis FIFO)
   - JSDoc du module mise à jour (explique le « TTL protège la fraîcheur pas la mémoire »).
3. **REFACTOR** : aucun (le fix EST l'idiome canonique).

## Dépendances
Aucune. Indépendant des PR ouvertes (#1351 web, #1350 conversation-id-cache voisin mais distinct,
#1346 iOS).

## Risques estimés
TRÈS FAIBLE — additif, aucune fenêtre d'incohérence (entrée re-résolvable), API publique inchangée.

## Stratégie de rollback
Revert du commit unique. Cache revient à l'état non borné (comportement fonctionnel identique).

## Critères de validation
- `participant-lookup-cache.test.ts` : 12/12
- `MessagingService.test.ts` : 62/62 (0 régression)
- Idiome identique aux 3 caches voisins déjà bornés.

## Statut de complétion
✅ COMPLÉTÉ — code + tests + docs. 74 tests verts sur les 2 suites.

## Suivi de progression
- [x] Analyse iter 80
- [x] Plan iter 80
- [x] RED (3 tests éviction)
- [x] GREEN (borne FIFO+sweep)
- [x] Validation (74 tests verts)
- [x] Lesson #45 → F45 marqué résolu (#46)
- [ ] Commit + push + PR

## Améliorations futures
- **Unification SSOT** : les 4 caches de la famille (identity, socket-helpers `normalizeConversationId`,
  conversation-id-cache, participant-lookup) partagent désormais le MÊME idiome FIFO+sweep dupliqué
  4×. Un helper générique `boundedTtlCache<K,V>({ max, ttlMs })` unifierait les 4 (violation DRY
  restante). Reporté : touche 4 fichiers + la DI de `MeeshySocketIOManager` — hors périmètre d'un
  cycle minimal-impact. Candidat prioritaire du prochain cycle « dette technique / SSOT ».
