# Plan d'implémentation — Itération 184

## Objectifs
Aligner `CommonSchemas.language` sur la SSOT de normalisation de langue
(`normalizeLanguageCode`) afin de :
1. Supprimer la corruption latente du Prisme : `originalLanguage` persisté verbatim
   (`'en-US'`) qui ne matche jamais le code lecteur normalisé (`'en'`).
2. Supprimer la contradiction interne regex `/^[a-z]{2,3}(-[A-Z]{2})?$/` ↔ `max(5)`
   (rejette `'bas-CM'` alors qu'il matche le regex).
3. Rétablir des contrats de doc honnêtes (`attachment-validators.ts`).

## Modules affectés
- `packages/shared/utils/validation.ts` — `CommonSchemas.language` (schéma + import).
- `packages/shared/__tests__/validation.test.ts` — bloc `language` (TDD).
- `packages/shared/utils/attachment-validators.ts` — doc `languageCodeSchema` (comment).

## Phases
1. **RED** — Réécrire le bloc de tests `language` : assertions de normalisation
   (`parse('en-US') === 'en'`, `'zh-Hant-HK' → 'zh'`, `'es-419' → 'es'`,
   `'bas-CM' → 'bas'`, `'EN' → 'en'`) + rejets durcis (`''`, `'123'`, `'@@'`).
   Confirmer l'échec sur le code actuel. ✅
2. **GREEN** — `validation.ts` : `import { normalizeLanguageCode }` ; schéma
   `z.string().min(2).max(35).transform(normalizeLanguageCode).refine(v !== undefined)`.
   Confirmer le vert. ✅
3. **DOC** — `attachment-validators.ts` : remplacer le claim « mirrors the widened
   CommonSchemas.language regex » par la distinction réelle (forme brute préservée
   vs normalisation). ✅
4. **VALIDATE** — `vitest run` complet + `tsc --noEmit`. ✅

## Dépendances
Aucune. `validation.ts` → `language-normalize.ts` → `languages.js` : pas de cycle
(validation.ts n'est importé par aucun des deux).

## Risques estimés
- Bascule de contrat `'EN'` rejeté → accepté→`'en'` : amélioration (robustesse
  locale réelle), pas une régression. Aucun consommateur ne dépend du rejet de
  `'EN'`.
- Type de sortie inchangé (`string`) → `SendMessageBody` / `.default('fr')` intacts.

## Stratégie de rollback
Revert du commit unique — changement isolé à 3 fichiers `packages/shared`, aucune
migration de données, aucune signature publique modifiée.

## Critères de validation
- `packages/shared` : 46 suites / 1368 tests verts (bloc langue 7 tests). ✅
- `tsc --noEmit` : exit 0. ✅

## Statut de complétion
**COMPLÉTÉ** — les 4 phases livrées et validées.

## Suivi de progression
- [x] RED (tests de normalisation)
- [x] GREEN (transform SSOT)
- [x] DOC (comment honnête)
- [x] Validation (vitest + tsc)
- [x] Analyse + plan consignés
- [ ] Commit + push branche
- [ ] Merge main + delete branche (géré par la routine)

## Améliorations futures (roadmap)
- **Chokepoint unique gateway** : normaliser `claimedLanguage` dans
  `MessagingService.ts:181` pour couvrir REST **et** socket en un point. Bloqué par
  l'absence de run gateway reproductible dans cet environnement.
- **Durcir le schéma socket** `originalLanguage: z.string().optional()` en parité
  avec le chemin REST une fois le chokepoint en place.
