# Background Story Publishing with Progress UI

**Date:** 2026-03-23
**Status:** Approved
**Scope:** iOS app — StoryViewModel, StoryTrayView, StoryComposerView

## Problem

Story publishing currently blocks the composer UI. The user must wait for all uploads + API call to complete before seeing their story in the tray. On slow connections with multiple media, this can take 10-30 seconds of dead screen time.

## Solution

Publish stories in background: close the composer immediately, show a placeholder in the story tray with upload progress, replace with the real story on success.

## Design

### 1. Upload State Model

New struct in `StoryViewModel` (not in SDK — this is app-level UI state):

```swift
struct StoryUploadState: Identifiable {
    let id: String                        // UUID local temporaire
    let thumbnailImage: UIImage           // downsampled to ~100px at capture time
    var progress: Double                  // 0.0 → 1.0
    var phase: UploadPhase

    // Author info captured at publish time (survives logout mid-upload)
    let authorId: String
    let authorName: String
    let authorAvatar: String?

    // Retry data — all slides for the story
    let slides: [StorySlide]
    let slideImages: [String: UIImage]    // background images per slide
    let loadedImages: [String: UIImage]   // foreground images
    let loadedVideoURLs: [String: URL]

    enum UploadPhase: Sendable {
        case uploading
        case publishing
        case failed(String)               // error description (String, not Error — Sendable)
    }
}
```

**Memory note:** `thumbnailImage` is downsampled to ~100px at capture time (avatar is 44pt). `loadedImages` stores full-res for retry — accepted trade-off for v1.

### 2. StoryViewModel Changes

```swift
@Published var activeUpload: StoryUploadState?    // one at a time for v1
private var uploadTask: Task<Void, Never>?        // for cancel support
```

Note: single upload, not array — v1 supports one at a time.

New method `publishStoryInBackground(slides:slideImages:loadedImages:loadedVideoURLs:)`:
1. Guard `activeUpload == nil` (block concurrent uploads)
2. Capture current user info from `AuthManager.shared.currentUser`
3. Generate downsampled thumbnail from first slide's background image
4. Create `StoryUploadState` with progress 0.0
5. Set `activeUpload`
6. Close composer (`showStoryComposer = false`)
7. Launch `uploadTask = Task { }` (inherits @MainActor — progress updates are safe):
   - For each slide:
     - Upload background image → progress updates
     - Upload foreground media → progress updates
     - Call `postService.createStory()` → progress updates
   - On success: set `activeUpload = nil`, call `insertOrAppendStoryItem()` for each slide
   - On failure: set `activeUpload.phase = .failed(error.localizedDescription)`

Progress updates within the Task use direct property assignment (Task inherits @MainActor from the ViewModel class).

Retry method `retryUpload()`:
- Guard `activeUpload?.phase` is `.failed`
- Reset progress to 0, phase to `.uploading`
- Re-launch uploadTask

Cancel method `cancelUpload()`:
- `uploadTask?.cancel()`
- `activeUpload = nil`

### 3. Multi-Slide Handling

Each story can have 1-10 slides. Each slide becomes a separate `APIPost` (existing behavior from `publishAllSlides()`).

The background publish iterates all slides sequentially. Progress spans the entire set:

```
Total steps = slides.count * 3 (bg upload + fg uploads + API call per slide)
Per-step weight:
  - bg image upload:     30% of slide's share
  - fg media uploads:    50% of slide's share
  - API createStory:     20% of slide's share

slide share = 1.0 / slides.count
progress = completedSlides * slideShare + currentSlideProgress * slideShare
```

Example: 3 slides, currently uploading fg media on slide 2 at 60% of that step:
- `progress = 1/3 + (0.30 + 0.60 * 0.50) * 1/3 = 0.333 + 0.200 = 0.533` → "53%"

### 4. SDK Boundary — Callback Architecture

`StoryComposerView` is in the SDK (`MeeshyUI` package) — it cannot import or call `StoryViewModel`. The data handoff uses the existing callback pattern:

**Current:** `onPublishSlide: (StorySlide, UIImage?, [String: UIImage], [String: URL]) async throws -> Void`

**New:** Add a second callback for bulk background publish:
```swift
public var onPublishAllInBackground: (
    _ slides: [StorySlide],
    _ slideImages: [String: UIImage],
    _ loadedImages: [String: UIImage],
    _ loadedVideoURLs: [String: URL]
) -> Void
```

The composer's `publishAllSlides()` calls `onPublishAllInBackground` synchronously (passing all data at once), then dismisses. The app-side closure in `StoryTrayView` calls `viewModel.publishStoryInBackground(...)`.

The existing `onPublishSlide` async callback is kept for backward compatibility but is no longer the primary publish path.

### 5. Story Tray UI — Upload Placeholder

In `MyStoryButton`, when `viewModel.activeUpload` is not nil, overlay the avatar with `StoryUploadOverlay`:

**Normal state (.uploading / .publishing):**
- Thumbnail image fills the avatar circle at **20% opacity**
- `Circle().trim(from: 0, to: progress)` stroke ring with `MeeshyColors.brandGradient`, lineWidth 3
- Percentage text centered: `"\(Int(progress * 100))%"`, `.system(size: 12, weight: .bold)`, white

**Failed state:**
- Ring becomes `MeeshyColors.error`, full circle
- Center shows `exclamationmark.triangle` icon (white, size 14)
- `onTapGesture` calls `viewModel.retryUpload()`
- Long press context menu offers "Reessayer" and "Annuler"

**Animation:** ring progress animated with `.linear` for smooth visual feedback.

### 6. Menu Contextuel "Moi"

The context menu always shows both options regardless of `hasMyStory`:
- "Voir ma story" (`play.circle.fill`) — opens viewer (disabled if no stories)
- "Ajouter une story" (`plus.circle.fill`) — opens composer

When `activeUpload != nil`, "Ajouter une story" is disabled (grayed out) to enforce one-at-a-time.

Tap behavior unchanged: opens viewer if stories exist, opens composer if not.

### 7. Composer Guard

When `activeUpload != nil`, opening the composer is blocked:
- Context menu "Ajouter une story" is disabled
- Direct tap when no stories still opens composer (activeUpload means story in flight, so hasMyStory logic still works correctly — the placeholder is not a real story)

## Files Impacted

| File | Change |
|------|--------|
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` | Add `StoryUploadState`, `activeUpload`, `uploadTask`, `publishStoryInBackground()`, `retryUpload()`, `cancelUpload()` |
| `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift` | Add `StoryUploadOverlay` view, modify `MyStoryButton` to show overlay during upload, always show both context menu items |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Add `onPublishAllInBackground` callback, modify `publishAllSlides()` to use it |

## Error Handling

- Network failure during upload: phase → `.failed(description)`, placeholder shows error UI
- Auth token expired: phase → `.failed("Authentication expired")`
- App backgrounded during upload: Task pauses (standard URLSession, not background session — accepted for v1)
- App killed during upload: upload is lost (no persistence — acceptable for v1)
- User opens composer during upload: blocked via `activeUpload != nil` guard

## Test Cases

| Test | Description |
|------|-------------|
| `test_publishStoryInBackground_setsActiveUpload` | Calling publish creates a non-nil activeUpload with progress 0 |
| `test_publishStoryInBackground_closesComposer` | `showStoryComposer` becomes false immediately |
| `test_publishStoryInBackground_blocksSecondPublish` | Second call while activeUpload is non-nil is no-op |
| `test_publishStoryInBackground_success_clearsActiveUpload` | On success, activeUpload becomes nil and storyGroups updated |
| `test_publishStoryInBackground_failure_setsFailedPhase` | On network error, phase is `.failed` with message |
| `test_retryUpload_resetsProgressAndPhase` | Retry sets progress to 0 and phase to .uploading |
| `test_retryUpload_onlyWorksOnFailedState` | Retry is no-op if phase is not .failed |
| `test_cancelUpload_clearsActiveUpload` | Cancel sets activeUpload to nil |
| `test_cancelUpload_cancelsTask` | The underlying Task is cancelled |

## Out of Scope

- Persisting upload state across app restarts
- Background URLSession for uploads surviving app suspension
- Per-file upload progress (only step-level granularity)
- Audio foreground element uploads (future iteration)
