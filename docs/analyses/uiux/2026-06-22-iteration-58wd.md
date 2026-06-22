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

---

# Analyse — Itération 58wd (web)

## Revue de cohérence (étapes 1–3 de la routine)
- **Doublons** : **trois collisions** absorbées durant ce run (l'agent web
  parallèle a mergé en parallèle exactement les périmètres préparés ici —
  `ReelPlayer` #774, `ReelsFeedScreen` #780, puis l'a11y des modales
  `AgentTopicEditModal`+`ConversationDrawer` #792 iter-58w). Les ébauches
  redondantes ont été abandonnées (reset `main`). Cette itération ne conserve
  que le **delta non couvert par #792** (voir ci-dessous) — aucun doublon.
- **Complétude plans** : tout est annoté dans `branch-tracking.md`.
- **Annotation** : `branch-tracking.md` mis à jour.

## Problème traité — fuite de focus / a11y du tiroir monté-mais-fermé
`#792` (iter-58w) a ajouté `role="dialog"` + `aria-modal="true"` à
`components/v2/ConversationDrawer.tsx`. Mais ce tiroir **reste monté** quand il
est fermé (translaté hors-écran via `-translate-x-full pointer-events-none`,
pour l'animation de 300 ms — il n'est pas `display:none`). Conséquences,
**non corrigées par #792** :
1. Les boutons internes du tiroir fermé restent **dans l'ordre de tabulation**
   (focusables au clavier alors qu'invisibles).
2. Le `aria-modal="true"` persiste sur un dialogue fermé → les lecteurs d'écran
   peuvent considérer le reste de la page comme inerte alors qu'aucune modale
   n'est active.

### `components/v2/ConversationDrawer.tsx`
| Correctif | Détail |
|-----------|--------|
| `inert={!isOpen}` sur le conteneur du tiroir | Quand fermé : retire le sous-arbre de l'ordre de tabulation **et** de l'arbre d'accessibilité (neutralise `aria-modal` résiduel). Quand ouvert : interactif normalement. |

`inert` est un attribut HTML standard, supporté nativement par React 19.2.5
(le repo l'utilise nulle part ailleurs jusqu'ici).

## Décisions
- **Périmètre réduit au strict delta** de #792 : un seul attribut, un seul
  fichier, **aucun fichier locale**. Tout le reste (Escape, role/aria-modal/
  labelledby, aria-label close) est déjà sur `main` via #792 — non re-touché.
- **Backdrop-dismiss sur `AgentTopicEditModal` volontairement NON ajouté** :
  #792 a documenté ce choix (modal de formulaire → éviter la perte de saisie
  non sauvegardée ; Escape suffit). Décision respectée — on ne la contredit pas.
- `inert` plutôt que `aria-hidden` : `aria-hidden` seul sur un conteneur à
  enfants focusables est un anti-pattern (focus sur contenu masqué) ; `inert`
  couvre focus **et** AT en une seule primitive.

## Vérifié — NE PLUS re-flagger
- `ConversationDrawer.tsx` : tiroir fermé désormais `inert` (pas de fuite de
  focus ni d'`aria-modal` résiduel). NE PLUS re-flagger.

## Revue optimisation (étape 4) — opportunités (différées)
Pour 59w+ :
- focus-trap actif des dialogues `AgentTopicEditModal`/`ConversationDrawer`
  (séparable ; le `v2/Dialog` natif l'a déjà).
- `PostsFeedScreen.tsx` (~30 chaînes, large) — **vérifier l'agent parallèle**
  avant de l'attaquer (3 collisions ce run).
- `Badge` success/warning/gold hexes off-palette (différé 56wb).
- `app/settings/loading.tsx` (server component → i18n server-side, exclusion 54w).
- retrait `next-themes` orphelin (touche `pnpm-lock.yaml`).

## Statut
✅ Implémenté — itération 58wd. Delta a11y pur (1 attribut `inert`), aucun
fichier locale. Délégué au CI pour build/typecheck.
