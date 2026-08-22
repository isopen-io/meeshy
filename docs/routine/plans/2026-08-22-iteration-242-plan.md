# Iteration 242 — Plan : partager `escapeRegex` (SSOT) pour supprimer le crash à tiret de `removingHandle`

## Objectives
Éliminer le `SyntaxError` que `removingHandle` lève sur tout username à tiret (`@marie-claire`)
en réutilisant le `escapeRegex` correct de `mention-parser.ts` au lieu de la copie locale
divergente qui ajoutait `-` à sa classe (invalide hors classe sous le flag `u`).

## Affected modules
- `packages/shared/utils/mention-parser.ts` — `export` de `escapeRegex` + docstring interdisant `-`.
- `packages/shared/utils/composer-references.ts` — import + réutilisation ; copie locale supprimée.
- `packages/shared/__tests__/utils/composer-references.test.ts` — +2 témoins de régression.

## Implementation phases
1. **RED** — témoin `removingHandle('marie-claire', 'Bonjour @marie-claire !')` (échoue :
   `SyntaxError: Invalid escape`) + témoin frontière droite à tiret. ✅
2. **GREEN** — exporter `escapeRegex` ; `removingHandle` l'importe et l'utilise ; retirer la copie. ✅
3. **Validate** — vitest ciblé + suite `packages/shared` complète + `tsc --noEmit` + build `dist/`. ✅

## Dependencies
Aucune dépendance externe. Import interne au package (`composer-references` → `mention-parser`) ;
pas de cycle (`mention-parser` n'importe pas `composer-references`).

## Estimated risks
Très faible. Retirer `-` de la classe d'échappement est un no-op pour tout caractère sauf le
tiret ; pour le tiret, le comportement passe de « crash » à « retrait correct ». 9 témoins
historiques préservés.

## Rollback strategy
Revert du commit unique. Aucune migration, aucun changement de schéma/wire, aucun état persisté.

## Validation criteria
- `composer-references.test.ts` : 11/11.
- Suite `packages/shared` : 98 fichiers / 2372 tests verts.
- `tsc --noEmit --project tsconfig.json` : 0 erreur.
- Build `dist/` : OK.

## Completion status
- [x] Tests RED ajoutés (crash reproduit)
- [x] `escapeRegex` exporté (SSOT) + docstring
- [x] `removingHandle` réutilise le SSOT ; copie supprimée
- [x] Analyse + plan écrits
- [x] Validation locale verte
- [ ] Commit + push branche
- [ ] Revue Codex

## Progress tracking
Itération autonome 242. Commit de départ `e847456d`. Une seule unité de changement, cohérente,
testée. Bug trouvé par deux passes d'audit (26 fichiers utilitaires purs) ; seul défaut de
correction reproductible retenu.

## Future improvements
Voir la section « Améliorations futures » de l'analyse : fusion des deux imports une fois #3262
mergée ; audit des schémas Zod du gateway pour d'autres bornes/gardes manquantes.
