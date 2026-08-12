# Iteration 101 — Plan d'implémentation (2026-07-05)

## Objectifs
Corriger deux défauts de cas-limite dans les utilitaires de formatage d'affichage **purs** du web,
disjoints des 8 PR ouvertes :
- **F65** : `truncateFilename` produit une sortie **plus longue que l'entrée**, préfixée `....`, pour les
  noms sans extension (ou à extension plus longue que le budget).
- **F66** : `formatCompactNumber` affiche `1000.0K` / `1000.0M` (au lieu de `1.0M` / `1.0B`) à la
  frontière d'arrondi de palier.

## Modules affectés
- `apps/web/utils/truncate.ts` (source — 1 fonction)
- `apps/web/utils/format-number.ts` (source — 1 fonction)
- `apps/web/__tests__/utils/truncate.test.ts` (tests renforcés + nouveaux cas)
- `apps/web/__tests__/utils/format-number.test.ts` (nouveaux cas frontière)

Aucun appelant modifié — les fonctions sont pures ; le fix se propage via l'import
(`MarkdownViewer`, `PDFViewerWrapper`, `PostDetail`, `CommunityCarousel`, `me/page`).

## Phases d'implémentation
1. **RED** — script Node autonome (impls copiées verbatim du code courant) : 7 assertions échouent
   (`....averylongname…`, dépassement long-ext, `1000.0K`, `1000.0M`, `-1000.0K`). ✅
2. **GREEN** —
   - `truncateFilename` : garde `dot <= 0` (pas d'extension / dotfile) et `nameBudget < 1` (extension ≥
     budget) → repli `head + '...'` clampé à `maxLength - 3` ; format avec-extension inchangé. ✅
   - `formatCompactNumber` : seuils de palier abaissés à `999_950` (M) et `999_950_000` (B) + commentaire. ✅
3. **REFACTOR** — helper local `head(budget)` mutualisant les deux replis de `truncateFilename`. ✅
4. **Tests** — renforcement du test no-extension (asservissait seulement `.toContain('...')`) + cas
   long-ext, dotfile, sweep mixte ; frontières K→M / M→B et négatifs. ✅

## Dépendances
Aucune. Strictement disjoint des PR #1486/#1485/#1483/#1481/#1479/#1477/#1475/#1473 (aucune ne touche
`apps/web/utils/truncate.ts` ni `format-number.ts`).

## Risques estimés
Très faible : fonctions pures, no-op sur le cas nominal (noms courts, valeurs hors frontière). Aucun
contrat public modifié. Aucun appelant ne dépendait de la sortie boguée.

## Stratégie de rollback
Revert du commit unique — 2 fichiers source + 2 fichiers de test.

## Critères de validation
- [x] RED prouvé (7 assertions échouent sur le code courant).
- [x] GREEN + balayages exhaustifs (`0→1.2 Md` sans `1000.0` ; noms mixtes × budgets `8..32` tous
      `<= maxLength`, jamais de préfixe `....`).
- [x] Tests jest ajoutés/renforcés (cohérents avec la vérification Node autonome).
- [ ] CI verte après push (jest web non exécutable localement — monorepo non bootstrappé).

## Statut de complétion
- [x] Phase 1 (RED)
- [x] Phase 2 (GREEN)
- [x] Phase 3 (REFACTOR)
- [x] Phase 4 (tests)
- [x] Validation locale (Node autonome)
- [ ] Push + CI verte
- [ ] Merge main

## Suivi de progression
F65 + F66 soldés. F67 écarté (parité intentionnelle iOS/web). Backlog restant : F51b, F56b (bloqué par
#1479), F67 (docs).

## Améliorations futures
Voir l'analyse (section « Améliorations futures »).
