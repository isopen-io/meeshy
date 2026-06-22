# Plan de correction — Itération 60w (web)

**Cible** : `apps/web/components/admin/AdminLayout.tsx`
**Type** : bug de correctness (crash runtime) — sélecteur de thème admin
**Branche** : `claude/practical-fermat-8e8nhk`
**Base** : `main` HEAD post-iter-59w (`9857819`)

## Problème

Le menu de thème de l'en-tête admin appelle `setTheme(...)` (l.355/359/363) alors que `setTheme` n'est **ni importé ni défini** → `ReferenceError` au clic. Masqué au build par `next.config.ts` `typescript.ignoreBuildErrors: true`.

## Étapes

1. [x] Confirmer que `setTheme` n'est ni importé ni fourni par un hook dans `AdminLayout.tsx`.
2. [x] Identifier le setter canonique : `useAppActions().setTheme` (`stores/app-store.ts`, signature `'light'|'dark'|'auto'`).
3. [x] Ajouter `useAppActions` à l'import `@/stores` existant.
4. [x] Brancher `const { setTheme } = useAppActions();` dans le composant.
5. [x] Vérifier l'absence d'impact locale (clés `layout.theme*` déjà présentes).
6. [ ] Commit + push sur la branche assignée.
7. [ ] PR vers `main`, attendre CI verte, merger.
8. [ ] Mettre à jour `branch-tracking.md` (Current State + History) et supprimer la branche après merge.

## Critères de complétude

- `setTheme` résolu (import + binding) ; diff = 2 lignes, 1 fichier.
- Aucun fichier locale modifié.
- Pas de régression : pattern identique à `theme-settings.tsx`.

## Suite (61w)

- `config-modal.tsx` i18n (6 onglets + titre + 2 labels a11y) — surface orthogonale, déjà documentée.
- `AdminLayout.tsx:351` `sr-only "Toggle theme"` → `layout.toggleTheme` ×4 (parité a11y, faible priorité).
