# Plan d'implémentation — Itération 220

## Objectifs
Canonicaliser `originalLanguage` au **write boundary** du domaine social (Post + PostComment), parité avec
le funnel messages (218) et les chemins hors-funnel messages (219, PR #2371). Rendre la base homogène sur
100 % des surfaces d'écriture claim-driven, messages **et** social. Bonus : supprimer la re-traduction
fantôme à l'édition d'un post quand le client renvoie une variante régionale de la même langue.

## Modules affectés
- `services/gateway/src/services/PostService.ts` (`createPost`, `updatePost` + trigger story-translation)
- `services/gateway/src/services/PostCommentService.ts` (`addComment`)
- `services/gateway/src/routes/posts/core.ts` (source de traduction = valeur canonique persistée, SSOT)
- Tests : `services/gateway/src/__tests__/unit/PostService.test.ts`

## Phases
1. **RED** — 6 tests ajoutés (prouvés RED via source revertée) :
   - createPost `'fr-FR'` → `create` avec `'fr'`.
   - createPost `'en_US'` → `create` avec `'en'`.
   - createPost `'bas'` → `create` avec `'bas'` (non-régression irréductible, vert avant/après).
   - updatePost variante régionale `'fr-FR'` vs stocké `'fr'` → **pas** de re-traduction (`originalLanguage`
     & `translations` absents de l'update).
   - updatePost vraie bascule `'en_US'` (stocké `'fr'`) → `update` avec `'en'` + `translations: {}`.
   - addComment `'fr-FR'` → `create` avec `'fr'` ; + `'bas'` verbatim ; + claim absente → `null`.
2. **GREEN** — Importer `normalizeLanguageCode` ; normaliser via `normalizeLanguageCode(claim) ?? claim`
   (repli identique au funnel 218/219) dans les 3 services ; câbler `core.ts` sur la valeur stockée.
3. **REFACTOR** — Aucun (changement minimal, aligné sur le pattern 218/219).

## Dépendances
- `@meeshy/shared/utils/language-normalize` (`normalizeLanguageCode`) — déjà sur `main`, déjà consommé par
  `MessagingService` (218) et les routes links/messages (219). Aucune nouvelle dépendance, aucun rebuild
  `dist` (ts-jest transpile la source).

## Risques estimés
Faible. Repli verbatim pour codes irréductibles ; idempotent sur codes déjà canoniques ; `detectLanguage`
(fallback sans claim) inchangé ; aucun chemin de lecture modifié ; `core.ts` bascule vers une valeur
strictement plus correcte (canonique) déjà en main.

## Stratégie de rollback
Revert du commit unique (3 fichiers source + 1 fichier de test). Aucune migration de données, aucun
changement de schema Prisma, aucun changement d'API contractuel.

## Critères de validation
- RED prouvé (source revertée) : 5 tests de canonicalisation échouent, les 3 non-régression restent verts.
- GREEN : 103/103 sur `PostService.test.ts`.
- Suites posts/traduction/commentaires connexes vertes (core, core-extended, posts-core,
  core.story-translation, PostTranslationService, PostCommentService) : 197/197.
- Suite gateway complète sans régression.

## Completion status
- [x] Analyse rédigée
- [x] Tests RED ajoutés + RED prouvé (5 échecs ciblés)
- [x] Implémentation GREEN (3 services + route)
- [x] Schema Prisma vérifié inchangé
- [x] Suites ciblées + connexes vertes (103 + 197)
- [x] Suite gateway complète verte (542/542 suites, 14688 tests, exit 0)
- [x] Commit + push + PR

## Progress tracking
Itération 220 = extension cross-domaine directe de 218/219. 218 → funnel messages ; 219 (#2371) → chemins
messages hors funnel ; 220 → domaine social (Post + PostComment). Le write-boundary de canonicalisation
`originalLanguage` couvre désormais messages **et** social.

## Future improvements
Voir « Future Considerations » de l'analyse : migration historique batch (Post/PostComment),
convergence `CommonSchemas.language` via `.transform` (SSOT unique au parse, tous consommateurs désormais
audités), audit `systemLanguage`/`regionalLanguage` (préférences in-app ; #2375 couvre déjà
`customDestinationLanguage`).
