# iOS Feed: Avatar Fix + Repost Navigation + PostDetail Layout

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing avatar images in feed posts, make repost cards navigable to PostDetailView, and improve PostDetailView to use full width for content.

**Architecture:** 3 surgical fixes in 3 files. No new files, no new APIs, no new models. All changes are in the iOS app view layer.

**Tech Stack:** SwiftUI, MeeshyUI (MeeshyAvatar)

---

## Task 1: Fix missing avatar images in FeedPostCard

**Bug:** `MeeshyAvatar` is called without `avatarURL` parameter in 4 places. `post.authorAvatarURL` exists on `FeedPost` but is never passed. Users see initials instead of their actual avatar image.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`

- [ ] **Step 1: Read FeedPostCard.swift and identify all MeeshyAvatar calls**

4 call sites:
1. `authorHeader` (~line 125) — post author avatar
2. `repostView` (~line 183) — repost original author avatar
3. Stacked avatars (~line 369) — commenter avatars in "see all comments"
4. `topCommentRow` (~line 406) — individual commenter avatar

- [ ] **Step 2: Fix authorHeader avatar (line 125)**

```swift
// BEFORE:
MeeshyAvatar(
    name: post.author,
    context: .postAuthor,
    accentColor: accentColor,
    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
    ...
)

// AFTER — add avatarURL:
MeeshyAvatar(
    name: post.author,
    context: .postAuthor,
    accentColor: accentColor,
    avatarURL: post.authorAvatarURL,
    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
    ...
)
```

- [ ] **Step 3: Fix repostView avatar (line 183)**

```swift
// BEFORE:
MeeshyAvatar(
    name: repost.author,
    context: .postComment,
    accentColor: repost.authorColor
)

// AFTER — add avatarURL:
MeeshyAvatar(
    name: repost.author,
    context: .postComment,
    accentColor: repost.authorColor,
    avatarURL: repost.authorAvatarURL
)
```

- [ ] **Step 4: Fix stacked avatars (line 369)**

```swift
// BEFORE:
MeeshyAvatar(
    name: comment.author,
    context: .postReaction,
    accentColor: comment.authorColor
)

// AFTER — add avatarURL:
MeeshyAvatar(
    name: comment.author,
    context: .postReaction,
    accentColor: comment.authorColor,
    avatarURL: comment.authorAvatarURL
)
```

- [ ] **Step 5: Fix topCommentRow avatar (line 406)**

```swift
// BEFORE:
MeeshyAvatar(
    name: comment.author,
    context: .postComment,
    accentColor: comment.authorColor,
    moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
    ...
)

// AFTER — add avatarURL:
MeeshyAvatar(
    name: comment.author,
    context: .postComment,
    accentColor: comment.authorColor,
    avatarURL: comment.authorAvatarURL,
    moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
    ...
)
```

- [ ] **Step 6: Build**

`./apps/ios/meeshy.sh build`

- [ ] **Step 7: Commit**

```
fix(ios): pass avatarURL to MeeshyAvatar in FeedPostCard (4 sites)

Avatar images were not displaying in feed posts — only initials shown.
MeeshyAvatar was called without the avatarURL parameter despite
FeedPost.authorAvatarURL and FeedComment.authorAvatarURL being available.
```

---

## Task 2: Fix missing avatar in PostDetailView + full-width layout

**Same bug** in PostDetailView header. Plus: content has excessive horizontal padding (16pt both sides), and media preview is constrained to maxHeight 300 instead of filling available width.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`

- [ ] **Step 1: Fix avatar in postHeader (line 86)**

```swift
// BEFORE:
MeeshyAvatar(
    name: post.author,
    context: .postAuthor,
    accentColor: post.authorColor,
    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
    ...
)

// AFTER — add avatarURL:
MeeshyAvatar(
    name: post.author,
    context: .postAuthor,
    accentColor: post.authorColor,
    avatarURL: post.authorAvatarURL,
    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
    ...
)
```

- [ ] **Step 2: Improve media preview to use full width**

At line 156-179, the media preview has `padding(.horizontal, 16)` and `maxHeight: 300`. For detail view, media should take full width:

```swift
// BEFORE:
.frame(maxHeight: 300)
.clipShape(RoundedRectangle(cornerRadius: 12))
.padding(.horizontal, 16)
.padding(.bottom, 12)

// AFTER — full width, taller max:
.frame(maxWidth: .infinity, maxHeight: 400)
.clipShape(RoundedRectangle(cornerRadius: 0))
.padding(.bottom, 12)
```

Remove `cornerRadius` on the image clip shape so it spans edge-to-edge. Keep cornerRadius only if not full-width.

- [ ] **Step 3: Reduce content horizontal padding**

At line 149, change:
```swift
// BEFORE:
.padding(.horizontal, 16)

// AFTER — more breathing room:
.padding(.horizontal, 12)
```

For the header at line 121:
```swift
// BEFORE:
.padding(16)

// AFTER:
.padding(.horizontal, 12)
.padding(.vertical, 12)
```

- [ ] **Step 4: Build**

`./apps/ios/meeshy.sh build`

- [ ] **Step 5: Commit**

```
fix(ios): add avatarURL to PostDetailView + full-width media layout

Added missing avatarURL to MeeshyAvatar in post header. Media preview
now uses full width (no horizontal padding, maxHeight 400) for a more
immersive detail view. Reduced overall horizontal padding from 16 to 12.
```

---

## Task 3: Make repost card navigable to PostDetailView

**Feature:** Tapping the repost/quote card in FeedPostCard should navigate to the original post in PostDetailView with its comments.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` (repostView function)

- [ ] **Step 1: Read how navigation works in FeedView**

Check how `onTapPost` is wired. The FeedPostCard should have an `onTapRepost` callback or use the existing router. Search for `router.push(.postDetail` in FeedView.swift to understand the pattern.

- [ ] **Step 2: Add onTapRepost callback to FeedPostCard**

Read the FeedPostCard struct definition (top of file). It already has callback properties like `onToggleComments`, `onLike`, etc. Add:

```swift
var onTapRepost: ((String) -> Void)?  // postId of the original reposted post
```

- [ ] **Step 3: Wrap repostView in a tap gesture**

In `repostView(_ repost:)`, wrap the entire VStack in a Button or `.onTapGesture`:

```swift
private func repostView(_ repost: RepostContent) -> some View {
    Button {
        HapticFeedback.light()
        onTapRepost?(repost.id)
    } label: {
        VStack(alignment: .leading, spacing: 10) {
            // ... existing repost content (header + text + media)
        }
    }
    .buttonStyle(PlainButtonStyle())
}
```

- [ ] **Step 4: Wire the callback in FeedView**

Read `FeedView.swift`. Find where `FeedPostCard` is instantiated. Add the `onTapRepost` parameter:

```swift
FeedPostCard(
    post: post,
    // ... existing params ...
    onTapRepost: { repostId in
        router.push(.postDetail(repostId))
    }
)
```

If `onTapPost` already exists and navigates to PostDetailView, you can reuse the same pattern.

- [ ] **Step 5: Build**

`./apps/ios/meeshy.sh build`

- [ ] **Step 6: Commit**

```
feat(ios): make repost/quote cards navigable to PostDetailView

Tapping a repost card in the feed now navigates to the original post
in PostDetailView with its full content and comments. Added onTapRepost
callback to FeedPostCard, wired to router.push(.postDetail(repostId)).
```

---

## Post-Implementation Verification

- [ ] **Build:** `./apps/ios/meeshy.sh build` succeeds
- [ ] **Feed avatars:** Open feed → verify user profile images display (not just initials)
- [ ] **Repost avatars:** Post with a repost → verify original author avatar shows
- [ ] **Comment avatars:** Expand comments → verify commenter avatars show
- [ ] **Repost tap:** Tap on a repost card → verify navigation to PostDetailView with correct post
- [ ] **Detail layout:** Open PostDetailView → verify media takes full width, content has proper spacing
- [ ] **Detail avatar:** PostDetailView header → verify author avatar image displays
