# Plan — Itération 58w (web)

**Base** : `main` HEAD post-merge iter-57wb (#780, commit `657e588`)
**Branche de travail** : `claude/practical-fermat-enbncw`
**Périmètre** : i18n complète de `components/feed/PostsFeedScreen.tsx` — solde le dernier
gros volet du cluster feed (53w) : l'écran posts plein, avec son incohérence FR/EN.

## Objectif
`PostsFeedScreen.tsx` (monté sur `/feed/posts` + alias `/feeds`) **n'avait aucun hook
i18n** : ~30 chaînes figées en TOUTES langues, **moitié FR moitié EN** (rupture Prisme +
incohérence visible). Toasts FR (`Story publiée !`, `Lien copié !`, `Reposté !`…),
chrome FR (sr-headings, aria-labels sections, `Mise à jour du fil…`,
`Enregistrer un post audio`), temps relatif FR (`Il y a {n}min`), MAIS états EN durs
(`Updating...`, `Unable to load feed.`, `Retry`, `{n} new posts`,
`No posts yet…`). `FeedTabs` (sous-composant exporté) : `Publications`/`Reels`/aria FR.

## Étapes
1. [x] Resync `claude/practical-fermat-enbncw` sur `main` post-#780.
2. [x] Nouveau namespace dédié `feed.json` ×4 locales (en/fr/es/pt) — ~45 clés à parité.
3. [x] `PostsFeedScreen.tsx` : `useI18n('feed')` (composant + sous-composant `FeedTabs`) ;
   `formatRelativeTime(date, t)` (helper module-level reçoit `t`, type `ReturnType<typeof useI18n>['t']`) ;
   tous toasts/chrome/états → `t()` ; `t` ajouté aux deps des `useCallback`.
4. [x] Fallbacks EN en 2e arg pour les chaînes simples (anti-flash, leçon 50w) ;
   clés à paramètre (`time.*` {minutes/hours/days}, `newPost(s)` {count},
   `toast.statusSelected` {id}, `toast.storyPublishedDescMedia` {count}) sans fallback
   mais surfaces post-chargement → zéro flash visible.
5. [x] Cross-check : 0 résiduel FR/EN visible hors `mockStatuses` (mock documenté) ;
   parité 4×45 ; JSON valide ×4.
6. [ ] Commit + push sur `claude/practical-fermat-enbncw`.
7. [ ] PR → `main` ; CI ; merge ; supprimer la branche feature.
8. [ ] Mettre à jour `branch-tracking.md` (Next → 59 ; history 58w ✅).

## Clés ajoutées (`feed.json`, nouveau namespace, ×4 locales)
- top-level : `title`, `srHeading`, `recordAudioPost`, `loadingMore`, `updating`,
  `errorTitle`, `retry`, `empty`, `newPost`, `newPosts`
- `tabs.{ariaLabel,posts,reels}`
- `sections.{stories,storiesHeading,moods,moodsHeading,compose,composeHeading,posts,postsHeading}`
- `time.{now,minutesAgo,hoursAgo,daysAgo}`
- `toast.*` (25 : error, storyPublished/+Desc/+DescMedia, storyPublishError,
  storyDeleted/+Error, replySent, published/+Desc/+Error, linkCopied/+Error,
  postDeleted, postEdited, reposted, quoted, audioPublished, publishErrorShort,
  uploadError, audioUploadError, statusTitle, statusSelected, moodPublished)

## Hors périmètre (documenté — NE PAS re-flagger)
- `mockStatuses` (Marie D./Yuki T. + contenus FR/JA) = **mock data** client-side
  (statuses pas encore câblés gateway, commentaire en place) → sera remplacé en phase
  ultérieure, pas une rupture i18n.
- Author fallback `'Unknown'`, `lang ?? 'unknown'` = data, pas chrome.

## Risques / notes
- Sandbox sans `node_modules` → validation = cross-check clés + parité + JSON valide ;
  CI confirme le build (`tsc` local n'a remonté aucune erreur propre à `PostsFeedScreen`/`feed.json`,
  uniquement les erreurs préexistantes « Cannot find module 'react' » dues à l'absence de deps).
- Surface feed désormais **entièrement** internationalisée (ReelPlayer 57w + ReelsFeedScreen 57wb
  + PostsFeedScreen 58w). Cluster 53w **soldé**.
