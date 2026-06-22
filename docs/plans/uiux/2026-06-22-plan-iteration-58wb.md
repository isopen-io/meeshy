# Plan — Itération 58w (web)

## Base
- Repartir de `main` HEAD `51021e0` (post-merge #774 iter-57w + #776 iter-56wb + dependabot).
- Branche de travail : `claude/practical-fermat-1bs0bb` (assignée, réinitialisée sur `main`).

## Contexte
- La PR #777 (ma 57w ReelPlayer) était un **doublon** de #774 (agent parallèle,
  déjà mergée) → fermée sans merge, branche repartie de `main`.
- Cible 58w choisie pour être **orthogonale** au backlog des agents parallèles :
  `PostsFeedScreen.tsx` (volet « large » du cluster feed 53w, distinct de
  ReelPlayer/#774 et de ReelsFeedScreen).

## Objectif
i18n complète du fil principal `components/feed/PostsFeedScreen.tsx` (+ sous-
composant `FeedTabs`) : ~30 chaînes FR figées + ~6 chaînes EN dures (incohérence
FR/EN) → namespace unique `feed`. Rupture Prisme + cohérence linguistique sur une
surface de contenu majeure (parité iOS feed).

## Étapes
1. [x] `locales/{en,fr,es,pt}/feed.json` (nouveau namespace) — chrome, états,
   temps relatif, 24 toasts.
2. [x] `FeedTabs` → `useI18n('feed')` (hook propre) + 3 `t()`.
3. [x] `PostsFeedScreen` → `useI18n('feed')` ; `formatRelativeTime(date, t)` ;
   ~36 swaps `t()` (toasts + chrome + états + temps) ; `t` ajouté aux deps
   `useCallback`.
4. [x] Vérif : grep FR chrome vide ; parité 4 locales ; JSON valide ×4 ; aucun
   test n'importe l'écran.
5. [x] Annoter analyse + `branch-tracking.md` (corrige #777 fermée, 57w=#774).
6. [ ] Commit + push ; PR ; merge `main` après CI vert ; supprimer la branche.

## Contraintes
- Fallbacks EN en 2e arg pour chaînes simples (anti-flash, leçon 50w).
- Clés à paramètre (`time.*`, `newPosts*`, `storyVisibleFriendsMedia`,
  `statusSelected`) : params seuls (signature t() exclusive), parité ×4.
- Pluriel géré côté code (`count===1 ? one : other`).
- `mockStatuses` (données mock + translations) NON touché — pas du chrome.
- Barrel `index.ts` NON touché (fetch dynamique).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (59w+)
`ReelsFeedScreen.tsx` (borné — vérifier non pris par agent parallèle d'abord),
`app/settings/loading.tsx` (server component), console.error FR, `next-themes`
orphelin.
