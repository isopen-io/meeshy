# Plan — Itération 59w (web)

## Cible
`components/feed/PostsFeedScreen.tsx` — i18n complet de l'écran feed posts
(`/feed/posts` + alias `/feeds`). Dernier gros reliquat du cluster feed (53w),
re-listé en tête des opportunités par l'analyse 58w.

## Constat
Aucun hook i18n. ~30 chaînes : FR figées (titre, sr-only, aria, **tous les
toasts**, `formatRelativeTime`) + **incohérence FR/EN** (`Updating...`,
`Unable to load feed.`, `Retry`, `N new post(s)`, `No posts yet…`, `Unknown` en
anglais dur dans une UI FR).

## Étapes
1. [x] Créer le namespace `feed.json` ×4 locales (en/fr/es/pt), 48 clés à parité.
2. [x] Câbler `useI18n('feed')` dans `FeedTabs` + `PostsFeedScreen`.
3. [x] Rendre `formatRelativeTime(date, t)` pur (translateur en param).
4. [x] Remplacer toutes les chaînes chrome par `t(key, 'EN fallback')` ;
       params pour `time.*`, `newPost(s)`, `storyVisibleMedia`, `statusSelected`.
5. [x] Ajouter `t` aux deps des `useCallback` touchés.
6. [x] Vérifier parité JSON (48/48 ×4) + `grep` FR/EN chrome = 0.
7. [ ] Typecheck/build (CI — install bun en cours).
8. [ ] Commit, push, PR, merge dans main, MAJ branch-tracking, delete branche.

## Exclusions documentées
- `mockStatuses` (l.65–76) = données mockées « to be replaced » → NON i18n.

## Décision branche
Base : `main` HEAD `1d1b3b6` (post-#792 iter-58w). Branche de travail :
`claude/practical-fermat-7gckpa`. Merge → main, puis suppression.
