# Plan de correction — Itération 60wb (web)

**Cible** : `apps/web/components/admin/AdminLayout.tsx`
**Type** : bug de correctness (crash runtime) — sélecteur de thème admin
**Branche** : `claude/practical-fermat-8e8nhk`
**Base** : `main` HEAD post-iter-59w/60w (`09b7a84`)

## Renumérotation

Numérotée **60wb** : la 60w « config-modal i18n » (#806, agent parallèle) a mergé exactement le candidat initialement préparé ici. Surface repivotée sur un bug orthogonal (crash `setTheme`).

## Problème

Le menu de thème de l'en-tête admin appelle `setTheme(...)` (l.355/359/363) alors que `setTheme` n'est **ni importé ni défini** → `ReferenceError` au clic. Masqué au build par `next.config.ts` `typescript.ignoreBuildErrors: true`.

## Étapes

1. [x] Confirmer que `setTheme` n'est ni importé ni fourni par un hook dans `AdminLayout.tsx`.
2. [x] Identifier le setter canonique : `useAppActions().setTheme` (`stores/app-store.ts`, signature `'light'|'dark'|'auto'`).
3. [x] Ajouter `useAppActions` à l'import `@/stores` existant.
4. [x] Brancher `const { setTheme } = useAppActions();` dans le composant.
5. [x] Vérifier l'absence d'impact locale (clés `layout.theme*` déjà présentes).
6. [x] Commit + push sur la branche assignée ; CI verte (PR #805).
7. [x] Conflit `branch-tracking.md` détecté au merge (collision 60w) → resync `main`, renumérotation 60wb.
8. [ ] Re-merger `main`, repush, merger après CI.
9. [ ] Mettre à jour `branch-tracking.md` (Current State + History) et supprimer la branche après merge.

## Critères de complétude

- `setTheme` résolu (import + binding) ; diff = 2 lignes, 1 fichier.
- Aucun fichier locale modifié.
- Pas de régression : pattern identique à `theme-settings.tsx`.

## Suite (61w)

- `AdminLayout.tsx:351` `sr-only "Toggle theme"` → `layout.toggleTheme` ×4 (parité a11y, faible priorité).
- `PhoneResetFlow.tsx:490` `sr-only "Indicatif pays"` ; `AttachmentPreviewReply.tsx:205-206` (title/aria FR).
