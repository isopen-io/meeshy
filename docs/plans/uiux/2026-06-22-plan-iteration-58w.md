# Plan — Itération 58w (web)

**Base** : `main` HEAD post-merge iter-57wb (#780) + iter-57wc (#790) → `0937d37`
**Branche de travail** : `claude/practical-fermat-06dry3`
**Périmètre** : i18n de l'écran `/feed/posts` (`PostsFeedScreen.tsx` + `FeedTabs`)

> Numérotée **58w** : le 57 est épuisé (57w `ReelPlayer` #774, 57wb `ReelsFeedScreen`
> #780, 57wc a11y `CreateGroupModal` embarqué dans #790). Solde le différé feed 53w.

## Objectif
Solder le dernier (et le plus large) volet du cluster feed : `PostsFeedScreen.tsx`
(727 l.) n'avait **aucun** hook i18n et mélangeait FR figé + EN figé dans le même écran.

## Étapes
1. [x] Resync `claude/practical-fermat-06dry3` sur `main` (`0937d37`).
2. [x] Créer `locales/{en,fr,es,pt}/feed.json` (~40 clés : chrome, tabs, toasts post,
       états, temps relatif).
3. [x] Étendre `locales/{en,fr,es,pt}/story.json` (additif : `published`, `publishedBody`,
       `publishedBodyWithMedia`, `publishError`) — réutilisation domaine story.
4. [x] `PostsFeedScreen.tsx` : `useI18n('feed')` + `useI18n('story')` ;
       `formatRelativeTime(date, t)` ; remplacer ~30 chaînes ; unifier l'indicateur stale
       (`t('updating')` pour sr-only **et** visible) ; `t` aux deps des `useCallback`.
5. [x] `FeedTabs` : `useI18n('feed')` + `t('tabs.*')`.
6. [x] Validation : `tsc` (0 nouvelle erreur ; l'erreur `onPublish` préexiste sur `main`) ;
       JSON valide ×4 ; parité ; pas de test cassé ; revert `package.json` muté par bun.
7. [ ] Commit + push sur `claude/practical-fermat-06dry3`.
8. [ ] PR → `main` ; CI ; merge ; supprimer la branche feature.
9. [ ] Mettre à jour `branch-tracking.md` (Next → 59 ; history 58w ✅).

## Clés ajoutées
- `feed.json` (nouveau, ×4) : `title`, `srHeading`, `tabs.{label,posts,reels}`,
  `sections.{stories,storiesPublic,moods,compose}`, `recordAudio`, `updating`,
  `loadError`, `retry`, `newPost`, `newPosts`, `empty`, `loadingMore`, `unknownAuthor`,
  `toast.{error,published,publishedBody,publishError,linkCopied,linkCopyError,postDeleted,
  postUpdated,reposted,quoted,audioPublished,audioPublishError,uploadError,uploadErrorBody,
  moodPublished,statusSelected}`, `relativeTime.{now,minutes,hours,days}`.
- `story.json` (additif, ×4) : `published`, `publishedBody`, `publishedBodyWithMedia`,
  `publishError`. Réutilisées : `deleted`, `deleteError`, `replySent`.

## Risques / notes
- Sandbox sans `node_modules` complet → install partiel suffisant pour `tsc` ciblé ;
  CI confirme le build complet.
- `package.json` ne doit PAS être commité (bun déplace `overrides` hors du bloc `pnpm` →
  casserait la remédiation Dependabot #778). **Reverté.**
- Flash bref possible sur les clés à paramètre (temps relatif, compteur new-posts) —
  accepté, cohérent avec les itérations précédentes.
