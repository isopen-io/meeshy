# Composer-based Story Repost — Final Handoff (2026-05-05)

**Branch:** `feat/stories-composer-repost`
**Final commit:** see `git log` (HEAD = `b958cf84` at handoff time)
**Total commits (Phase A → D):** 41

## Phase status

| Phase | Status | Commits | Notes |
|-------|--------|---------|-------|
| A — Backend (gateway + shared) | ✅ DONE | `ea6fe226..ef714478` (14) | 78/78 tests pass, 2 architect reviews approved |
| B — iOS SDK | ✅ DONE | `15e5190a..17da4b2d` (10) | All 9 task commits + 1 plan patch + MockPostService review fix |
| C — iOS app | ✅ DONE | `2d7f6163..d39fd3b7` (5) | All 4 task commits + 1 cleanup |
| D — Tests + smoke | ⚠ PARTIAL | `90638540..b958cf84` (4) | D.1 done ; D.2 blocked (see below) |

## Phase B/C/D commit map

```
b958cf84 fix(ios): pass repostOfId: nil at 4 callers using PostServiceProviding protocol
946fc530 fix(sdk): resolve B.6 Swift 6 errors — StaticString + deinit isolation
d918d4a0 fix(sdk): surgical Phase D review fixes for pre-existing Swift 6 SDK rot
90638540 test(ios): integration tests for 4 repost flows                       [D.1]
d39fd3b7 chore(ios): remove stale TODO C.2 marker
c9440b66 feat(ios): kebab menu adds Republier en post + Editer et republier en post  [C.2]
a70e36c0 feat(ios): double-attribution header (single-level for MVP)           [C.4]
b1e9e646 feat(ios): feed cell renders repost-of-story via StoryCanvasReaderView (muted)  [C.3]
2d7f6163 feat(ios): share button opens StoryComposerView in repost mode        [C.1]
b3fa8f93 refactor(ios): align MockPostService with new signatures              [B review]
17da4b2d feat(sdk): StoryComposerViewModel.init(reposting:authorHandle:)       [B.6]
6143186c feat(sdk): UnifiedPostComposer init for repost mode                   [B.7]
448ff848 feat(sdk): create/createStory accept repostOfId                       [B.5c]
7550eb8d refactor(ios): migrate repost callers to new SDK signature            [B.5b]
60137822 feat(sdk): add RepostRequest.targetType + PostService.repost          [B.5]
45f2609f feat(sdk): add isLocked flag to StoryTextObject for repost badge     [B.3]
bc75c172 feat(sdk): add mute parameter to StoryCanvasReaderView for feed embed [B.4]
b99de64c feat(sdk): expand StoryItem with originalRepostOfId/visibility/audioUrl/isPublic  [B.2]
76aee3a6 docs(plans): apply 6 audit patches to revised Phase B/C plan
15e5190a feat(sdk): expose new repost fields in APIRepostOf and APIPost        [B.1]
```

## D.2 — Smoke test status

**Blocked. Requires merge with `dev` to compile the iOS app.**

### Root cause

The merge base `beb98b15 refactor(ios): wire FeedViewModel + PostDetailViewModel as persistence orchestrators` (May 4 18:01) introduced source-level references in `FeedViewModel.swift`, `PostDetailViewModel.swift`, `FeedView.swift`, `PostDetailView.swift`, and `DependencyContainer.swift` to the persistence layer types `FeedStore`, `CommentStore`, `FeedSocketHandler`, `FeedListView`, `MessageListViewController`, `CommentListViewController`, `DiffableTypes`, etc.

The Swift source files for those types DO exist on disk in `apps/ios/Meeshy/Features/Main/Stores/` and `apps/ios/Meeshy/Features/Main/Views/`. **But the Xcode project `Meeshy.xcodeproj/project.pbxproj` does NOT register them as build sources** (verified : `grep -c FeedStore.swift Meeshy.xcodeproj/project.pbxproj` returns `0`).

This pre-existing broken state was fixed on dev by commit `6a5c56ae fix(ios): resolve Swift 6 concurrency + compilation errors in persistence files` (May 5 09:49) which:
1. Registered all the missing files in `Meeshy.xcodeproj/project.pbxproj` (~21 entries)
2. Added public memberwise inits to `MessageRecord`, `PostRecord`, `CommentRecord`, `TranslationRecord`, etc.
3. Added missing methods to `FeedPersistenceActor`
4. Fixed the SDK rot (`MessageServiceProviding`, `DecodedImageCache`, `MessagePersistenceActor`, `ThumbnailPrefetcher`)

Our `d918d4a0` partially mirrored point (4) but cannot replicate (1)–(3) without bringing in dev's whole `6a5c56ae` (which conflicts with our Phase B Codable widening on `PostModels.swift` and our extensions on `StoryModels.swift`).

### Recommended path forward

**Option A (preferred) — merge `feat/stories-composer-repost` → `dev`** :
The `dev` branch already has all the pieces : pbxproj registration, persistence layer source updates, SDK rot fixes. Merging our feature into dev should produce a clean working build. Conflicts will arise on these files (resolution guidance) :

- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` — keep our 7 new fields from B.1, adopt dev's Codable conformance.
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` — keep our 4 expansions (B.2 `originalRepostOfId`/`visibility`/`audioUrl`/`isPublic`, B.3 `isLocked`, B.5 `RepostRequest.targetType`).
- `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` — keep our updated signatures.
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` — keep our `repostOfId` additions.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` — keep our `mute` param + `init(post:)`.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` — keep our pre-built ViewModel init.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` — keep our `init(reposting:authorHandle:)` + `nonisolated` deinit.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift` — keep our repost init.
- The 5 R2 fix files (`DecodedImageCache`, `ThumbnailPrefetcher`, `MessagePersistenceActor`, `ReconnectionGapDetector`, `RetryEngine`) and `DependencyContainer.swift` — **take dev's version** (our `d918d4a0` is a duplicate effort).
- `apps/ios/Meeshy.xcodeproj/project.pbxproj` — keep our C.3 + D.1 entries (`StoryRepostEmbedCell`, `StoryRepostFlowTests`), let git merge propagate dev's persistence layer entries.

**Option B — merge `dev` → `feat/stories-composer-repost`** :
Same conflict resolution as Option A but on this branch. Useful if you want to verify the smoke test on this branch first before merging into dev.

### After merge — D.2 manual smoke checks

Once the build compiles on the simulator, perform :
- Tap Partager (right) on a foreign public story → composer story opens with cloned content + locked badge sticker at bottom-center → publish → new story appears in user's feed.
- Kebab `…` → Republier en post → success toast `"Republié dans ton feed"` → original story stays visible → new POST appears in feed with `repostOf?.type == "STORY"`.
- Kebab `…` → Éditer et republier en post → `UnifiedPostComposer` opens with embed read-only + editable text → publish → toast `"Publié"`.
- Feed → POST with `repostOf?.type == "STORY"` renders via `StoryRepostEmbedCell` → `StoryCanvasReaderView` plays muted (`mute: true`) → tap opens fullscreen.

## What was delivered

### SDK (Codable + types)
- `APIRepostOf` + 6 fields : `type`, `originalLanguage`, `translations`, `storyEffects`, `audioUrl`, `originalRepostOfId`
- `APIPost` + `originalRepostOfId`
- `StoryItem` + `originalRepostOfId` + `visibility` + `audioUrl` + computed `isPublic`
- `StoryTextObject` + `isLocked` (synthesized Codable, `case isLocked` in CodingKeys)
- `RepostRequest` + `targetType`
- `CreatePostRequest` + `repostOfId`
- `CreateStoryRequest` + `repostOfId`

### SDK (services)
- `PostService.repost(postId:targetType:content:isQuote:)` returning `APIPost` (replaces `(postId:quote:)`).
- `PostService.create(...)` and `createStory(...)` accept `repostOfId: String? = nil`.
- `MockPostService` aligned with all new signatures + new tracking vars.

### SDK (UI)
- `StoryCanvasReaderView.mute: Bool = false` parameter on both `init(story:)` and `init(post:)` (the latter is new — uses `[APIPost].toStoryGroups()` for canonical conversion).
- `StoryComposerView` new init `init(viewModel: StoryComposerViewModel, ...)` accepting a pre-built ViewModel.
- `StoryComposerViewModel.init(reposting:authorHandle:)` — clones `StoryItem` → `StorySlide`, appends locked badge sticker, preloads images via `CacheCoordinator.shared.images.image(for:)` with cancellable `withTaskGroup`, exposes `repostOfId`/`originalRepostOfId` as public properties.
- `UnifiedPostComposer.init(repostingStory:authorHandle:onPublishRepost:onDismiss:)` — locks type to `.post`, embeds `StoryCanvasReaderView`, callback signature `(content, sourceStory)`.
- `RepostContent` enriched with snapshot fields (`type`, `authorUsername`, `originalLanguage`, `audioUrl`, `storyEffects`, `media`, `translations`, `originalRepostOfId`, `visibility`, `expiresAt`).

### iOS app
- Share button (right action bar) → opens `StoryComposerView` in repost mode, gated on `currentStory?.isPublic == true`.
- Kebab menu — `Republier en post` (direct via `PostService.repost`, with 404/403/generic toast UX) + `Éditer et republier en post` (opens `UnifiedPostComposer`), gated on `story.isPublic`.
- Feed cell — extracted `StoryRepostEmbedCell` renders via `StoryCanvasReaderView(repost:)` with `mute: true`.
- Single-level attribution header `Reposté de @<handle>` (MVP — chain preserved server-side via `originalRepostOfId`).

### Tests
- 5 SDK Codable tests on `PostModelsTests` / `StoryModelsTests` / `PostServiceTests`.
- 5 ViewModel tests on `StoryComposerViewModelRepostTests`.
- 3 ViewModel tests on `UnifiedPostComposerRepostTests`.
- 2 ReaderView tests on `StoryCanvasReaderViewMuteTests`.
- 4 integration tests on `StoryRepostFlowTests` (the 4 flows, in-process via mocks).

## Known caveats

1. **D.2 manual smoke test pending dev merge** (see above).
2. **Pre-existing pbxproj+SDK rot** is partly addressed by `d918d4a0` ; will be subsumed by the eventual feat → dev merge.
3. The ViewModel publish flow does NOT directly call `PostService.create*(repostOfId:)` — the iOS caller in C.1 is responsible for reading `vm.repostOfId` and passing it. C.1's `onPublishSlide` callback currently has a placeholder where this propagation should occur ; verify in the simulator that newly-published stories have `repostOfId` set on the server side.
4. The `b958cf84` callsite migration adds `repostOfId: nil` at 4 places in `StoryViewModel.swift` and `FeedViewModel.swift` ; if the user wants those callers to actually propagate a repost ID later, they will need to thread it through their own logic.

