# Iteration 237 — Plan : frontière gauche du SSOT pour `removingHandle`

## Objectives
Fermer le drift entre la DÉTECTION de mention (`mention-parser.ts`, qui exporte
`NAME_BOUNDARY_LEFT`) et la SUPPRESSION de mention (`composer-references.removingHandle`, qui ne
l'appliquait pas), pour qu'un `@handle` collé à un e-mail (`bob@alice`) ne soit plus retiré du
texte du composeur.

## Affected modules
- `packages/shared/utils/composer-references.ts` — import + application de `NAME_BOUNDARY_LEFT`.
- `packages/shared/__tests__/utils/composer-references.test.ts` — +2 tests de régression.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift` — miroir Swift.

## Implementation phases
1. **RED** — ajouter les tests `bob@alice` préservé + frontière propre toujours retirée
   (échouent sur le code actuel car le fragment e-mail était amputé).
2. **GREEN** — importer `NAME_BOUNDARY_LEFT`, insérer le lookbehind à hauteur du `@`.
3. **Miroir** — répliquer le lookbehind dans le Swift.
4. **Validate** — vitest ciblé + suites mention + `tsc` + build.

## Dependencies
Aucune nouvelle dépendance externe. Import interne au package `@meeshy/shared`
(`composer-references` → `mention-parser`) ; pas de cycle (`mention-parser` n'importe pas
`composer-references`).

## Estimated risks
Très faible. Seul le NON-retrait d'un handle collé à un caractère de nom change — cas déjà
traité comme non-mention par la détection. 9 tests existants préservés.

## Rollback strategy
Revert du commit unique. Aucune migration de données, aucun changement de schéma/contrat de
wire, aucun état persisté touché.

## Validation criteria
- `composer-references.test.ts` : 11/11 verts.
- `mention-parser.test.ts` + `mention-extract.test.ts` : 69/69 (non régressés).
- `tsc --noEmit --project tsconfig.json` : 0 erreur.
- Build `dist/` : OK.

## Completion status
- [x] Tests RED ajoutés
- [x] Frontière gauche appliquée (TS)
- [x] Miroir Swift
- [x] Analyse + plan écrits
- [x] Validation locale verte
- [ ] Commit + push branche
- [ ] Revue Codex

## Progress tracking
Itération autonome 237. Commit de départ `6b3fc59e`. Une seule unité de changement, cohérente,
testée.

## Future improvements
Voir la section « Améliorations futures » de l'analyse : audit des autres consommateurs de
`@handle` iOS, et brique partagée `mentionSpanPattern(handle)` pour rendre le drift
structurellement impossible.
