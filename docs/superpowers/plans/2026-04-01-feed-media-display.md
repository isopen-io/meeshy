# Feed & Post Detail Media Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix feed text truncation (20 words), post detail 3-zone layout with collapsible text (60 words), video aspect ratio preservation, and progressive thumbnail-to-full image loading with cache.

**Architecture:** Pure iOS/SDK changes. Feed cards truncate text and show "voir plus" indicator. Post detail splits into 3 zones: collapsible text, properly-sized media (respecting capture aspect ratios), and visible comment preview. CachedAsyncImage gets a progressive variant that loads thumbnail first then full-size in background.

**Tech Stack:** SwiftUI, AVKit (InlineVideoPlayerView), MeeshySDK cache (DiskCacheStore/CacheCoordinator)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift` | Modify | Add `ProgressiveCachedImage` that loads thumbnail then full URL |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:119-123` | Modify | Truncate text to 20 words + "voir plus" indicator |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift:255-481` | Modify | 3-zone layout: collapsible text (60 words), media, comments preview |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift:108-167` | Modify | Use `ProgressiveCachedImage` for gallery cells, respect aspect ratio |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift:8-11,72-110` | Modify | Change `.resizeAspectFill` to `.resizeAspect`, compute aspect ratio from attachment metadata |

---

### Task 1: Add ProgressiveCachedImage component

Adds a new SwiftUI view that loads a thumbnail URL immediately (from cache or network), then loads the full-size URL in background, crossfading to it when ready.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift`

- [ ] **Step 1: Add ProgressiveCachedImage struct**

Add after `CachedBannerImage` (line ~203) in `CachedAsyncImage.swift`:

```swift
public struct ProgressiveCachedImage<Placeholder: View>: View {
    public let thumbnailUrl: String?
    public let fullUrl: String?
    public let placeholder: () -> Placeholder

    @State private var thumbnailImage: UIImage?
    @State private var fullImage: UIImage?
    @State private var isLoadingFull = false

    public init(
        thumbnailUrl: String?,
        fullUrl: String?,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.thumbnailUrl = thumbnailUrl
        self.fullUrl = fullUrl
        self.placeholder = placeholder
        if let fullUrl, !fullUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
            _fullImage = State(initialValue: DiskCacheStore.cachedImage(for: resolved))
        }
        if fullImage == nil, let thumbnailUrl, !thumbnailUrl.isEmpty {
            let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
            _thumbnailImage = State(initialValue: DiskCacheStore.cachedImage(for: resolved))
        }
    }

    private var displayImage: UIImage? { fullImage ?? thumbnailImage }

    public var body: some View {
        Group {
            if let displayImage {
                Image(uiImage: displayImage)
                    .resizable()
            } else {
                placeholder()
            }
        }
        .task(id: thumbnailUrl) {
            guard fullImage == nil else { return }
            await loadThumbnail()
        }
        .task(id: fullUrl) {
            await loadFullImage()
        }
    }

    private func loadThumbnail() async {
        guard let thumbnailUrl, !thumbnailUrl.isEmpty, thumbnailImage == nil else { return }
        let resolved = MeeshyConfig.resolveMediaURL(thumbnailUrl)?.absoluteString ?? thumbnailUrl
        if let loaded = await CacheCoordinator.shared.images.image(for: resolved) {
            if !Task.isCancelled, fullImage == nil {
                withAnimation(.easeIn(duration: 0.15)) { thumbnailImage = loaded }
            }
        }
    }

    private func loadFullImage() async {
        guard let fullUrl, !fullUrl.isEmpty else { return }
        let resolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
        if DiskCacheStore.cachedImage(for: resolved) != nil {
            if let loaded = await CacheCoordinator.shared.images.image(for: resolved) {
                if !Task.isCancelled {
                    withAnimation(.easeIn(duration: 0.2)) { fullImage = loaded }
                }
            }
            return
        }
        if let loaded = await CacheCoordinator.shared.images.image(for: resolved) {
            if !Task.isCancelled {
                withAnimation(.easeIn(duration: 0.3)) { fullImage = loaded }
            }
        }
    }
}
```

- [ ] **Step 2: Build to verify compilation**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift
git commit -m "feat(sdk): add ProgressiveCachedImage for thumbnail-to-full progressive loading"
```

---

### Task 2: Feed card text truncation to 20 words + "voir plus"

Truncates post content in the feed card to 20 words maximum, appending a non-actionable "voir plus" indicator. The entire card is already tappable to open post detail.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:119-123`

- [ ] **Step 1: Add word truncation helper**

Add a computed property inside `FeedPostCard` (after `topComments` on line 44):

```swift
private var truncatedContent: (text: String, isTruncated: Bool) {
    let words = effectiveContent.split(separator: " ", omittingEmptySubsequences: true)
    if words.count <= 20 { return (effectiveContent, false) }
    let truncated = words.prefix(20).joined(separator: " ")
    return (truncated, true)
}
```

- [ ] **Step 2: Replace full text with truncated text + "voir plus"**

Replace lines 119-123 in `FeedPostCard.swift`:
```swift
                    // Post content (Prisme Linguistique)
                    Text(effectiveContent)
                        .font(.system(size: 15))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(nil)
```

With:
```swift
                    // Post content (truncated for feed — Prisme Linguistique)
                    let truncation = truncatedContent
                    (Text(truncation.text)
                        .font(.system(size: 15))
                        .foregroundColor(theme.textPrimary)
                    + (truncation.isTruncated
                        ? Text("... ") .font(.system(size: 15)).foregroundColor(theme.textPrimary)
                          + Text("voir plus").font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textMuted)
                        : Text("")
                    ))
                    .lineLimit(nil)
```

- [ ] **Step 3: Build to verify**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift
git commit -m "feat(ios): truncate feed post text to 20 words with 'voir plus' indicator"
```

---

### Task 3: Use ProgressiveCachedImage in feed gallery cells

Replace `CachedAsyncImage` calls in the gallery grid with `ProgressiveCachedImage` to load thumbnails first, then full-size images in background.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift:108-125`

- [ ] **Step 1: Update galleryImageView to use progressive loading**

Replace the `galleryImageView` function (lines 108-167):

```swift
    func galleryImageView(_ media: FeedMedia) -> some View {
        ZStack {
            let thumbUrl = media.thumbnailUrl
            let fullUrl = media.url
            if (thumbUrl != nil && !thumbUrl!.isEmpty) || (fullUrl != nil && !fullUrl!.isEmpty) {
                ProgressiveCachedImage(
                    thumbnailUrl: thumbUrl,
                    fullUrl: fullUrl
                ) {
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

            // Video overlay
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

- [ ] **Step 2: Update singleMediaView image case to use progressive loading**

Replace the `imageMediaView` function (lines 202-211):

```swift
    func imageMediaView(_ media: FeedMedia) -> some View {
        let aspectRatio: CGFloat? = {
            guard let w = media.width, let h = media.height, w > 0, h > 0 else { return nil }
            return CGFloat(w) / CGFloat(h)
        }()
        return ProgressiveCachedImage(
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: media.url
        ) {
            Color(hex: media.thumbnailColor).shimmer()
        }
        .aspectRatio(aspectRatio, contentMode: .fill)
        .frame(maxWidth: .infinity, minHeight: 160, maxHeight: 280)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { openFullscreen(media) }
    }
```

- [ ] **Step 3: Build to verify**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift
git commit -m "feat(ios): use progressive image loading in feed gallery cells"
```

---

### Task 4: Fix video aspect ratio in InlineVideoPlayerView

The current video player uses `.resizeAspectFill` which crops videos and doesn't preserve capture proportions. Fix it to use `.resizeAspect` and compute height from the actual attachment width/height metadata.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift`

- [ ] **Step 1: Change AVPlayerLayer videoGravity to resizeAspect**

In the `AVPlayerLayerView` struct (line 11), change:
```swift
        view.playerLayer.videoGravity = .resizeAspectFill
```
To:
```swift
        view.playerLayer.videoGravity = .resizeAspect
```

- [ ] **Step 2: Add computed aspect ratio and dynamic height**

Add a computed property inside `InlineVideoPlayerView` (after `isThisPlayerActive` around line 59):

```swift
    private var videoAspectRatio: CGFloat {
        guard let w = attachment.width, let h = attachment.height, w > 0, h > 0 else {
            return 16.0 / 9.0
        }
        return CGFloat(w) / CGFloat(h)
    }
```

- [ ] **Step 3: Replace fixed frame with aspect-ratio-aware sizing in body**

In the `body` (line 72), replace the entire `ZStack` with aspect-ratio-aware sizing. The key change is wrapping in `.aspectRatio(videoAspectRatio, contentMode: .fit)` instead of letting the parent set a fixed height.

Replace the body:
```swift
    public var body: some View {
        ZStack {
            Color.black

            if isThisPlayerActive, let player = manager.player {
                AVPlayerLayerView(player: player)
                    .onTapGesture { toggleControls() }
                    .onDisappear {
                        controlsTimer?.invalidate()
                        controlsTimer = nil
                        if manager.activeURL == attachment.fileUrl {
                            manager.pause()
                        }
                    }

                if showControls {
                    VideoPlayerOverlayControls(
                        manager: manager,
                        accentColor: accentColor,
                        isFullscreen: false,
                        onExpandFullscreen: onExpandFullscreen
                    )
                    .transition(.opacity)
                }
            } else {
                thumbnailLayer

                if let formatted = attachment.durationFormatted {
                    durationBadge(formatted)
                }

                playButton
            }
        }
        .aspectRatio(videoAspectRatio, contentMode: .fit)
        .frame(maxHeight: 400)
        .background(Color.black)
        .clipped()
        .contentShape(Rectangle())
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .animation(.easeInOut(duration: 0.25), value: isThisPlayerActive)
    }
```

- [ ] **Step 4: Update thumbnailLayer to use resizeAspect**

In `thumbnailLayer` (line ~116), change the CachedAsyncImage aspect ratio from `.fill` to `.fit`:

Replace:
```swift
            CachedAsyncImage(url: thumbUrl) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
```

With:
```swift
            CachedAsyncImage(url: thumbUrl) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fit)
```

- [ ] **Step 5: Build to verify**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift
git commit -m "fix(sdk): preserve video capture aspect ratio in InlineVideoPlayerView"
```

---

### Task 5: Post detail 3-zone layout with collapsible text

Restructure PostDetailView's `postFixedSection` into 3 clear zones:
1. **Text zone**: Author header + content truncated to 60 words with "more" toggle; scrollable when expanded
2. **Media zone**: Properly sized media with aspect ratio from metadata
3. **Comments zone**: 2-3 comments always visible at bottom

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`

- [ ] **Step 1: Add text expansion state and helper**

Add state variables after the existing `@State` declarations (around line 24):

```swift
    @State private var isTextExpanded = false
```

Add a computed property after `effectiveContent` (around line 49):

```swift
    private var textTruncation: (text: String, isTruncated: Bool) {
        let words = effectiveContent.split(separator: " ", omittingEmptySubsequences: true)
        if words.count <= 60 { return (effectiveContent, false) }
        let truncated = words.prefix(60).joined(separator: " ")
        return (truncated, true)
    }
```

- [ ] **Step 2: Restructure body into 3-zone layout**

Replace the body's `ScrollView` content (lines 95-153). The new layout uses a `GeometryReader` approach to keep media and comments visible while making text scrollable when expanded:

```swift
            if let post = displayPost {
                ScrollViewReader { proxy in
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            // ZONE 1: Author + Collapsible Text
                            textZone(post)

                            // ZONE 2: Media
                            if post.hasMedia {
                                detailMediaSection(post.media)
                                    .padding(.horizontal, 16)
                                    .padding(.top, 8)
                                    .id("media")
                            }

                            // Repost embed
                            if let repost = post.repost {
                                repostEmbed(repost)
                            }

                            // Actions bar
                            actionsBar(post)

                            Rectangle()
                                .fill(theme.inputBorder.opacity(0.5))
                                .frame(height: 1)
                                .padding(.horizontal, 16)

                            // ZONE 3: Comments
                            commentsHeader

                            ForEach(viewModel.topLevelComments) { comment in
                                ThreadedCommentSection(
                                    comment: comment,
                                    replies: viewModel.repliesFor(comment.id),
                                    isExpanded: viewModel.expandedThreads.contains(comment.id),
                                    isLoadingReplies: viewModel.loadingReplies.contains(comment.id),
                                    accentColor: accentColor,
                                    onReply: { target in
                                        viewModel.replyingTo = target
                                    },
                                    onToggleThread: {
                                        Task { await viewModel.toggleThread(comment.id, postId: postId) }
                                    },
                                    onLikeComment: { commentId in
                                        Task {
                                            try? await PostService.shared.likeComment(postId: postId, commentId: commentId)
                                        }
                                    },
                                    moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                                    storyState: storyViewModel.storyGroupForUser(userId: comment.authorId).map { $0.hasUnviewed ? .unread : .read } ?? .none,
                                    presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state ?? .offline,
                                    replyMoodResolver: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                                    replyStoryResolver: { storyViewModel.storyGroupForUser(userId: $0).map { $0.hasUnviewed ? .unread : .read } ?? .none },
                                    replyPresenceResolver: { PresenceManager.shared.presenceMap[$0]?.state ?? .offline }
                                )
                                .padding(.horizontal, 16)
                            }

                            if viewModel.isLoadingComments {
                                ProgressView()
                                    .padding()
                            }

                            if viewModel.hasMoreComments && !viewModel.isLoadingComments {
                                Button {
                                    Task { await viewModel.loadMoreComments(postId) }
                                } label: {
                                    Text("Charger plus")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(MeeshyColors.indigo500)
                                }
                                .padding()
                            }
                        }
                        .padding(.bottom, 80)
                    }
                }
            } else if viewModel.isLoading {
                Spacer()
                ProgressView()
                Spacer()
            }
```

- [ ] **Step 3: Create textZone function**

Replace the old `postFixedSection` function (lines 255-481) with the new `textZone`, `repostEmbed`, and `actionsBar` extracted functions:

```swift
    // MARK: - Zone 1: Text (Collapsible)

    @ViewBuilder
    private func textZone(_ post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Author header
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: post.author,
                    context: .postAuthor,
                    accentColor: post.authorColor,
                    avatarURL: post.authorAvatarURL,
                    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
                    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                    onMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            selectedProfileUser = .from(feedPost: post)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.author)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .onTapGesture {
                            selectedProfileUser = .from(feedPost: post)
                        }

                    HStack(spacing: 4) {
                        Text(post.timestamp, style: .relative)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)

                        let flags = buildAvailableFlags()
                        if !flags.isEmpty || (post.translations != nil && !post.translations!.isEmpty) {
                            Text("·").font(.system(size: 12)).foregroundColor(theme.textMuted)

                            ForEach(flags, id: \.self) { code in
                                let display = LanguageDisplay.from(code: code)
                                let isActive = code == secondaryLangCode
                                VStack(spacing: 1) {
                                    Text(display?.flag ?? "?")
                                        .font(.system(size: isActive ? 12 : 10))
                                        .scaleEffect(isActive ? 1.05 : 1.0)
                                    if isActive {
                                        RoundedRectangle(cornerRadius: 1)
                                            .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                                            .frame(width: 10, height: 1.5)
                                    }
                                }
                                .animation(.easeInOut(duration: 0.2), value: isActive)
                                .onTapGesture { handleFlagTap(code) }
                            }

                            if post.translations != nil, !post.translations!.isEmpty {
                                Image(systemName: "translate")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(MeeshyColors.indigo400)
                                    .onTapGesture {
                                        HapticFeedback.light()
                                        showTranslationSheet = true
                                    }
                            }
                        }
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Content with 60-word collapse
            let truncation = textTruncation
            VStack(alignment: .leading, spacing: 4) {
                Text(isTextExpanded || !truncation.isTruncated ? effectiveContent : truncation.text)
                    .font(.system(size: 16))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)

                if truncation.isTruncated {
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isTextExpanded.toggle()
                        }
                        HapticFeedback.light()
                    } label: {
                        Text(isTextExpanded ? "voir moins" : "... voir plus")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color(hex: accentColor))
                    }
                }
            }
            .padding(.horizontal, 16)
            .animation(.easeInOut(duration: 0.25), value: isTextExpanded)

            // Inline secondary translation panel
            if let content = secondaryContent, let code = secondaryLangCode {
                let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
                let display = LanguageDisplay.from(code: code)
                VStack(spacing: 0) {
                    HStack(spacing: 6) {
                        Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                        Circle().fill(langColor).frame(width: 4, height: 4)
                        Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        if let display {
                            HStack(spacing: 4) {
                                Text(display.flag).font(.system(size: 11))
                                Text(display.name)
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(langColor)
                            }
                        }
                        Text(content)
                            .font(.system(size: 14))
                            .foregroundColor(theme.textPrimary.opacity(0.8))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(langColor.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    // MARK: - Repost Embed (extracted)

    @ViewBuilder
    private func repostEmbed(_ repost: RepostContent) -> some View {
        Button {
            HapticFeedback.light()
            router.push(.postDetail(repost.id))
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    MeeshyAvatar(
                        name: repost.author,
                        context: .postComment,
                        accentColor: repost.authorColor,
                        avatarURL: repost.authorAvatarURL
                    )
                    Text(repost.author)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.accentText(repost.authorColor))
                    Text("·").foregroundColor(theme.textMuted)
                    Text(repost.timestamp, style: .relative)
                        .font(.system(size: 10))
                        .foregroundColor(theme.textMuted)
                }
                Text(repost.content)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.surfaceGradient(tint: repost.authorColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(theme.border(tint: repost.authorColor, intensity: 0.2), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Actions Bar (extracted)

    private func actionsBar(_ post: FeedPost) -> some View {
        HStack(spacing: 0) {
            Button {
                Task { await viewModel.likePost() }
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                    likeScale = 1.3
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        likeScale = 1.0
                    }
                }
            } label: {
                HStack(spacing: 5) {
                    let heartColor: Color = post.isLiked ? MeeshyColors.error : (post.likes > 0 ? Color(hex: accentColor) : theme.textSecondary)
                    Image(systemName: post.isLiked || post.likes > 0 ? "heart.fill" : "heart")
                        .font(.system(size: 18))
                        .foregroundColor(heartColor)
                        .scaleEffect(likeScale)
                    Text("\(post.likes)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(post.isLiked ? MeeshyColors.error : (post.likes > 0 ? Color(hex: accentColor) : theme.textMuted))
                }
            }

            Spacer()

            HStack(spacing: 5) {
                Image(systemName: "bubble.right")
                    .font(.system(size: 17))
                    .foregroundColor(Color(hex: accentColor))
                Text("\(post.commentCount)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            Button {
                Task { await viewModel.bookmarkPost() }
                HapticFeedback.light()
            } label: {
                Image(systemName: "bookmark")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()

            Button {
                HapticFeedback.light()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }
```

- [ ] **Step 4: Update detail media section to use ProgressiveCachedImage and proper aspect ratios**

Replace `detailSingleMedia` image case (lines 520-537) with progressive loading and aspect ratio:

```swift
        case .image:
            let aspectRatio: CGFloat? = {
                guard let w = media.width, let h = media.height, w > 0, h > 0 else { return nil }
                return CGFloat(w) / CGFloat(h)
            }()
            ProgressiveCachedImage(
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(aspectRatio, contentMode: .fit)
            .frame(maxWidth: .infinity, maxHeight: 400)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onTapGesture { openMediaFullscreen(media) }
```

Replace `detailSingleMedia` video case (lines 539-547) with aspect-ratio-aware sizing:

```swift
        case .video:
            InlineVideoPlayerView(
                attachment: media.toMessageAttachment(),
                accentColor: accentColor,
                onExpandFullscreen: { openMediaFullscreen(media) }
            )
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12))
```

Note: Remove the old `.frame(maxWidth: .infinity, maxHeight: 300)` — the InlineVideoPlayerView now self-sizes via its internal `aspectRatio` modifier.

- [ ] **Step 5: Update detailGridCell to use ProgressiveCachedImage**

Replace the `detailGridCell` function (lines 678-706):

```swift
    private func detailGridCell(_ media: FeedMedia) -> some View {
        ZStack {
            ProgressiveCachedImage(
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()

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
```

- [ ] **Step 6: Remove the old postFixedSection function**

Delete the entire `postFixedSection` function (it's been replaced by `textZone`, `repostEmbed`, and `actionsBar`).

- [ ] **Step 7: Build to verify**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift
git commit -m "feat(ios): restructure PostDetailView into 3-zone layout with collapsible text and proper media sizing"
```

---

### Task 6: Fix VideoPlayerView aspect ratio in non-inline contexts

The `VideoPlayerView` (used for message bubbles) also has fixed height without aspect ratio awareness. Fix it to respect capture proportions when used in feedPost context.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoPlayerView.swift`

- [ ] **Step 1: Replace fixed videoHeight with aspect-ratio-aware sizing**

Replace the `videoHeight` computed property (lines 33-40):

```swift
    private var videoHeight: CGFloat {
        switch context {
        case .messageBubble: return 180
        case .composerAttachment: return 140
        case .feedPost: return 240
        case .storyOverlay: return 300
        case .fullscreen: return UIScreen.main.bounds.height
        }
    }
```

With:
```swift
    private var videoAspectRatio: CGFloat? {
        guard context == .feedPost || context == .storyOverlay else { return nil }
        guard let w = attachment.width, let h = attachment.height, w > 0, h > 0 else { return nil }
        return CGFloat(w) / CGFloat(h)
    }

    private var videoHeight: CGFloat {
        switch context {
        case .messageBubble: return 180
        case .composerAttachment: return 140
        case .feedPost: return 280
        case .storyOverlay: return 300
        case .fullscreen: return UIScreen.main.bounds.height
        }
    }
```

- [ ] **Step 2: Apply aspect ratio to the ZStack frame**

In the body (line 89), replace:
```swift
            .frame(height: videoHeight)
```

With:
```swift
            .aspectRatio(videoAspectRatio, contentMode: .fit)
            .frame(maxHeight: videoHeight)
```

- [ ] **Step 3: Build to verify**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/VideoPlayerView.swift
git commit -m "fix(sdk): respect video aspect ratio in VideoPlayerView feedPost context"
```
