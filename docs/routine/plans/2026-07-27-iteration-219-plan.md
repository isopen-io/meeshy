# Plan d'implémentation — Itération 219

## Objectifs
Canonicaliser `Message.originalLanguage` sur les **trois chemins d'écriture qui contournent le funnel**
`MessagingService.handleMessage` (déjà canonique depuis 218) : envoi share-link anonyme, envoi share-link
authentifié, et édition REST. Rendre la base homogène sur 100 % des surfaces d'envoi/édition.

## Modules affectés
- `services/gateway/src/routes/links/messages.ts` (2 handlers, 2 `message.create`)
- `services/gateway/src/routes/conversations/messages-advanced.ts` (édition REST, 1 `message.update` + source retraduction)
- Tests : `links-messages.test.ts`, `conversation-messages-advanced.test.ts`

## Phases
1. **RED** — Ajouter 4 tests :
   - links anon : `'fr-FR'` → `create` avec `originalLanguage: 'fr'`.
   - links anon : `'bas'` → `create` avec `'bas'` (non-régression irréductible).
   - links auth : `'en_US'` → `create` avec `'en'`.
   - édition REST : `'fr-FR'` → `update` avec `'fr'`.
2. **GREEN** — Importer `normalizeLanguageCode` ; normaliser au write dans les 3 sites via
   `normalizeLanguageCode(claim) ?? claim` (repli identique au funnel 218).
3. **REFACTOR** — Aucun (changement minimal, aligné sur le pattern 218).

## Dépendances
- `@meeshy/shared/utils/language-normalize` (`normalizeLanguageCode`) — déjà exporté sur `main`, déjà
  consommé par `MessagingService` (218) et `MessageTranslationService`. Aucune nouvelle dépendance.

## Risques estimés
Faible. Repli verbatim pour les codes irréductibles ; idempotent sur les codes déjà canoniques ; aucun
chemin de lecture modifié ; aucun round-trip réseau ajouté.

## Stratégie de rollback
Revert du commit unique (2 fichiers source + 2 fichiers de test). Aucune migration de données, aucun
changement de schema Prisma, aucun changement d'API contractuel.

## Critères de validation
- 131/131 sur les 2 suites ciblées (GREEN).
- RED prouvé par `git stash` de la source (3 tests échouent, `'bas'` reste vert).
- Suite gateway complète sans régression.

## Completion status
- [x] Analyse rédigée
- [x] Tests RED ajoutés + RED prouvé
- [x] Implémentation GREEN (3 sites)
- [x] Schema Prisma vérifié inchangé au commit
- [ ] Suite gateway complète verte
- [ ] Commit + push + merge

## Progress tracking
Itération 219 = extension directe de 218. 218 a couvert le funnel ; 219 couvre les 3 chemins hors funnel.
Le triptyque write-boundary (funnel + share-links + édition REST) est désormais complet côté messages.

## Future improvements
Voir « Future Considerations » de l'analyse : migration historique batch, convergence
`CommonSchemas.language` via `.transform`, audit posts/commentaires, préférences in-app.
# Plan — Iteration 219 : canonicalisation `customDestinationLanguage` au write boundary (SSOT)

## Objectifs
Rendre `User.customDestinationLanguage` (3e priorité du Prisme) canonique par construction en base,
via le SSOT `normalizeLanguageCode`, en supprimant la duplication du schéma faible.

## Modules affectés
- `packages/shared/utils/validation.ts` (sous-schéma partagé + 2 remplacements inline + import)
- `packages/shared/__tests__/validation.test.ts` (5 tests RED→GREEN)
- `services/gateway/src/services/preferences/PreferencesService.ts` (write boundary + import)
- `services/gateway/src/__tests__/unit/services/PreferencesService.test.ts` (3 tests RED→GREEN)
- `CHANGELOG.md`

## Phases
1. **RED** — tests validation.test.ts (`fr-FR`→`fr`, `en_US`→`en`, `bas` préservé, `''`/`null`,
   `UserSchemas.update`) + PreferencesService.test.ts (région-tag + ISO 639-3). ✅ échec confirmé
   (`fr-fr`/`en_us` reçus).
2. **GREEN** — sous-schéma `customDestinationLanguageCode` + import ; remplacement des 2 inline ;
   canonicalisation PreferencesService. ✅
3. **REFACTOR** — dédup (2 inline → 1 sous-schéma nommé documenté). ✅
4. **VALIDATION** — suites shared + gateway ciblées. ✅

## Dépendances
Aucune (SSOT `normalizeLanguageCode` déjà exporté sur `main` ; pas de dépendance aux PRs en vol).

## Risques estimés
Faible — repli `.toLowerCase()` préserve le comportement d'acceptation ; idempotent sur codes canoniques.

## Stratégie de rollback
Revert du commit unique (changements isolés à 5 fichiers, aucune migration DB).

## Critères de validation
- validation.test.ts : 44/44 (dont 5 nouveaux).
- Suites shared langue (validation, language-normalize, conversation-helpers, languages, esm) : 205/205.
- Gateway profile + PreferencesService + register(-extended) : 113/113.
- Gateway MessageTranslationService + messages-list-language + preferences e2e : 86/86.

## Statut de complétion
**COMPLET** — implémenté, testé (RED→GREEN), documenté. Prêt à merger.

## Suivi de progression
- [x] Analyse (docs/routine/analyses/2026-07-27-iteration-219-analyse.md)
- [x] Plan (ce fichier)
- [x] Tests RED
- [x] Implémentation GREEN
- [x] Déduplication schéma
- [x] Validation suites
- [x] CHANGELOG
- [ ] Commit + push + PR + merge + delete branch

## Améliorations futures
- Migration idempotente des lignes `User.customDestinationLanguage` historiques région-taggées.
- Vérifier miroir client iOS/web (aucun write non validé de `customDestinationLanguage`).
