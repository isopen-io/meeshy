# Plan d'implémentation — Iteration 206

## Objectives

1. Corriger `isUserAnonymous` : supprimer l'heuristique `id.length > 20` (classe
   tout inscrit anonyme) et fiabiliser la détection `isAnonymous` (valeur, pas présence).
2. Aligner le suivi de lecture exact de `ConversationView` sur le SSOT du Prisme
   Linguistique (`getUserLanguagePreferences`, deviceLocale 4e priorité).

## Affected modules

- `apps/web/utils/auth.ts` — `isUserAnonymous`.
- `apps/web/__tests__/utils/auth.test.ts` — remplace les 2 tests figeant le bug.
- `apps/web/components/conversations/ConversationView.tsx` — `preferredLanguages`.
- `apps/web/__tests__/components/conversations/ConversationView.test.tsx` — +2 tests.

## Implementation phases

- [x] Phase 1 — RED : réécrire les tests `auth.test.ts` (ObjectId 24 hex → non
  anonyme ; `isAnonymous: false` → non anonyme). Confirmer l'échec.
- [x] Phase 2 — GREEN : retirer la clause de longueur, tester `isAnonymous === true`,
  présence `!== undefined` pour session/shareLink. Confirmer 32/32.
- [x] Phase 3 — RED : ajouter les 2 tests `ConversationView.test.tsx` via capture
  de `resolveLanguage`. Confirmer l'échec du cas deviceLocale (renvoyait l'original).
- [x] Phase 4 — GREEN : `preferredLanguages = getUserLanguagePreferences(currentUser)`,
  deps `useMemo` + deviceLocale. Confirmer 37/37.
- [x] Phase 5 — Non-régression : 681/681 sur `utils` + `components/conversations` ;
  `tsc --noEmit` sans nouvelle erreur (2 erreurs ConversationView préexistantes).

## Dependencies

`packages/shared/dist` reconstruit (`tsc`) pour les suites qui importent
`@meeshy/shared/*`. Aucune dépendance npm nouvelle.

## Estimated risks

Minimal. Défaut 1 rend la classification plus stricte (retire des faux positifs) ;
consommateur unique protégé en amont. Défaut 2 est une convergence sur un SSOT testé.

## Rollback strategy

Chaque correctif est un commit atomique indépendant → `git revert` ciblé possible
sans toucher l'autre.

## Validation criteria

- `auth.test.ts` 32/32, `ConversationView.test.tsx` 37/37.
- Suite `utils` + `components/conversations` : 681/681.
- 2 preuves RED archivées (avant correctif : anonyme=true pour inscrit ; langue
  lue = original au lieu de la deviceLocale).

## Completion status

**COMPLET.** Les deux correctifs implémentés, testés (TDD RED→GREEN), sans régression.

## Progress tracking

Voir cases Phase 1-5 ci-dessus (toutes cochées).

## Future improvements

- `MessageReadStatusService.freezeMessageStatus` : converger sur `mergeViewedLanguages`
  (dédup normalisée) — candidat prochaine itération.
- `resolveLanguage` : acheminer `manualSelection` si une bascule per-bulle web existe.
