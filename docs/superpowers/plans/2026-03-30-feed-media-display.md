# Feed Media Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display real images, videos, and audio players in the feed (FeedPostCard) and post detail view (PostDetailView), using the existing media components (CachedAsyncImage, InlineVideoPlayerView, AudioPlayerView).

**Architecture:** FeedMedia model gains a `thumbnailUrl` field from the API. FeedPostCard+Media.swift replaces placeholder gradient views with real CachedAsyncImage/InlineVideoPlayerView/AudioPlayerView. A lightweight FeedMedia-to-MessageAttachment bridge enables reuse of the fullscreen gallery. PostDetailView gets the same media grid.

**Tech Stack:** SwiftUI, MeeshySDK (FeedMedia, CachedAsyncImage), MeeshyUI (InlineVideoPlayerView, AudioPlayerView, ConversationMediaGalleryView)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` | Modify | Add `thumbnailUrl` to `FeedMedia` |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | Modify | Map `APIPostMedia.thumbnailUrl` into `FeedMedia` |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` | Modify | Add `FeedMedia.toMessageAttachment()` bridge |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift` | Modify | Replace placeholders with real media views |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` | Modify | Replace basic AsyncImage with full media grid |

---

### Task 1: Add `thumbnailUrl` to FeedMedia and map it from API

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift:22-48`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:160-169`

- [ ] **Step 1: Add `thumbnailUrl` property to FeedMedia**

In `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift`, add `thumbnailUrl: String?` to the struct and init:

```swift
public struct FeedMedia: Identifiable, Sendable, Codable {
    public let id: String
    public let type: FeedMediaType
    public let url: String?
    public let thumbnailUrl: String?          // <-- NEW
    public let thumbnailColor: String
    // ... rest unchanged

    public init(id: String = UUID().uuidString, type: FeedMediaType, url: String? = nil,
                thumbnailUrl: String? = nil,   // <-- NEW
                thumbnailColor: String = "4ECDC4",
                width: Int? = nil, height: Int? = nil, duration: Int? = nil,
                fileName: String? = nil, fileSize: String? = nil, pageCount: Int? = nil,
                locationName: String? = nil, latitude: Double? = nil, longitude: Double? = nil,
                transcription: MessageTranscription? = nil) {
        self.id = id; self.type = type; self.url = url
        self.thumbnailUrl = thumbnailUrl       // <-- NEW
        self.thumbnailColor = thumbnailColor
        // ... rest unchanged
    }
}
```

Also update the convenience builders `image(url:color:)` and `video(duration:color:)` to pass nil for thumbnailUrl (they already will via the default, so no code change needed there).

- [ ] **Step 2: Map thumbnailUrl in APIPost.toFeedPost()**

In `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`, find the `FeedMedia(...)` construction inside `toFeedPost()` and add `thumbnailUrl: m.thumbnailUrl`:

```swift
return FeedMedia(
    id: m.id, type: m.mediaType, url: m.fileUrl,
    thumbnailUrl: m.thumbnailUrl,              // <-- NEW
    thumbnailColor: thumbnailColorForMime(m.mimeType),
    width: m.width, height: m.height,
    duration: m.duration.map { $0 / 1000 },
    fileName: m.originalName ?? m.fileName,
    fileSize: m.fileSize.map { formatFileSize($0) },
    transcription: transcription
)
```

- [ ] **Step 3: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift
git commit -m "feat(sdk): add thumbnailUrl to FeedMedia and map from API"
```

---

### Task 2: Add FeedMedia-to-MessageAttachment bridge

La gallery fullscreen (`ConversationMediaGalleryView`) et `InlineVideoPlayerView` prennent des `MessageAttachment`. On a besoin d'un pont leger.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` (end of FeedMedia section)

- [ ] **Step 1: Add toMessageAttachment() extension**

After the `FeedMedia` struct definition, add:

```swift
extension FeedMedia {
    /// Bridge to MessageAttachment for reuse of media gallery/player components
    public func toMessageAttachment() -> MeeshyMessageAttachment {
        let attachmentType: AttachmentType = {
            switch type {
            case .image: return .image
            case .video: return .video
            case .audio: return .audio
            case .document: return .file
            case .location: return .location
            }
        }()

        return MeeshyMessageAttachment(
            id: id,
            fileName: fileName ?? "",
            originalName: fileName,
            mimeType: mimeTypeFromFeedType,
            fileSize: 0,
            fileUrl: url ?? "",
            thumbnailUrl: thumbnailUrl,
            thumbnailColor: thumbnailColor,
            width: width,
            height: height,
            durationMs: duration.map { $0 * 1000 },
            latitude: latitude,
            longitude: longitude,
            transcription: transcription
        )
    }

    private var mimeTypeFromFeedType: String {
        switch type {
        case .image: return "image/jpeg"
        case .video: return "video/mp4"
        case .audio: return "audio/mpeg"
        case .document: return "application/pdf"
        case .location: return "application/geo"
        }
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift
git commit -m "feat(sdk): add FeedMedia.toMessageAttachment() bridge for media reuse"
```

---

### Task 3: Replace placeholder image views with CachedAsyncImage in FeedPostCard+Media

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift`

- [ ] **Step 1: Replace `imageMediaView(_:)` (single image)**

Replace the entire function (lines ~146-163):

```swift
func imageMediaView(_ media: FeedMedia) -> some View {
    let urlStr = media.url ?? media.thumbnailUrl ?? ""
    Group {
        if !urlStr.isEmpty {
            CachedAsyncImage(url: urlStr) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(maxWidth: .infinity, minHeight: 160, maxHeight: 280)
            .clipped()
        } else {
            ZStack {
                Color(hex: media.thumbnailColor)
                Image(systemName: "photo.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity, minHeight: 160)
        }
    }
    .clipShape(RoundedRectangle(cornerRadius: 12))
}
```

- [ ] **Step 2: Replace `galleryImageView(_:)` (grid cells)**

Replace the entire function (lines ~80-118):

```swift
func galleryImageView(_ media: FeedMedia) -> some View {
    ZStack {
        let thumbUrl = media.thumbnailUrl ?? media.url ?? ""
        if !thumbUrl.isEmpty && (media.type == .image || media.type == .video) {
            CachedAsyncImage(url: thumbUrl) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        } else {
            LinearGradient(
                colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }

        // Type-specific overlay
        if media.type == .video {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(.ultraThinMaterial)
                        .frame(width: 36, height: 36)
                    Circle()
                        .fill(Color.white.opacity(0.85))
                        .frame(width: 30, height: 30)
                    Image(systemName: "play.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.black.opacity(0.7))
                        .offset(x: 1)
                }
                if let duration = media.durationFormatted {
                    Text(duration)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.black.opacity(0.6)))
                }
            }
        } else if media.type == .audio {
            VStack(spacing: 4) {
                Image(systemName: "waveform")
                    .font(.system(size: 20))
                    .foregroundColor(.white)
                if let duration = media.durationFormatted {
                    Text(duration)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.black.opacity(0.6)))
                }
            }
        }
    }
    .clipped()
}
```

- [ ] **Step 3: Replace `videoMediaView(_:)` (single video)**

Replace the entire function (lines ~165-199). Use `InlineVideoPlayerView` via the bridge:

```swift
func videoMediaView(_ media: FeedMedia) -> some View {
    let attachment = media.toMessageAttachment()
    InlineVideoPlayerView(
        attachment: attachment,
        accentColor: accentColor,
        onExpandFullscreen: nil
    )
    .frame(maxWidth: .infinity, minHeight: 180, maxHeight: 280)
    .clipShape(RoundedRectangle(cornerRadius: 12))
}
```

- [ ] **Step 4: Replace `audioMediaView(_:)` (single audio)**

Replace the entire function (lines ~201-275). Use `AudioPlayerView` via the bridge:

```swift
func audioMediaView(_ media: FeedMedia) -> some View {
    let attachment = media.toMessageAttachment()
    AudioPlayerView(
        attachment: attachment,
        context: .feed,
        accentColor: media.thumbnailColor,
        transcription: media.transcription
    )
    .clipShape(RoundedRectangle(cornerRadius: 12))
}
```

**Note:** If `MediaPlayerContext` doesn't have a `.feed` case, use `.compact` or the closest existing case. Check:
```swift
// In AudioPlayerView.swift, MediaPlayerContext is defined as:
public enum MediaPlayerContext { case bubble, detail, compact, feed }
```
If `.feed` doesn't exist, add it or use `.compact`.

- [ ] **Step 5: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift
git commit -m "feat(ios): display real images, videos, audio in feed post cards"
```

---

### Task 4: Add fullscreen gallery support to FeedPostCard

Quand on tape sur une image/video dans le feed, ouvrir la gallery fullscreen.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`

- [ ] **Step 1: Add fullscreen state to FeedPostCard**

In `FeedPostCard.swift`, add state variables:

```swift
@State private var fullscreenMediaId: String? = nil
@State private var showFullscreenGallery = false
```

- [ ] **Step 2: Add fullScreenCover to FeedPostCard body**

After the existing `.sheet(item: $selectedProfileUser)` modifier, add:

```swift
.fullScreenCover(isPresented: $showFullscreenGallery) {
    let attachments = post.media
        .filter { $0.type == .image || $0.type == .video }
        .map { $0.toMessageAttachment() }
    ConversationMediaGalleryView(
        allAttachments: attachments,
        startAttachmentId: fullscreenMediaId ?? attachments.first?.id ?? "",
        accentColor: accentColor
    )
}
```

- [ ] **Step 3: Add tap gesture to galleryImageView and imageMediaView**

In `FeedPostCard+Media.swift`, wrap `galleryImageView` calls in the `mediaPreview` with `.onTapGesture`:

For the grid layouts (count >= 2), wrap each `galleryImageView(mediaList[N])` usage:

```swift
galleryImageView(mediaList[0])
    .contentShape(Rectangle())
    .onTapGesture { openFullscreen(mediaList[0]) }
```

Add the helper function in the extension:

```swift
private func openFullscreen(_ media: FeedMedia) {
    guard media.type == .image || media.type == .video else { return }
    fullscreenMediaId = media.id
    showFullscreenGallery = true
    HapticFeedback.light()
}
```

For `imageMediaView` (single image), add `.onTapGesture { openFullscreen(media) }` to the outer Group.

For the overflow "+N" overlay, tap should also open the gallery at that position.

- [ ] **Step 4: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift
git commit -m "feat(ios): add fullscreen gallery on feed media tap"
```

---

### Task 5: Replace PostDetailView media section with full media grid

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift:337-367`

- [ ] **Step 1: Add state for fullscreen gallery**

In `PostDetailView`, add:

```swift
@State private var fullscreenMediaId: String? = nil
@State private var showFullscreenGallery = false
```

- [ ] **Step 2: Replace the media section in postFixedSection()**

Replace the current basic `AsyncImage` block (lines ~337-367) with a proper media grid:

```swift
// Media
if post.hasMedia {
    let mediaList = post.media

    if mediaList.count == 1, let media = mediaList.first {
        detailSingleMediaView(media)
            .padding(.horizontal, 16)
            .padding(.top, 8)
    } else if !mediaList.isEmpty {
        detailMediaGrid(mediaList)
            .padding(.horizontal, 16)
            .padding(.top, 8)
    }
}
```

- [ ] **Step 3: Add detail media helper functions**

Add these as private methods in `PostDetailView`:

```swift
// MARK: - Media Views

@ViewBuilder
private func detailSingleMediaView(_ media: FeedMedia) -> some View {
    switch media.type {
    case .image:
        let urlStr = media.url ?? media.thumbnailUrl ?? ""
        Group {
            if !urlStr.isEmpty {
                CachedAsyncImage(url: urlStr) {
                    Color(hex: media.thumbnailColor).shimmer()
                }
                .aspectRatio(contentMode: .fit)
                .frame(maxWidth: .infinity, maxHeight: 300)
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(hex: media.thumbnailColor))
                    .frame(height: 200)
                    .overlay(Image(systemName: "photo").foregroundColor(.white.opacity(0.5)))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { openMediaFullscreen(media) }

    case .video:
        let attachment = media.toMessageAttachment()
        InlineVideoPlayerView(
            attachment: attachment,
            accentColor: accentColor,
            onExpandFullscreen: { openMediaFullscreen(media) }
        )
        .frame(maxWidth: .infinity, maxHeight: 300)
        .clipShape(RoundedRectangle(cornerRadius: 12))

    case .audio:
        let attachment = media.toMessageAttachment()
        AudioPlayerView(
            attachment: attachment,
            context: .compact,
            accentColor: media.thumbnailColor,
            transcription: media.transcription
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))

    case .document:
        detailDocumentView(media)

    case .location:
        detailLocationView(media)
    }
}

@ViewBuilder
private func detailMediaGrid(_ mediaList: [FeedMedia]) -> some View {
    let spacing: CGFloat = 3
    let visualMedia = mediaList.filter { $0.type == .image || $0.type == .video }
    let audioMedia = mediaList.filter { $0.type == .audio }

    VStack(spacing: 8) {
        // Visual grid (images + videos)
        if !visualMedia.isEmpty {
            let count = visualMedia.count
            if count == 2 {
                HStack(spacing: spacing) {
                    detailGridCell(visualMedia[0])
                    detailGridCell(visualMedia[1])
                }
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            } else if count == 3 {
                HStack(spacing: spacing) {
                    detailGridCell(visualMedia[0])
                        .aspectRatio(0.75, contentMode: .fill)
                    VStack(spacing: spacing) {
                        detailGridCell(visualMedia[1])
                        detailGridCell(visualMedia[2])
                    }
                }
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            } else {
                VStack(spacing: spacing) {
                    HStack(spacing: spacing) {
                        detailGridCell(visualMedia[0])
                        if count > 1 { detailGridCell(visualMedia[1]) }
                    }
                    if count > 2 {
                        HStack(spacing: spacing) {
                            detailGridCell(visualMedia[2])
                            if count > 3 {
                                ZStack {
                                    detailGridCell(visualMedia[3])
                                    if count > 4 {
                                        Color.black.opacity(0.5)
                                        Text("+\(count - 4)")
                                            .font(.system(size: 20, weight: .bold))
                                            .foregroundColor(.white)
                                    }
                                }
                            }
                        }
                    }
                }
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
        }

        // Audio players below grid
        ForEach(audioMedia) { audio in
            detailSingleMediaView(audio)
        }
    }
}

private func detailGridCell(_ media: FeedMedia) -> some View {
    let thumbUrl = media.thumbnailUrl ?? media.url ?? ""
    return ZStack {
        if !thumbUrl.isEmpty {
            CachedAsyncImage(url: thumbUrl) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        } else {
            Color(hex: media.thumbnailColor)
        }

        if media.type == .video {
            ZStack {
                Circle().fill(.ultraThinMaterial).frame(width: 36, height: 36)
                Circle().fill(Color(hex: accentColor).opacity(0.85)).frame(width: 30, height: 30)
                Image(systemName: "play.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .offset(x: 1)
            }
            .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
        }
    }
    .contentShape(Rectangle())
    .onTapGesture { openMediaFullscreen(media) }
}

private func detailDocumentView(_ media: FeedMedia) -> some View {
    HStack(spacing: 14) {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                .frame(width: 48, height: 56)
            Image(systemName: "doc.fill")
                .font(.system(size: 24))
                .foregroundColor(Color(hex: media.thumbnailColor))
        }
        VStack(alignment: .leading, spacing: 4) {
            Text(media.fileName ?? "Document")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)
            HStack(spacing: 8) {
                if let size = media.fileSize {
                    Text(size).font(.system(size: 12)).foregroundColor(theme.textMuted)
                }
                if let pages = media.pageCount {
                    Text("\u{2022}").foregroundColor(theme.textMuted)
                    Text("\(pages) pages").font(.system(size: 12)).foregroundColor(theme.textMuted)
                }
            }
        }
        Spacer()
        Image(systemName: "arrow.down.circle.fill")
            .font(.system(size: 28))
            .foregroundColor(Color(hex: media.thumbnailColor))
    }
    .padding(14)
    .background(
        RoundedRectangle(cornerRadius: 12)
            .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1))
    )
}

private func detailLocationView(_ media: FeedMedia) -> some View {
    HStack(spacing: 14) {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                .frame(width: 64, height: 64)
            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 28))
                .foregroundColor(Color(hex: media.thumbnailColor))
        }
        VStack(alignment: .leading, spacing: 4) {
            Text(media.locationName ?? "Location")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)
            if let lat = media.latitude, let lon = media.longitude {
                Text(String(format: "%.4f, %.4f", lat, lon))
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }
        }
        Spacer()
    }
    .padding(14)
    .background(
        RoundedRectangle(cornerRadius: 12)
            .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1))
    )
}

private func openMediaFullscreen(_ media: FeedMedia) {
    guard media.type == .image || media.type == .video else { return }
    fullscreenMediaId = media.id
    showFullscreenGallery = true
    HapticFeedback.light()
}
```

- [ ] **Step 4: Add fullScreenCover to the body**

After the `.sheet(item: $selectedProfileUser)`, add:

```swift
.fullScreenCover(isPresented: $showFullscreenGallery) {
    if let post = displayPost {
        let attachments = post.media
            .filter { $0.type == .image || $0.type == .video }
            .map { $0.toMessageAttachment() }
        ConversationMediaGalleryView(
            allAttachments: attachments,
            startAttachmentId: fullscreenMediaId ?? attachments.first?.id ?? "",
            accentColor: accentColor
        )
    }
}
```

- [ ] **Step 5: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift
git commit -m "feat(ios): full media display with grid, video, audio in post detail view"
```

---

### Task 6: Verify MediaPlayerContext has needed cases

**Files:**
- Check: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`

- [ ] **Step 1: Check if MediaPlayerContext.feed or .compact exists**

Search for `enum MediaPlayerContext` in the codebase. If `.feed` doesn't exist, either:
- Add `.feed` case if the enum is in MeeshyUI
- Or use `.compact` as fallback

```swift
// If it doesn't exist, add to the enum:
case feed
```

- [ ] **Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift
git commit -m "feat(ui): add feed context to MediaPlayerContext"
```

---

### Task 7: Final integration test

- [ ] **Step 1: Build the full app**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded with 0 errors

- [ ] **Step 2: Run on simulator and verify**

Run: `./apps/ios/meeshy.sh run`

Test checklist:
1. Open the feed - posts with images show real thumbnails (not gradient placeholders)
2. Posts with videos show video thumbnail + play button overlay
3. Posts with audio show functional AudioPlayerView with waveform
4. Posts with multiple images show grid layout with real thumbnails
5. Tap an image in feed -> fullscreen gallery opens
6. Swipe between images in fullscreen gallery
7. Open post detail view -> media displays identically
8. Tap image in detail view -> fullscreen gallery opens
9. Audio plays correctly in both feed and detail views
10. Video plays inline in detail view

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(ios): feed media display polish"
```
