# Background Story Publishing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish stories in background with progress UI in the story tray, instead of blocking the composer.

**Architecture:** `StoryViewModel` gains `activeUpload: StoryUploadState?` for tracking upload state. `StoryComposerView` gets a new synchronous `onPublishAllInBackground` callback. `MyStoryButton` overlays a progress ring on the avatar during upload.

**Tech Stack:** SwiftUI, @MainActor, TusUploadManager, PostService, XCTest

**Spec:** `docs/superpowers/specs/2026-03-23-background-story-publish-design.md`

---

### Task 1: Add StoryUploadState model to StoryViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift`

- [ ] **Step 1: Add StoryUploadState struct and properties**

Add before `// MARK: - Load Stories` in `StoryViewModel.swift`:

```swift
// MARK: - Background Upload State

struct StoryUploadState: Identifiable {
    let id: String
    let thumbnailImage: UIImage
    var progress: Double
    var phase: UploadPhase

    let authorId: String
    let authorName: String
    let authorAvatar: String?

    let slides: [StorySlide]
    let slideImages: [String: UIImage]
    let loadedImages: [String: UIImage]
    let loadedVideoURLs: [String: URL]

    enum UploadPhase: Sendable {
        case uploading
        case publishing
        case failed(String)
    }
}
```

Add to the class properties (after `@Published var showStoryComposer`):

```swift
@Published var activeUpload: StoryUploadState?
private var uploadTask: Task<Void, Never>?
```

- [ ] **Step 2: Build and verify compilation**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```
feat(ios): add StoryUploadState model for background publishing
```

---

### Task 2: Implement publishStoryInBackground, retryUpload, cancelUpload

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift`

- [ ] **Step 1: Write failing tests**

Add to `StoryViewModelTests.swift`:

```swift
// MARK: - Background Publishing

func test_publishStoryInBackground_setsActiveUpload() async {
    mockAPI.authToken = "token"
    mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

    sut.publishStoryInBackground(
        slides: [StorySlide()],
        slideImages: [:],
        loadedImages: [:],
        loadedVideoURLs: [:]
    )

    XCTAssertNotNil(sut.activeUpload)
    XCTAssertEqual(sut.activeUpload?.progress, 0)
}

func test_publishStoryInBackground_closesComposer() async {
    mockAPI.authToken = "token"
    mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
    sut.showStoryComposer = true

    sut.publishStoryInBackground(
        slides: [StorySlide()],
        slideImages: [:],
        loadedImages: [:],
        loadedVideoURLs: [:]
    )

    XCTAssertFalse(sut.showStoryComposer)
}

func test_publishStoryInBackground_blocksSecondPublish() async {
    mockAPI.authToken = "token"
    mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

    sut.publishStoryInBackground(
        slides: [StorySlide()],
        slideImages: [:],
        loadedImages: [:],
        loadedVideoURLs: [:]
    )

    let firstId = sut.activeUpload?.id

    sut.publishStoryInBackground(
        slides: [StorySlide()],
        slideImages: [:],
        loadedImages: [:],
        loadedVideoURLs: [:]
    )

    XCTAssertEqual(sut.activeUpload?.id, firstId)
}

func test_cancelUpload_clearsActiveUpload() async {
    mockAPI.authToken = "token"
    mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

    sut.publishStoryInBackground(
        slides: [StorySlide()],
        slideImages: [:],
        loadedImages: [:],
        loadedVideoURLs: [:]
    )

    XCTAssertNotNil(sut.activeUpload)
    sut.cancelUpload()
    XCTAssertNil(sut.activeUpload)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — methods not defined

- [ ] **Step 3: Implement publishStoryInBackground**

Add to `StoryViewModel.swift` after the `publishStorySingle` method:

```swift
// MARK: - Background Publishing

func publishStoryInBackground(
    slides: [StorySlide],
    slideImages: [String: UIImage],
    loadedImages: [String: UIImage],
    loadedVideoURLs: [String: URL]
) {
    guard activeUpload == nil else { return }

    let user = AuthManager.shared.currentUser
    let thumbnail = slideImages.values.first?.preparingThumbnail(of: CGSize(width: 100, height: 178))
        ?? UIImage()

    let upload = StoryUploadState(
        id: UUID().uuidString,
        thumbnailImage: thumbnail,
        progress: 0,
        phase: .uploading,
        authorId: user?.id ?? "",
        authorName: user?.displayName ?? user?.username ?? "",
        authorAvatar: user?.avatar,
        slides: slides,
        slideImages: slideImages,
        loadedImages: loadedImages,
        loadedVideoURLs: loadedVideoURLs
    )
    activeUpload = upload
    showStoryComposer = false

    launchUploadTask()
}

private func launchUploadTask() {
    guard let upload = activeUpload else { return }

    let serverOrigin = MeeshyConfig.shared.serverOrigin
    guard let baseURL = URL(string: serverOrigin),
          let token = api.authToken else {
        activeUpload?.phase = .failed("Authentication required")
        return
    }

    uploadTask = Task {
        let uploader = TusUploadManager(baseURL: baseURL)
        let slideCount = upload.slides.count
        let slideShare = 1.0 / Double(max(1, slideCount))

        do {
            for (slideIdx, slide) in upload.slides.enumerated() {
                guard !Task.isCancelled else { return }
                let baseProgress = Double(slideIdx) * slideShare

                // 1. Upload background image (0-30% of slide share)
                var uploadResult: TusUploadResult? = nil
                if let bgImage = upload.slideImages[slide.id] {
                    let compressed = await MediaCompressor.shared.compressImage(bgImage)
                    let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                    try compressed.data.write(to: tempURL)
                    defer { try? FileManager.default.removeItem(at: tempURL) }
                    uploadResult = try await uploader.uploadFile(
                        fileURL: tempURL, mimeType: compressed.mimeType,
                        token: token, uploadContext: "story"
                    )
                }
                activeUpload?.progress = baseProgress + 0.30 * slideShare

                // 2. Upload foreground media (30-80% of slide share)
                var updatedEffects = slide.effects
                var foregroundMediaIds: [String] = []
                if var mediaObjects = updatedEffects.mediaObjects {
                    let mediaCount = mediaObjects.filter({ $0.postMediaId.isEmpty }).count
                    var mediaIdx = 0
                    for i in mediaObjects.indices where mediaObjects[i].postMediaId.isEmpty {
                        guard !Task.isCancelled else { return }
                        let obj = mediaObjects[i]
                        if obj.mediaType == "video", let videoURL = upload.loadedVideoURLs[obj.id] {
                            let result = try await uploader.uploadFile(
                                fileURL: videoURL, mimeType: "video/mp4",
                                token: token, uploadContext: "story"
                            )
                            mediaObjects[i].postMediaId = result.id
                            foregroundMediaIds.append(result.id)
                        } else if obj.mediaType == "image", let uiImage = upload.loadedImages[obj.id] {
                            let compressed = await MediaCompressor.shared.compressImage(uiImage)
                            let fileName = "image_\(UUID().uuidString).\(compressed.fileExtension)"
                            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                            try compressed.data.write(to: tempURL)
                            defer { try? FileManager.default.removeItem(at: tempURL) }
                            let result = try await uploader.uploadFile(
                                fileURL: tempURL, mimeType: compressed.mimeType,
                                token: token, uploadContext: "story"
                            )
                            mediaObjects[i].postMediaId = result.id
                            foregroundMediaIds.append(result.id)
                        }
                        mediaIdx += 1
                        let mediaProgress = Double(mediaIdx) / Double(max(1, mediaCount))
                        activeUpload?.progress = baseProgress + (0.30 + mediaProgress * 0.50) * slideShare
                    }
                    updatedEffects.mediaObjects = mediaObjects
                }

                // 3. API call createStory (80-100% of slide share)
                activeUpload?.phase = .publishing
                var allMediaIds: [String] = []
                if let id = uploadResult?.id { allMediaIds.append(id) }
                allMediaIds.append(contentsOf: foregroundMediaIds)

                let post = try await postService.createStory(
                    content: slide.content,
                    storyEffects: updatedEffects,
                    visibility: "PUBLIC",
                    mediaIds: allMediaIds.isEmpty ? nil : allMediaIds
                )

                let media = buildFeedMedia(from: post, fallback: uploadResult)
                let newItem = StoryItem(
                    id: post.id, content: post.content, media: media,
                    storyEffects: updatedEffects, createdAt: post.createdAt, isViewed: true
                )
                insertOrAppendStoryItem(newItem, forAuthor: post.author)
                activeUpload?.progress = Double(slideIdx + 1) * slideShare
                activeUpload?.phase = .uploading
            }

            // All slides published
            activeUpload = nil
            uploadTask = nil
            HapticFeedback.success()
        } catch {
            if !Task.isCancelled {
                activeUpload?.phase = .failed(error.localizedDescription)
            }
        }
    }
}

func retryUpload() {
    guard case .failed = activeUpload?.phase else { return }
    activeUpload?.progress = 0
    activeUpload?.phase = .uploading
    launchUploadTask()
}

func cancelUpload() {
    uploadTask?.cancel()
    uploadTask = nil
    activeUpload = nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: All new tests PASS

- [ ] **Step 5: Commit**

```
feat(ios): implement background story publishing with progress tracking
```

---

### Task 3: Add onPublishAllInBackground callback to StoryComposerView

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

- [ ] **Step 1: Add callback property and update init**

In `StoryComposerView.swift`, add after the existing callback declarations (~line 163):

```swift
public var onPublishAllInBackground: (
    _ slides: [StorySlide],
    _ slideImages: [String: UIImage],
    _ loadedImages: [String: UIImage],
    _ loadedVideoURLs: [String: URL]
) -> Void
```

Update the `init` to accept it:

```swift
public init(
    onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL]) async throws -> Void = { _, _, _, _ in },
    onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL]) -> Void,
    onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void,
    onDismiss: @escaping () -> Void
) {
    self.onPublishSlide = onPublishSlide
    self.onPublishAllInBackground = onPublishAllInBackground
    self.onPreview = onPreview
    self.onDismiss = onDismiss
}
```

- [ ] **Step 2: Modify publishAllSlides() to use background callback**

Replace the entire `publishAllSlides()` method:

```swift
private func publishAllSlides() {
    syncCurrentSlideEffects()
    let snapshot = snapshotAllSlides()
    let allMediaURLs = viewModel.loadedVideoURLs.merging(viewModel.loadedAudioURLs) { v, _ in v }
    clearAllDrafts()
    HapticFeedback.success()
    onPublishAllInBackground(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, allMediaURLs)
}
```

- [ ] **Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build FAILS — call site in StoryTrayView needs updating (Task 4)

- [ ] **Step 4: Commit (WIP — will fix call site in Task 4)**

No commit yet — continue to Task 4.

---

### Task 4: Wire StoryTrayView to use background publishing

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`

- [ ] **Step 1: Update StoryComposerView instantiation in StoryTrayView**

Replace the `StoryComposerView(...)` block inside `.fullScreenCover` (~line 48-70):

```swift
StoryComposerView(
    onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs in
        viewModel.publishStoryInBackground(
            slides: slides,
            slideImages: slideImages,
            loadedImages: loadedImages,
            loadedVideoURLs: loadedVideoURLs
        )
    },
    onPreview: { slides, images, loadedImgs, videoURLs, audioURLs in
        storyPreviewAssets = StoryPreviewAssets(
            slides: slides,
            backgroundImages: images,
            loadedImages: loadedImgs,
            videoURLs: videoURLs,
            audioURLs: audioURLs
        )
    },
    onDismiss: {
        viewModel.showStoryComposer = false
    }
)
```

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```
feat(ios): wire background publishing through StoryComposerView callback
```

---

### Task 5: Add StoryUploadOverlay to MyStoryButton

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`

- [ ] **Step 1: Create StoryUploadOverlay view**

Add at the bottom of `StoryTrayView.swift`, before the closing of the file:

```swift
// MARK: - Story Upload Overlay

private struct StoryUploadOverlay: View {
    let upload: StoryUploadState
    let onRetry: () -> Void
    let onCancel: () -> Void

    private var isFailed: Bool {
        if case .failed = upload.phase { return true }
        return false
    }

    var body: some View {
        ZStack {
            // Thumbnail at 20% opacity
            Image(uiImage: upload.thumbnailImage)
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(Circle())
                .opacity(0.2)

            // Progress ring
            Circle()
                .stroke(Color.white.opacity(0.1), lineWidth: 3)
                .frame(width: 50, height: 50)

            if isFailed {
                Circle()
                    .stroke(MeeshyColors.error, lineWidth: 3)
                    .frame(width: 50, height: 50)

                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            } else {
                Circle()
                    .trim(from: 0, to: upload.progress)
                    .stroke(
                        MeeshyColors.brandGradient,
                        style: StrokeStyle(lineWidth: 3, lineCap: .round)
                    )
                    .frame(width: 50, height: 50)
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.3), value: upload.progress)

                Text("\(Int(upload.progress * 100))%")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .onTapGesture {
            if isFailed { onRetry() }
        }
        .contextMenu {
            if isFailed {
                Button { onRetry() } label: {
                    Label("Reessayer", systemImage: "arrow.clockwise")
                }
                Button(role: .destructive) { onCancel() } label: {
                    Label("Annuler", systemImage: "trash")
                }
            }
        }
    }
}
```

- [ ] **Step 2: Integrate overlay into MyStoryButton**

In `MyStoryButton.body`, add an overlay after the MeeshyAvatar (after the `.overlay(alignment: .bottomTrailing)` block, ~line 298):

```swift
.overlay {
    if let upload = viewModel.activeUpload {
        StoryUploadOverlay(
            upload: upload,
            onRetry: { viewModel.retryUpload() },
            onCancel: { viewModel.cancelUpload() }
        )
    }
}
```

- [ ] **Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 4: Commit**

```
feat(ios): add upload progress overlay on story tray avatar
```

---

### Task 6: Update context menu — always show both options

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`

- [ ] **Step 1: Replace ternary context menu with both options**

In `MyStoryButton.body`, replace the `contextMenuItems` array (~lines 269-283):

```swift
contextMenuItems: {
    var items: [AvatarContextMenuItem] = []
    if hasMyStory {
        items.append(AvatarContextMenuItem(label: "Voir ma story", icon: "play.circle.fill") {
            showOwnStoryViewer = true
            HapticFeedback.medium()
        })
    }
    items.append(AvatarContextMenuItem(
        label: "Ajouter une story",
        icon: "plus.circle.fill",
        disabled: viewModel.activeUpload != nil
    ) {
        viewModel.showStoryComposer = true
        HapticFeedback.medium()
    })
    items.append(AvatarContextMenuItem(label: "Changer mon mood", icon: "face.smiling.inverse") {
        onAddStatus?()
        HapticFeedback.medium()
    })
    return items
}()
```

**Note:** Check if `AvatarContextMenuItem` has a `disabled` property. If not, guard inside the action:

```swift
AvatarContextMenuItem(label: "Ajouter une story", icon: "plus.circle.fill") {
    guard viewModel.activeUpload == nil else { return }
    viewModel.showStoryComposer = true
    HapticFeedback.medium()
}
```

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```
feat(ios): always show "Ajouter une story" in story tray context menu
```

---

### Task 7: Clean up old publish UI state

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

- [ ] **Step 1: Remove old publish state that is no longer needed**

The following `@State` properties in `StoryComposerView` are no longer needed since publish happens in background:
- `isPublishingAll` — the composer dismisses immediately
- `publishProgressText` — progress is shown in the tray, not the composer
- `slidePublishError` / `slidePublishContinuation` / `showPublishError` — errors are shown in the tray

Remove these and clean up any references (the publish error alert, `resumePublish`, `cancelPublishIfNeeded`). Keep `publishTask` for the cancel-on-dismiss path (in case user dismisses while data capture is happening).

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```
refactor(ios): remove old blocking publish UI state from StoryComposerView
```

---

### Task 8: Final integration test

- [ ] **Step 1: Run full test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: All tests pass

- [ ] **Step 2: Manual verification**

Run: `./apps/ios/meeshy.sh run`
Test flow:
1. Open story tray → tap "Moi" avatar → composer opens
2. Add content (text, image) → tap "Publier"
3. Composer closes immediately
4. Story tray shows progress overlay on "Moi" avatar (thumbnail at 20% + ring + percentage)
5. Progress increments as upload proceeds
6. On completion: overlay disappears, story appears in "Moi" group
7. Long-press "Moi" → context menu shows both "Voir ma story" and "Ajouter une story"
8. Error test: disconnect network → publish → progress ring turns red with warning icon → tap → retries

- [ ] **Step 3: Final commit**

```
feat(ios): background story publishing with progress UI — complete
```
