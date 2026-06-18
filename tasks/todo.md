# Republications — implémentation complète (story + status)

## Cause racine confirmée
- **Story republiée = vide** : `StoryViewModel.swift` passe `repostOfId: nil` EN DUR à tous les `createStory()` (491/585/740/959) → le `vm.repostOfId` du composer reposting n'est jamais transmis ; et les médias source ne sont pas dupliqués → canvas vide.
- **Status republié** : `viaUsername` strippé par Zod (absent de `CreatePostSchema`) → attribution perdue ; `audioUrl` non transmis → voix perdue.
- **Chemin générique `repostPost` (PostService.ts:1369)** ne copie QUE `content`+`repostOfId` ; seul story→POST fait un snapshot. → tout repost de source éphémère (STORY/STATUS) hors story→POST = vide.
- `repostOfInclude` (gateway), `APIRepostOf` + `RepostContent` (SDK) n'ont pas `moodEmoji`.

## Plan (TDD, compact entre phases)

### Phase 1 — Gateway (foundation)
- [ ] RED : tests `repostPost` STATUS→STATUS (snapshot moodEmoji+content+audio) et STORY→STORY (dup média+storyEffects)
- [ ] GREEN : généraliser le snapshot `repostPost` aux sources ÉPHÉMÈRES (STORY||STATUS), tout targetType — copier média+audio+storyEffects+moodEmoji+content faithfully
- [ ] Ajouter `moodEmoji` à `repostOfInclude`
- [ ] Vérifier suite `PostService.test.ts` verte (aucune régression)

### Phase 2 — SDK
- [ ] `APIRepostOf` + `RepostContent` + mapping `toFeedPost` : ajouter `moodEmoji`
- [ ] `StatusService.create` + `StatusViewModel.setStatus` : transmettre `audioUrl` + `repostOfId`

### Phase 3 — iOS
- [ ] Status republish (StatusBubbleOverlay → composer → setStatus) : forwarder audioUrl + repostOfId (attribution via repostOf.author)
- [ ] Réexposer le FAB reshare story → `PostService.repost(targetType: .story)` (snapshot serveur, pas de composer)
- [ ] Build iOS vert

### Phase 4 — Vérification
- [ ] Tests gateway verts + build iOS vert
- [ ] Commits isolés par phase, push

## Review — TERMINÉ 2026-06-18

3 commits poussés sur `main` (`0cf03b8ec..1aefa0326`) :
- `c6209dfcc` gateway — snapshot généralisé aux sources éphémères + moodEmoji dans repostOfInclude (86/86 tests, tsc 0)
- `01a1d8482` SDK — moodEmoji repostOf + forward audioUrl/repostOfId + via dérivé de repostOf.author (63 tests verts)
- `1aefa0326` iOS — FAB reshare story réexposé (chemin serveur) + status audio/attribution + moodEmoji repostView (build app 79s, TEST BUILD SUCCEEDED)

**Résultat clé** : l'attribution « via @X » du viewer story (StoryViewerView+Sidebar:557-566) était DORMANTE car l'ancien composer forçait `repostOfId: nil`. Le snapshot serveur pose désormais `repostOfId` → canvas source dupliqué + rendu + mention « via @Windie ». Bug « story vide » résolu à la racine.

**Vérifié** : gateway (jest+tsc), SDK (xcodebuild test), app+tests (build-for-testing). NON vérifié : runtime device (impossible ici).

**Restes mineurs (follow-up, non bloquants)** :
- createPost (status republish) n'incrémente pas `repostCount` de la source (seul repostPost le fait) — métrique, non user-visible.
- Pas d'insert optimiste de la story reshared dans la tray (apparaît au prochain reload) — aligné sur repostAsPostDirect.

**NON committé** (agent Codex parallèle, laissé tel quel) : PostService.ts (bookmarkCount), interactions.ts, post.ts, SocialSocketManager.swift, Fastfile.
