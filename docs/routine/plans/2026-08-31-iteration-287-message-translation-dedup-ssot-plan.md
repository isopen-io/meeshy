# Plan d'implémentation — Itération 287

## Objectifs
Consolider les cinq résolveurs inline de canonicalisation-avec-repli de
`MessageTranslationService` sur la SSOT `normalizeLanguageForDedup`, fermant la
divergence région-taguée-hors-catalogue (dédup + filtre d'auto-traduction).

## Modules affectés
- `services/gateway/src/services/message-translation/MessageTranslationService.ts`
  (import + 5 remplacements + 3 doc-comments)
- `services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts`
  (pins RED)
- `services/gateway/src/__tests__/unit/services/message-translation-source-language.test.ts`
  (pins RED)

## Phases
1. **RED** — ajouter les cas région-tagués hors-catalogue (`fil-PH`, `ceb-PH`)
   aux deux suites ; prouver le rouge sur l'inline.
2. **GREEN** — importer `normalizeLanguageForDedup` ; remplacer 466, 471, 502,
   759, 909 ; aligner les doc-comments.
3. **REFACTOR** — vérifier qu'aucune autre occurrence inline ne subsiste hors du
   store-key `getTranslation` (3157, hors périmètre documenté).

## Dépendances
- `packages/shared` construit (dist) — `normalizeLanguageForDedup` exporté.

## Risques estimés
Faible. Idempotent sur les codes du catalogue NLLB ; ne resserre que les codes
région-tagués hors-catalogue. `'auto'`/vides gardés en amont.

## Stratégie de rollback
Revert du commit unique — changement isolé à un fichier de production + deux
suites.

## Critères de validation
Voir l'analyse. Gates : deux suites + retranslation-scope vertes, `tsc --noEmit`
gateway à 0 erreur.

## Statut de complétion
Livré dans le même commit.

## Suivi / améliorations futures
- Aligner la clé de LECTURE de `getTranslation` (3157) sur la SSOT après audit du
  schéma d'écriture des clés du store `Message.translations` (issue à ouvrir).
