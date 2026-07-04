# Iteration 97 — Plan d'implémentation (2026-07-04)

## Objectives
Fermer **F61** : dérive de frontière ASCII↔Unicode résiduelle dans `parseMentions`. Aligner la
frontière gauche du fallback `@username` sur `NAME_BOUNDARY_LEFT` (Unicode) déjà utilisée par le path
`@DisplayName`, de sorte qu'un `@handle` collé à une lettre accentuée/non-latine (adresse e-mail)
ne soit plus résolu comme une mention.

## Affected modules
- `packages/shared/utils/mention-parser.ts` (production, 1 ligne + JSDoc).
- `packages/shared/__tests__/mention-parser.test.ts` (1 test de régression).

## Implementation phases
1. **RED** — ajouter dans le bloc `résolution exacte (pas de préfixe)` un test :
   `parseMentions('écris à André@atabeth.com', participants)` ⇒ `[]` (+ variante cyrillique).
   Observé `['u1']` avant fix. ✅
2. **GREEN** — `const handleRegex = new RegExp(`${NAME_BOUNDARY_LEFT}@(\\w{1,30})`, 'gu');`. ✅
3. **JSDoc** — mettre à jour la description du point 2 (frontière Unicode, pas ASCII). ✅
4. **Validation** — suite shared complète + `tsc`. ✅

## Dependencies
Aucune. Réutilise une constante déjà présente dans le module.

## Estimated risks
Très faible. Comportement strictement plus restrictif (rejette des faux positifs). Aucun cas de
mention légitime affecté (frontière espace/début/ponctuation non-nom inchangée). Usernames restent
ASCII (`\w{1,30}` inchangé, flag `u` ne modifie pas `\w`).

## Rollback strategy
Revert du commit unique. Fichier isolé, aucun changement de contrat public ni de signature.

## Validation criteria
- [x] RED prouvé (`['u1']` → attendu `[]`).
- [x] `__tests__/mention-parser.test.ts` 26/26 verts après fix.
- [x] Suite `packages/shared` complète 1258/1258 verte.
- [x] `bun run build` shared : 0 erreur tsc.
- [x] Aucun fichier partagé avec la PR #1462 en vol.

## Completion status
**COMPLETE.** Fix implémenté, testé RED→GREEN, suite complète verte, build vert.

## Progress tracking
- it.90 → F52 (story caption source lang) ✅
- it.91 → réaction socket postType STORY/STATUS/REEL ✅
- it.92 → F51 (FirebaseNotificationService dead FCM) ✅
- it.93 → F56 (likeCount self-echo double-count) ✅
- it.94 → F55 (reels cache desync web edit/delete) ✅
- it.95 → F57 (`hasMentions` ASCII→Unicode) ✅
- it.96 → F58 (comment-reaction `postType` STATUS/REEL collapse) ✅ (PR #1465, session parallèle)
- **it.97 → F61 (`parseMentions` fallback `@username` ASCII→Unicode) ✅ (ce cycle)**

## Future improvements
Voir la section « Améliorations futures » de l'analyse it.97 : F51b, F56b, F59, F60, F62.
Priorité suivante suggérée : **F62** (case drift `resolveUserLanguage`) après confirmation qu'il est
live et non latent ; sinon **F59** (itération gateway comment-reaction dédiée, hors fichiers en
vol PR #1462).
