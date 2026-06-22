# Analyse UI/UX — Itération 58wd (web)

**Date** : 2026-06-22
**Périmètre** : application web (`apps/web`) — EXCLUSIVEMENT
**Thème** : i18n des primitives partagées d'état (erreur / chargement)

> **Renumérotée 58wb → 58wd** : collision constatée au merge — un agent parallèle a
> livré une `58wb` distincte (i18n `PostsFeedScreen`/`FeedTabs`). `58w`=#792 (a11y
> modales), `58wb`=PostsFeedScreen, `58wc`=#784 (ConversationSettingsModal) → ce
> travail (périmètre disjoint) prend **58wd**.

## Contexte
Itération de continuité. Au lancement, de nombreuses PR parallèles iter-58w étaient
déjà ouvertes par d'autres agents (feed : `PostsFeedScreen`, `ReelsFeedScreen`,
`ConversationSettingsModal` ; gestes/a11y modales hand-rolled ; OTP). Pour **éviter la
divergence**, choix d'une surface **distincte et self-contained** non couverte par ces
PR : les composants d'infrastructure partagés (error boundary, loading state) restés en
français figé.

## Constats

### 1. `components/ui/FeatureErrorBoundary.tsx` — FR figé, aucun hook i18n
ErrorBoundary par fonctionnalité (monté dans `app/settings/page.tsx`,
`components/conversations/ConversationLayout.tsx`). 4 chaînes **FR dures** affichées en
TOUTES langues lors d'un crash de feature :
- titre `Une erreur s'est produite dans {feature}` (paramétré)
- description `Cette section n'est pas disponible pour le moment.`
- `Détails` (dev only)
- bouton `Réessayer`

Particularité : **class component** → impossible d'appeler `useI18n` directement.

### 2. `components/common/LoadingStates.tsx` — défaut FR figé
`LoadingState` avait `message = 'Chargement...'` en valeur par défaut → français en
TOUTES langues quand l'appelant ne passe pas de message. Importé par `bubble-stream-page`.

### 3. DOUBLON signalé (non corrigé — arbitrage requis)
**Deux composants `LoadingState` distincts** portant le même nom d'export :
- `components/ui/loading-state.tsx` — DÉJÀ i18n (`useI18n('common')`, `t('loading')`),
  branding Meeshy (gradient terracotta→indigo, logo), `fullScreen`.
- `components/common/LoadingStates.tsx` — exporte `LoadingSpinner/LoadingState/LoadingSkeleton/LoadingCard`,
  spinner Lucide générique, `size`.
Les deux visuels diffèrent → la consolidation n'est PAS triviale. **Déféré** (ne pas
fusionner à l'aveugle ; risque de régression visuelle sur les surfaces consommatrices).

## Corrections appliquées (✅ COMPLÈTE — voir plan 58wd)
- `errorBoundary` (namespace `common`, ×4 locales) **étendu** (pas de nouveau namespace) :
  `featureError` (paramétré `{feature}`), `featureUnavailable`, `retry`. `details` réutilisé.
- `FeatureErrorBoundary` : extraction d'un composant fonction `FeatureErrorFallback`
  consommant `useI18n('common')` ; la classe le rend (pattern propre pour hook-in-class).
- `LoadingStates.LoadingState` : `message ?? t('loading', 'Loading...')` (fallback EN
  anti-flash, leçon 50w) ; `message=""` continue de masquer le libellé.
- Test `__tests__/components/LoadingStates.test.tsx` mis à jour (défaut → `'Loading...'`).

## Vérifications
- `npx jest __tests__/components/LoadingStates.test.tsx` → **29/29 verts**
- `npx tsc --noEmit` → 0 erreur sur les fichiers touchés
- CI complète verte sur PR #794 (Test web, Build, gateway, translator, etc.)
- JSON ×4 locales valides ; diffs strictement additifs (3 clés par locale)
- Grep FR résiduel sur les 2 fichiers touchés → vide

## NE PLUS re-flagger
- `FeatureErrorBoundary.tsx` (i18n complet) ni `errorBoundary.{featureError,featureUnavailable,retry}`
- `components/common/LoadingStates.tsx` `LoadingState` défaut (i18n via `t('loading','Loading...')`)
- Le doublon `LoadingState` reste **documenté/déféré** (consolidation = arbitrage visuel séparé)
