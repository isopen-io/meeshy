# Iteration 127 — Plan d'implémentation (2026-07-07)

## Objectifs
Établir une couverture de test **directe** sur `parseMessageLinks` (segmentation de liens de tout
message texte web) — priorité mshy > tracking > url, tri par position, invariant de reconstruction —
sans toucher au code de production (F91).

## Modules affectés
- `apps/web/__tests__/lib/link-parser.test.ts` (**nouveau**, 14 cas).
- Aucun fichier de production modifié.

## Phases d'implémentation
1. **[fait]** Auditer `parseMessageLinks` : regex (URL/tracking/mshy), dédoublonnage par `index`,
   tri, calcul `start/end`, chemins de token.
2. **[fait]** Vérifier l'import propre du module en env Jest `jsdom` (probe → `mshy-link`).
3. **[fait]** Écrire les 14 cas contre la vraie fonction : texte, chaîne vide, `m+TOKEN`
   (seul/enrobé/multiple/trop court/frontière de mot), tracking-link (meeshy + domaine arbitraire),
   URL nue, tri, coexistence, reconstruction sans perte, intervalles contigus.
4. **[fait]** Valider : jest (14/14), dossier `__tests__/lib/` (30 suites, 784 pass).

## Dépendances
Aucune. Test only, aucun nouvel import runtime, aucune migration.

## Risques estimés
- **Nuls côté production** : aucune ligne de production modifiée. Les assertions gèlent le
  comportement réel observé.

## Stratégie de rollback
`git revert` du commit unique (supprime le seul fichier de test).

## Critères de validation
- [x] `link-parser.test.ts` : 14 pass / 0 fail.
- [x] `__tests__/lib/` : 30 suites / 784 pass / 2 skipped — aucune régression.
- [x] `bun.lock` restauré (parité `origin/main`) ; diff = 1 fichier de test + 2 docs routine.
- [ ] CI verte (jest web) après push.

## Statut de complétion
**Implémentation complète, validée localement (jest).** En attente de CI.

## Suivi de progression / prochaines priorités
- Backlog : F88 (clamp `truncateFilename`), F92 (test dédié `hasLinks`/`isTrackingLink`/
  `extractTrackingToken` — regex `g` recréées par appel, vérifier l'absence de faux négatifs).
