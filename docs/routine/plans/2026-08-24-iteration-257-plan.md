# Plan — Itération 257 : descendre le Prisme ordonné dans COMMENTAIRES + STATUS (web)

## Objectifs

Rendre les surfaces web COMMENTAIRES et STATUS conscientes du RANG du Prisme
(rangs 1→4 + fallback), comme l'est déjà la surface POSTS depuis le cycle 120, en
threadant la prop `preferredLanguages` déjà supportée par `TranslationToggle`.

## Modules affectés

**Composants (ajout + thread de la prop) :**
- `apps/web/components/v2/CommentItem.tsx`
- `apps/web/components/v2/CommentThread.tsx`
- `apps/web/components/v2/CommentList.tsx` (+ `CommentReplies` interne)
- `apps/web/components/v2/StatusBar.tsx` (+ `StatusPopover` interne)

**Hôtes (fourniture de `preferredLanguages`) :**
- `apps/web/components/v2/PostDetail.tsx` → `CommentList` (prop déjà en portée)
- `apps/web/components/feed/PostsFeedScreen.tsx` → `StatusBar` (prop déjà en portée)
- `apps/web/components/v2/StoryViewer.tsx` → `CommentList` (prop déjà en portée)
- `apps/web/components/feed/ReelsFeedScreen.tsx` → `CommentList`
  (+ `usePreferredLanguages()`)

**Tests :**
- `apps/web/__tests__/components/v2/prisme-rank-comment-status.test.tsx` (neuf)

## Phases

1. **RED** — écrire 3 tests avec le VRAI `TranslationToggle` (commentaire, liste,
   statut), prouver qu'ils servent l'original faute de descente. ✅
2. **GREEN** — threader `preferredLanguages` dans les 4 composants. ✅
3. **Câblage hôtes** — forward depuis les 4 hôtes. ✅
4. **Validation** — jest v2/story/feed + tsc production. ✅

## Dépendances

Aucune nouvelle. `usePreferredLanguages()` existe déjà
(`apps/web/hooks/use-post-translation.ts`). `TranslationToggle.preferredLanguages`
existe déjà (cycle 120).

## Risques estimés

- Faible. Ajout additif, repli `userLanguage` préservé. Cf. § Risk assessment de
  l'analyse pour le cas du texte legacy de story écarté sciemment.

## Stratégie de rollback

Retirer la prop des 6 types + les 4 forwards + le hook ajouté dans
`ReelsFeedScreen` + le fichier de test. Le repli `userLanguage` reprend seul.

## Critères de validation

- 3 tests neufs RED puis GREEN.
- Régression v2/story (49/402) + feed (22/76) verte.
- `tsc --noEmit` zéro erreur sur les fichiers de production touchés.

## Statut de complétion

**COMPLET** — code + tests + docs. Reste : CI verte sur la PR.

## Suivi / améliorations futures

- Câbler `StoryViewer` texte legacy (non-canvasV3) via `onDisplayedChange` (seule
  surface du suivi cycle 120 restante, écartée pour cause de découplage
  pastille/texte).
- Rafraîchir le tableau `CLAUDE.md` § Prisme pour acter la fermeture de
  COMMENTAIRES/STATUS.
