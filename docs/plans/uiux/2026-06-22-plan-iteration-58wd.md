# Plan de correction — Itération 58wd (web)

**Branche** : `claude/practical-fermat-6731tz`
**Suffixe** : `wd` (web ; `58w`/`58wb`/`58wc` déjà consommés par agents parallèles → `58wd`)
**Thème** : i18n des primitives partagées d'état (erreur / chargement)

## Objectif
Internationaliser deux composants d'infrastructure partagés restés en français figé,
sans collision avec les PR iter-58w en vol (feed, modales a11y, OTP).

## Étapes
1. ✅ Étendre le namespace `common` (`errorBoundary`) ×4 locales avec 3 clés :
   `featureError` (param `{feature}`), `featureUnavailable`, `retry`.
2. ✅ `FeatureErrorBoundary.tsx` (class component) → extraire `FeatureErrorFallback`
   (fonction) consommant `useI18n('common')` ; remplacer les 4 chaînes FR.
3. ✅ `LoadingStates.tsx` → `LoadingState` : défaut i18n `t('loading', 'Loading...')`.
4. ✅ Mettre à jour `__tests__/components/LoadingStates.test.tsx` (défaut → `'Loading...'`).
5. ✅ Vérifier : jest (29/29), tsc (0 err), JSON valides, grep FR vide, CI #794 verte.
6. ✅ Commit + push + PR #794 ; merge dans `main` (après re-rebase / renumérotation 58wd).

## Hors périmètre (déféré, ne pas trancher à l'aveugle)
- Consolidation des deux composants `LoadingState` (ui/ vs common/) — arbitrage visuel.
- Couleurs `bg-red-100`/`text-red-600` de `FeatureErrorBoundary` (non dark-aware) —
  relève de l'arbitrage tokens `gp-*` (cf. déféré 56wb), pas de cette passe i18n.

## Statut : ✅ Développement terminé — merge en cours (PR #794)
