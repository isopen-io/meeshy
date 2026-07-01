# Iteration 70 — Plan d'implémentation (2026-07-01)

## Objectif
Éliminer la **race condition** de validation de disponibilité dans le flux d'inscription
(`useFieldValidation`) en annulant les requêtes obsolètes via `AbortController` (API navigateur native).
Corrige aussi le `setState` post-démontage et supprime les requêtes zombies. Comportement nominal
préservé, CI garantie verte (cible apps/web vérifiable localement).

## Phases

### Phase 1 — `AbortController` sur `checkAvailability` ✅
- [x] `abortRef = useRef<AbortController | null>(null)`
- [x] `checkAvailability` : annuler la précédente (`abortRef.current?.abort()`), créer un controller,
      passer `{ signal }` au `fetch`
- [x] Gardes `if (controller.signal.aborted) return;` après `fetch` et après `json()`

### Phase 2 — Ne pas dégrader l'état sur annulation ✅
- [x] `catch` : `if ((error as Error)?.name === 'AbortError') return;` avant `setStatus('invalid')`

### Phase 3 — Cleanup de l'effet ✅
- [x] Cleanup `[value, disabled, …]` : `abortRef.current?.abort()` (changement de valeur / démontage)

### Phase 4 — Tests & vérification ✅
- [x] Nouveau `__tests__/hooks/use-field-validation.test.ts` (3 tests : annulation au changement de
      valeur, non-écrasement par réponse obsolète, annulation au démontage)
- [x] `jest` : 3/3 verts (RED garantie contre l'ancien code — le test « réponse obsolète » exige la garde)
- [x] `tsc --noEmit` : 1198 = 1198 (0 régression)

### Phase 5 — Livraison ✅
- [x] Commit + push sur `claude/sharp-wozniak-auwriu`
- [ ] PR + merge dans `main` (CI verte)

## Backlog reporté
- **F2** : flip `SOCKET_LANG_FILTER` (~75 % bande passante multilingue) — décision staging/produit, gateway.
- **F33** : `usePrefetch` prefetch `fetch` sans `AbortController` (best-effort, faible priorité).
- **F34** : `useContactsFiltering` (`@deprecated`) — migrer vers `useContactsV2` puis supprimer.
- **F32** : SSOT ObjectId gateway (~25 sites) — non vérifiable local (Prisma).

## Résultat
Validation d'inscription débarrassée de sa race condition (aucune réponse périmée n'écrase l'état
courant), sans `setState` post-démontage, sans requêtes zombies. Continuité assurée pour l'itération 71
(candidats : F33/F34 web vérifiables, ou F2/F32 gateway si l'environnement Prisma redevient disponible).
