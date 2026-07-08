# Iteration 148 — Plan d'implémentation

## Objectives
Corriger F115 : la delivery-queue hors-ligne écrase la 2e édition d'un message par
la 1re → contenu intermédiaire périmé rejoué au reconnect. Rendre les événements
mutables (`edited`/`deleted`) « dernier payload gagne » (supersede en place), tout
en gardant `new` strictement idempotent.

## Affected modules
- `services/gateway/src/services/RedisDeliveryQueue.ts` (Lua + mémoire + JS)
- `services/gateway/src/__tests__/unit/services/RedisDeliveryQueue.test.ts` (tests)

Aucun changement de schéma, type partagé, API, ni migration.

## Implementation phases
1. **RED** — tests de régression : 2 `edited` divergents → drain doit rejouer le
   dernier contenu (échoue avant correctif). ✅ écrits.
2. **GREEN** — `ENQUEUE_DEDUP_LUA` : supersede `LSET` pour mutable, `return 0`/`2`.
   Chemin mémoire : `findIndex` + `map`-replace pour mutable, dedup pour `new`.
   JS : log distinct pour `2`. ✅ implémenté.
3. **REFACTOR** — commentaires d'invariant mis à jour (immuable `new` vs mutable).
   ✅.

## Dependencies
`bun install` à la racine (parité CI) + `prisma generate` (client) pour la suite
gateway complète.

## Estimated risks
Faible. Rétro-compatible (tous tests existants verts, `size===1` sur édition
répétée). Invariant one-entry-per-paire préservé → `drain`/`PRUNE_STALE_LUA`
intacts.

## Rollback strategy
Revert du commit unique ; aucune donnée persistée n'est altérée dans un format
nouveau (les entrées restent `QueuedMessagePayload` inchangées).

## Validation criteria
- `RedisDeliveryQueue` suite verte (nouveaux + anciens tests).
- `tsc --noEmit` propre (gateway).
- Suite gateway complète verte.

## Completion status
- [x] Analyse écrite (`docs/routine/analyses/2026-07-08-iteration-148-analyse.md`)
- [x] Correctif Lua + mémoire + JS
- [x] Tests de régression (mémoire divergent, FIFO, retry `new`, Redis return 2)
- [ ] `tsc` + suite gateway verts
- [ ] Commit + push + PR

## Future improvements (prochaines priorités)
1. **F116** — `mergeParticipants` (user-store.ts:52-54) : découpler fraîcheur du
   tie-break de l'application des champs ; un `isOnline` sans `lastActiveAt` ne doit
   pas être jeté, et un snapshot minimal ne doit pas écraser les champs profil
   riches. Cycle dédié + revue (touche la sémantique de merge de présence refondue
   par #1727/#1729).
2. `StatusService` garde anon (`anon_online_*` jamais écrit) — nettoyer ou activer.
