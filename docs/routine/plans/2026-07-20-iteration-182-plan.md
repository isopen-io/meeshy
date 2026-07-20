# Plan — Iteration 182 : normalisation SSOT de `originalLanguage`/`targetLanguage` dans `PostTranslationService`

## Objectifs
Canonicaliser tout code de langue fourni par le client (source & cible) via la
SSOT `normalizeLanguageCode` avant filtrage/cache/ZMQ dans le dispatcher de
traduction posts/commentaires, pour éliminer les jobs source→source inutiles et
les clés `translations` divergentes.

## Modules affectés
- `services/gateway/src/services/posts/PostTranslationService.ts` (impl)
- `services/gateway/src/services/posts/__tests__/PostTranslationService.test.ts` (tests)

## Phases d'implémentation
1. **RED** — +7 tests (bloc « language-code normalization (Prisme SSOT) »). ✅
2. **GREEN** — import `normalizeLanguageCode` ; normaliser la source dans
   `translatePost`/`translateComment` ; normaliser source+cible dans
   `translateOnDemand` (garde, cache, ZMQ, logs). ✅
3. **REFACTOR** — aucun (les 3 sites délèguent déjà à la même SSOT ; pas de
   duplication à extraire). ✅

## Dépendances
`@meeshy/shared/utils/language-normalize` (déjà utilisé par `deviceLocale.ts`,
`MessageTranslationService.ts`, `routes/anonymous.ts`). Aucune nouvelle dep.

## Risques estimés
Très faibles. `normalizeLanguageCode` = no-op sur code canonique ; fallback
`detectLanguage`/code brut préserve le comportement pour les codes inconnus.

## Stratégie de rollback
Revert du commit unique (fichier impl + fichier test) — aucun changement de
schéma, migration, ni contrat public.

## Critères de validation
- `PostTranslationService.test.ts` : 48/48. ✅
- `src/services/posts` + `src/routes/posts` : 232/232. ✅
- `tsc --noEmit` gateway : 0 erreur. ✅

## Statut de complétion
**COMPLÉTÉ** — impl + tests verts, typecheck propre, prêt à merger.

## Suivi de progression
- [x] Analyse rédigée (`analyses/2026-07-20-iteration-182-analyse.md`)
- [x] Plan rédigé (ce fichier)
- [x] RED (7 tests échouent sur le code non normalisé)
- [x] GREEN (impl, 48/48 + 232/232)
- [x] Typecheck (0 erreur)
- [ ] Commit + push
- [ ] Merge dans `main` + suppression branche

## Améliorations futures
- F182-A : uppercase `languageName` dans `status-transforms`/`story-transforms`.
- F182-B : localiser le fallback `'Expire'` de `StatusBar.tsx`.
- Envisager une normalisation à l'**écriture** de `Post.originalLanguage`
  (`PostService.createPost`) pour que la donnée persistée soit canonique dès la
  source — plus large (touche le stockage + migration potentielle), donc laissé
  hors périmètre de cette itération surgicale.
