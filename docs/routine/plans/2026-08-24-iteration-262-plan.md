# Plan — Itération 262 : consommer `resolvePrismTranslation` dans les résolveurs web (posts + focal)

## Objectifs

Router les deux dernières descentes du Prisme réécrites à la main dans `apps/web`
vers la SSOT partagée `resolvePrismTranslation`, éliminant un défaut de justesse sur
les codes de langue région-tagués (Prisme #3) et une duplication de boucle.

## Modules affectés

- `apps/web/hooks/use-post-translation.ts` (production)
- `apps/web/components/conversations/focal/focal-row-utils.ts` (production)
- `apps/web/__tests__/hooks/use-post-translation.test.tsx` (tests)
- `apps/web/components/conversations/focal/__tests__/focal-row-utils.test.ts` (tests)

## Phases

1. **RED** — 3 témoins neufs : (a) post `originalLanguage: 'en-US'` rang 1 → original
   gagne ; (b) clé `'pt-BR'` contre préférence `pt` → traduction servie ; (c) focal
   libellé `'pt-BR'` servi contre préférence `pt`. Mesurés rouges. ✅
2. **GREEN** — `findTranslation` délègue à `resolvePrismTranslation` (aplatir la
   forme) ; `resolveFocalMessageDisplay` fait UNE descente et lit `{ language, text }` ;
   suppression de `focalServedLanguage`. ✅
3. **Validation** — suites focal + feed + post-translation vertes ; `tsc` clean sur
   les fichiers touchés. ✅

## Dépendances

Aucune. `resolvePrismTranslation` est déjà exporté et éprouvé.

## Risques estimés

Faible — délégation à une fonction partagée existante, comportement préservé sur
codes canoniques.

## Stratégie de rollback

Revert d'un commit. Aucune migration, aucun contrat modifié.

## Critères de validation

- 3 témoins RED avant / GREEN après.
- `focal` 22 suites / 218 tests verts ; feed + post-translation verts.
- `tsc --noEmit` : 0 erreur ajoutée (baseline 1196 inchangée).

## Statut de complétion

**COMPLÉTÉ.**

## Suivi / améliorations futures

- **`use-audio-translation.ts` → `resolveAutoLanguage()`** : même boucle
  `.toLowerCase()`, HORS périmètre car la migration change la sémantique de
  sélection de piste vocale (région strippée ⇒ `fr-CA` matche `fr-FR`). Décision
  produit à trancher avant migration.
