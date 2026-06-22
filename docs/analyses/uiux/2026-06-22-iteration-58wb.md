# Analyse — Itération 58w (web)

## Revue de cohérence (étapes 1–3 de la routine)
- **Doublons analyses** : un doublon **vécu** cette itération — la 57w (ReelPlayer)
  avait été livrée en parallèle par l'agent `claude/practical-fermat-c6vris` (#774,
  mergée) ; ma PR jumelle #777 (mêmes fichiers, mêmes 12 clés, seuls les noms
  diffèrent `byAuthor`/`{current}` vs `reelBy`/`{index}`) a été **fermée sans
  merge** (zéro valeur incrémentale, conflit attendu). Leçon consignée ci-dessous.
  Aucun doublon résiduel dans `docs/analyses/uiux/`.
- **Complétude plans** : chaque issue 1→57w possède plan + annotation dans
  `branch-tracking.md`. Le différé `PostsFeedScreen` (volet « large » du cluster
  feed 53w, distinct du ReelPlayer soldé en 57w/#774 et de ReelsFeedScreen encore
  ouvert) est traité ici.
- **Annotation** : `branch-tracking.md` mis à jour (état + history + deferred).

## Problème traité — `PostsFeedScreen` mixte FR/EN figé (Prisme + cohérence)
`components/feed/PostsFeedScreen.tsx` est le fil principal « posts » (parité iOS) —
monté sur `/feed/posts` et l'alias `/feeds`. Il **n'avait aucun hook i18n** et
cumulait deux défauts :
1. **Rupture Prisme** : ~30 chaînes **françaises figées** en TOUTES langues —
   toasts (`Story publiée !`, `Lien copié !`, `Post supprimé`, `Erreur`,
   `Impossible de…` ×7, `Reposté !`, `Cité !`, `Mood publié !`…), libellés de
   navigation visibles (`Publications`/`Reels` des `FeedTabs`), aria-labels +
   sr-only (`Type de fil`, `Stories publiques`, `Humeurs`, `Composer une
   publication`, `Enregistrer un post audio`, `Chargement de plus de
   publications`, `Mise à jour du fil…`), et le formateur de temps relatif
   (`À l'instant`/`Il y a {n}min/h/j`).
2. **Incohérence FR/EN** : plusieurs chaînes étaient déjà en **anglais dur**
   (`Updating...`, `Unable to load feed.`, `Retry`, `No posts yet…`,
   `{n} new post(s)`, `Unknown`) — l'écran mélangeait donc deux langues figées
   selon la chaîne. Unifié sous un seul namespace.

### Correctifs (nouveau namespace `feed.json` ×4 locales)
| Groupe | Clés |
|--------|------|
| Chrome | `title`, `srHeading`, `tabs.{label,posts,reels}`, `sections.{stories,storiesShort,moods,compose,posts}`, `audioPostLabel` |
| États | `updating`, `updatingShort`, `loadError`, `retry`, `loadingMore`, `empty`, `unknownAuthor`, `newPostsOne/Other {count}` |
| Temps relatif | `time.{now,minutes {count},hours {count},days {count}}` |
| Toasts | `toast.*` (24 clés : succès/erreurs story/post/repost/quote/audio/mood/status) |

`useI18n('feed')` ajouté à `PostsFeedScreen` ET au sous-composant exporté
`FeedTabs` (hook propre). `formatRelativeTime` reçoit désormais `t` en 2e arg
(helper module-level → signature typée `TFunc`). `t` ajouté aux deps de tous les
`useCallback` touchés (lint react-hooks).

## Décisions
- **Nouveau namespace `feed`** (pas de réutilisation de `reel`/`conversations`) :
  le fil posts est un domaine produit distinct ; namespace dédié self-documenting.
  Barrel `index.ts` NON touché (runtime = fetch dynamique `/locales/{lang}/{ns}.json`,
  leçon 53wb).
- Fallbacks EN en 2e arg de `t()` pour les chaînes simples (anti-flash, leçon
  50w). Clés à paramètre (`time.*`, `newPosts*`, `storyVisibleFriendsMedia`,
  `statusSelected`) en params seuls (signature t() exclusive) — toutes à parité ×4.
- Pluriel géré côté code (`count === 1 ? one : other`) — le moteur `t()` ne fait
  que l'interpolation `{param}`, pas la sélection plurielle.
- **`mockStatuses`** (l.63-76 : `Marie D.`/`Trop contente !`/`コーヒータイム`…) =
  données mock de démo **avec leurs propres tableaux de traduction** (structure
  Prisme originalLanguage+translations), pas du chrome UI. Laissées intactes (la
  surface status mock est documentée « to be replaced » dans le fichier). NE PAS
  les flagger comme chaînes i18n.

## Vérifié — NE PLUS re-flagger
- `components/feed/PostsFeedScreen.tsx` (+ `FeedTabs`) entièrement internationalisé.
  Aucune chaîne de chrome FR/EN figée résiduelle (grep vide hors fallbacks `t()`
  et mock data). Aucun test n'importe l'écran → zéro risque de casse de mock i18n.
- Parité : namespace `feed` à 24 toast / 5 sections / 4 time / 3 tabs ×4 locales ;
  JSON valide ×4.

## Leçon (étape self-improvement) — collision d'agents parallèles
Avant de démarrer une itération web, **vérifier `git fetch origin main` ET les PR
ouvertes/récemment mergées** : plusieurs agents (`practical-fermat-*`) travaillent
le même backlog web en parallèle. La 57w ReelPlayer était déjà prise (#774). Ne
pas forcer un doublon : fermer la PR jumelle, repartir de `main`, choisir une
surface **orthogonale** (ici `PostsFeedScreen`, distinct de ReelPlayer/#774 et de
ReelsFeedScreen encore libre).

## Revue optimisation (étape 4) — opportunités repérées (différées, bornées)
Pour 59w+ :
- `components/feed/ReelsFeedScreen.tsx` (toujours 0 `useI18n` sur `main` — borné,
  bon candidat, **vérifier qu'aucun agent parallèle ne l'a pris** avant de démarrer).
- `app/settings/loading.tsx` = server component → i18n server-side (exclusion 54w).
- console.error FR (participants-drawer ×5, links-section ×3) — logs dev.
- retrait `next-themes` orphelin (touche `pnpm-lock.yaml`, isolé).
- `mockStatuses` → câblage gateway statuts éphémères (feature, hors UI/UX pur).

## Statut
✅ Implémenté — itération 58w. Délégué au CI pour build/typecheck (node_modules
absent dans le container routine ; changements = nouveau hook `useI18n('feed')`
conventionnel + swaps `t()` + namespace JSON additif validé à la parité ×4).
