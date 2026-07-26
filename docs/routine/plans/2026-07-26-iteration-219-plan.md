# Plan d'implémentation — Iteration 219

## Objectifs
Rendre `Message.originalLanguage` **canonique par construction** sur les 2 chemins d'envoi share-link
(`routes/links/messages.ts:196` anonyme, `:445` enregistré), en fermant le dernier write boundary de
langue hors funnel `MessagingService` (legs explicite de l'itération 218).

## Modules affectés
- `services/gateway/src/routes/links/types.ts` — schéma Zod `sendMessageSchema` (write boundary partagé).
- `services/gateway/src/__tests__/unit/routes/links/types.test.ts` — tests RED→GREEN.

## Phases
1. **RED** — Ajouter 2 tests à `types.test.ts` :
   - canonicalisation des locales région-taggés (`fr-FR`/`fr_FR`/`FR`/`en-US`/`zh-Hant-HK`).
   - préservation verbatim des codes irréductibles (`bas`, `xx`).
2. **GREEN** — `types.ts` : importer `normalizeLanguageCode`, ajouter `.transform((v) => normalizeLanguageCode(v) ?? v)`
   sur `originalLanguage` (après `.default('fr')`).
3. **Validation** — `types.test.ts` 32/32 ; `routes/links/**` 229/229 ; RED prouvé par stash du fix.

## Dépendances
Aucune. `normalizeLanguageCode` déjà exporté sur `main` et consommé par 6 fichiers gateway.

## Risques estimés
Très faible (cf. analyse §Risk assessment). Placement schéma = SSOT partagé, repli verbatim, idempotent.

## Stratégie de rollback
Revert du commit unique — changement isolé à 2 fichiers, aucune migration, aucun impact sur les
lignes existantes (idempotent sur `'fr'`).

## Critères de validation
- RED : `'fr-FR'` conserve `'fr-FR'` sans fix (1 failed / 31 passed). ✅
- GREEN : suite `types.test.ts` 32/32. ✅
- Non-régression : `routes/links/**` 229/229. ✅

## Statut de complétion
**Terminé** — RED prouvé, GREEN vert, non-régression verte, docs écrites.

## Suivi de progression
- [x] Audit anti-doublon PRs ouvertes
- [x] Audit legs 218 (édition écartée, share-link confirmés)
- [x] RED (2 tests)
- [x] GREEN (transform schéma)
- [x] Validation (32/32 + 229/229)
- [x] Analyse + plan
- [ ] Commit + push + PR

## Améliorations futures
Voir analyse §Future Considerations (migration historique, prefs in-app, attachements share-link).
