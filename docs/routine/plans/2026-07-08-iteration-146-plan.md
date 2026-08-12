# Iteration 146 — Plan d'implémentation (2026-07-08)

## Objectives
Corriger F114 : `toMinimalUser` (`apps/web/hooks/use-user-status-realtime.ts`) fabrique `Date.now()`
pour un `lastActiveAt` absent, faisant apparaître un contact hors-ligne comme « en ligne » (point orange
pulsant). Aligner le chemin snapshot sur les chemins `onUserStatus` / resync REST (qui passent
`undefined`).

## Affected modules
- `apps/web/hooks/use-user-status-realtime.ts` — `toMinimalUser` (production).
- `apps/web/__tests__/hooks/use-user-status-realtime.test.tsx` — test de régression comportemental.

## Implementation phases
1. **RED** — Ajouter un test « should not fabricate a "now" lastActiveAt for a snapshot user with null
   lastActiveAt » : un snapshot `{ isOnline:false, lastActiveAt:null }` doit produire un user dont
   `getUserStatus` renvoie `'offline'` et dont `lastActiveAt` est `undefined`. Confirmé rouge sur le
   code d'origine (statut fabriqué → `Received: <now>`).
2. **GREEN** — Remplacer le fallback `new Date()` par `undefined` dans `toMinimalUser` + commentaire
   d'invariant. Confirmé vert.
3. **REFACTOR** — Aucun (une ligne, déjà idiomatique et alignée sur les deux autres chemins).

## Dependencies
Aucune. `mergeParticipants` (user-store) et `getUserStatus` (user-status) gèrent déjà `undefined`.

## Estimated risks
Très faible. Changement local d'une ligne, sans impact de schéma/API/type (objet `as unknown as User`).

## Rollback strategy
Revert du commit unique. Aucun état persistant ni migration en jeu.

## Validation criteria
- [x] Test RED sans le fix (`Received: <now>` → attendu `'offline'`).
- [x] Test GREEN avec le fix.
- [x] Suites `use-user-status-realtime` + `user-store` + `user-status` vertes (73/73).
- [x] `tsc` : aucun nouvel erreur sur les fichiers modifiés (1205 erreurs pré-existantes = implicit-any
      dans des mocks de test, hors périmètre).

## Completion status
- [x] Phase 1 (RED)
- [x] Phase 2 (GREEN)
- [x] Validation
- [ ] Merge dans `main` (via PR)

## Progress tracking
Cycle terminé côté implémentation ; reste push + PR + merge.

## Future improvements
- **F115 (candidat)** : `stores/user-store.ts:102` — branche « nouveau user » de `updateUserStatus`
  utilise `updates.lastActiveAt || new Date()`. Même classe de fabrication ; partiellement gardé et
  couvert de façon lâche. À traiter dans une itération ultérieure avec un test dédié
  (`{isOnline:false, lastActiveAt:undefined}` sur un user inconnu → `'offline'`, pas `'online'`).
