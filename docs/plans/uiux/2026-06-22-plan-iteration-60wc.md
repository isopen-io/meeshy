# Plan de correction — Itération 60wc (web)

**Cible** : `apps/web/components/admin/AdminLayout.tsx`
**Type** : bug de correctness (crash runtime) — sélecteur de thème admin
**Branche** : `claude/practical-fermat-8e8nhk`
**Base** : `main` HEAD post-iter-60w (#806) + iter-60wb (#808)

## Renumérotation

Numérotée **60wc** : 60w « config-modal i18n » (#806) puis 60wb « auth `t()||` anti-pattern » (#808, agent parallèle `o2g4dt`) ont mergé avant cette branche. Surface (bug `setTheme`) orthogonale aux deux.

## Problème

Le menu de thème de l'en-tête admin appelle `setTheme(...)` (l.355/359/363) alors que `setTheme` n'est **ni importé ni défini** → `ReferenceError` au clic. Masqué au build par `next.config.ts` `typescript.ignoreBuildErrors: true`.

## Étapes

1. [x] Confirmer que `setTheme` n'est ni importé ni fourni par un hook dans `AdminLayout.tsx`.
2. [x] Identifier le setter canonique : `useAppActions().setTheme` (`stores/app-store.ts`, signature `'light'|'dark'|'auto'`).
3. [x] Ajouter `useAppActions` à l'import `@/stores` existant.
4. [x] Brancher `const { setTheme } = useAppActions();` dans le composant.
5. [x] Vérifier l'absence d'impact locale (clés `layout.theme*` déjà présentes).
6. [x] Commit + push ; CI verte (PR #805).
7. [x] Résoudre les collisions de merge successives (60w→60wb→60wc) sur `branch-tracking.md`.
8. [ ] Merger dans `main` après CI verte ; supprimer la branche.

## Critères de complétude

- `setTheme` résolu (import + binding) ; diff code = 2 lignes, 1 fichier.
- Aucun fichier locale modifié.
- Pas de régression : pattern identique à `theme-settings.tsx`.

## Suite (61w)

- `AdminLayout.tsx:351` `sr-only "Toggle theme"` → `layout.toggleTheme` ×4 (parité a11y, faible priorité).
- Reste de l'anti-pattern `t()||` (~270 occ / ~48 fichiers, après #808) — différé borné 60wd+.
- `PhoneResetFlow.tsx:490` `sr-only "Indicatif pays"` ; `AttachmentPreviewReply.tsx:205-206` (title/aria FR).
