# PostDetailView Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PostDetailView a fully functional, polished post detail screen with proper navigation, UniversalComposerBar, copy text, reply-to-comment, and correct repost embed framing.

**Architecture:** Fix the broken navigation chain (back button, initialPost passthrough), replace the basic TextField composer with UniversalComposerBar (mode: .comment), add context menu for copy, fix tap gesture conflicts on FeedPostCard, and improve repost embed width.

**Tech Stack:** SwiftUI, MeeshySDK, UniversalComposerBar component

---

## Current State & Problems

| Problem | Root Cause | File |
|---------|-----------|------|
| No back button on PostDetailView | RootView wraps with `.navigationBarHidden(true)`, no custom back button | `PostDetailView.swift`, `RootView.swift:186` |
| Blank initial state | `RootView` passes `PostDetailView(postId:)` without `initialPost` | `RootView.swift:185` |
| Basic TextField composer | Hand-coded HStack instead of `UniversalComposerBar` | `PostDetailView.swift:277-331` |
| No text selection | Post text not selectable (`.textSelection(.enabled)` missing) | `PostDetailView.swift:129-153` |
| No reply-to-comment | Composer doesn't track `replyingTo` state | `PostDetailView.swift` |
| Repost embed narrow | Inherits card padding but needs full-width | `PostDetailView.swift:157-181` (missing entirely — only FeedPostCard has it) |
| Tap gesture conflict on FeedPostCard | `.onTapGesture` on whole card intercepts button taps | `FeedPostCard.swift:111-113` |
| `initialPost` not passed from ThemedFeedOverlay | `onTapPost` only sends postId, not the post object | `RootViewComponents.swift:208-240` |

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **Rewrite** | `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` | Full post detail screen: header, content, media, repost, comments, UniversalComposerBar |
| **Modify** | `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift` | Add `replyingTo` state, `sendReply` method |
| **Modify** | `apps/ios/Meeshy/Features/Main/Views/RootView.swift:184-186` | Pass `initialPost` to PostDetailView, remove `.navigationBarHidden(true)` for this route |
| **Modify** | `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift:208-240` | Pass post object via `onTapPost` |
| **Modify** | `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:8-17,111-113` | Change `onTapPost` signature to pass `FeedPost`, fix tap gesture conflict |
| **Modify** | `apps/ios/Meeshy/Features/Main/Views/FeedView.swift:286-290` | Update `onTapPost` callback to pass post object |
| **Modify** | `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift` | Update `onTapPost` callback to pass post object |
| **Modify** | `apps/ios/Meeshy/Features/Main/Navigation/Router.swift:25` | Change `postDetail(String)` to `postDetail(String, FeedPost?)` |

---

## Task 1: Fix Navigation — Route & Back Button

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift:25`
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift:184-186`

- [ ] **Step 1: Update Route enum to carry optional FeedPost**

```swift
// Router.swift line 25 — change:
case postDetail(String)
// to:
case postDetail(String, FeedPost? = nil)
```

Since `FeedPost` must be `Hashable` for `Route`, and `FeedPost` is a struct with `Identifiable`, check if it already conforms. If not, add `Hashable` conformance based on `id` only (since the Route hash just needs identity, not full equality).

- [ ] **Step 2: Verify FeedPost Hashable conformance**

Check `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift`. If `FeedPost` doesn't conform to `Hashable`, add:

```swift
extension FeedPost: Hashable {
    public static func == (lhs: FeedPost, rhs: FeedPost) -> Bool { lhs.id == rhs.id }
    public func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
```

- [ ] **Step 3: Update RootView to pass initialPost and show nav bar**

```swift
// RootView.swift line 184-186 — change:
case .postDetail(let postId):
    PostDetailView(postId: postId)
        .navigationBarHidden(true)
// to:
case .postDetail(let postId, let initialPost):
    PostDetailView(postId: postId, initialPost: initialPost)
```

Remove `.navigationBarHidden(true)` for this case — PostDetailView will manage its own toolbar.

- [ ] **Step 4: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 5: Commit**

```
feat(ios): pass initialPost through Route for instant display
```

---

## Task 2: Fix Tap Gesture Conflict & Pass Post Object

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:17,111-113`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift:286-290`
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift` (ThemedFeedOverlay)
- Modify: `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift`

- [ ] **Step 1: Change `onTapPost` callback signature**

In `FeedPostCard.swift`, change the callback type from `((String) -> Void)?` to `((FeedPost) -> Void)?`:

```swift
// line 20 — change:
var onTapPost: ((String) -> Void)? = nil
// to:
var onTapPost: ((FeedPost) -> Void)? = nil
```

And change the `.onTapGesture` to use `.contentShape` + Button to avoid intercepting child button taps:

```swift
// lines 111-113 — replace:
.onTapGesture {
    onTapPost?(post.id)
}
// with — remove it entirely. Instead, wrap the post content area (not the actions bar or comments)
// in a tap target. This is done by converting the content VStack to use a background Button.
```

The fix for tap conflict: instead of `.onTapGesture` on the entire card, make the **content area** (header + text + media) tappable, and leave the actions bar and comments preview with their own Button handlers.

Concretely, wrap the `VStack(alignment: .leading, spacing: 12)` content (lines 45-94) in a transparent Button:

```swift
// Replace the current content VStack + .onTapGesture with:
Button {
    onTapPost?(post)
} label: {
    VStack(alignment: .leading, spacing: 12) {
        authorHeader
        // post content...
        // media preview...
        // repost view...
    }
    .contentShape(Rectangle())
}
.buttonStyle(.plain)
```

Move the `actionsBar` OUTSIDE this Button so that like/comment/share buttons are independent.

- [ ] **Step 2: Update FeedView.swift callback**

```swift
// FeedView.swift line 286-290 — change:
onTapPost: { postId in
    router.push(.postDetail(postId))
},
onTapRepost: { repostId in
    router.push(.postDetail(repostId))
},
// to:
onTapPost: { post in
    router.push(.postDetail(post.id, post))
},
```

Also update `onTapRepost` — it navigates to a repost by ID. Keep it as `((String) -> Void)?` since we don't have the full FeedPost for the repost.

- [ ] **Step 3: Update ThemedFeedOverlay callback**

```swift
// RootViewComponents.swift — add/update:
onTapPost: { post in
    router.push(.postDetail(post.id, post))
},
```

- [ ] **Step 4: Update BookmarksView callback**

```swift
// BookmarksView.swift — change:
onTapPost: { postId in
    router.push(.postDetail(postId))
},
// to:
onTapPost: { post in
    router.push(.postDetail(post.id, post))
},
```

- [ ] **Step 5: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 6: Commit**

```
fix(ios): pass FeedPost through onTapPost and fix tap gesture conflicts
```

---

## Task 3: Add Reply-To State to PostDetailViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift`

- [ ] **Step 1: Add replyingTo state and sendReply method**

```swift
// Add published property:
@Published var replyingTo: FeedComment? = nil

// Add method:
func sendReply(_ content: String) async {
    guard let post, let parent = replyingTo else { return }
    do {
        let apiComment = try await PostService.shared.addComment(postId: post.id, content: content, parentId: parent.id)
        let comment = FeedComment(
            id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
            authorAvatarURL: apiComment.author.avatar,
            content: apiComment.content, timestamp: apiComment.createdAt,
            likes: 0, replies: 0
        )
        comments.insert(comment, at: 0)
        self.post?.commentCount += 1
        replyingTo = nil
    } catch {
        ToastManager.shared.showError("Erreur lors de l'envoi de la reponse")
    }
}

func clearReply() {
    replyingTo = nil
}
```

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```
feat(ios): add reply-to-comment state in PostDetailViewModel
```

---

## Task 4: Rewrite PostDetailView

**Files:**
- Rewrite: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`

This is the main task. Rewrite the view with these features:

### Header (custom toolbar since .navigationBarHidden varies)
- Custom back button (chevron.left) at top-left
- "Post" title centered
- Ellipsis menu at top-right (report, delete if own post, copy link)

### Post Content
- Author header: MeeshyAvatar + name + timestamp + mood
- Content text with `.textSelection(.enabled)` — native iOS text selection (long press to select, copy, share)
- Translation indicator (from existing code)
- Media preview (existing code, full width)
- Repost embed (full width, using same `repostView` pattern as FeedPostCard but wider)

### Stats Row
- Like count + comment count + share count (horizontal, tappable)

### Actions Bar
- Like, Comment (scroll to composer), Repost, Bookmark, Share

### Comments Section
- Divider
- "Commentaires" header with count
- ForEach of `viewModel.comments` using `CommentRowView`
- Each comment has reply button → sets `viewModel.replyingTo`
- "Charger plus" button at bottom when `viewModel.hasMoreComments`

### Composer (bottom, pinned)
- Reply banner when `viewModel.replyingTo` is set (colored bar + author name + dismiss X)
- `UniversalComposerBar(style: .light, placeholder: "Ajouter un commentaire...", accentColor: post.authorColor, showVoice: false, showLocation: false, showAttachment: false, showEmoji: true, onSend: { text in ... })`
- On send: call `viewModel.sendComment(text)` or `viewModel.sendReply(text)` depending on `replyingTo`

- [ ] **Step 1: Rewrite PostDetailView with all sections**

Complete rewrite — see architecture above. Key points:
- Use `@EnvironmentObject private var router: Router` for back navigation
- Custom toolbar with back button since the NavigationStack toolbar may be hidden by parent
- `UniversalComposerBar` for the composer
- `.textSelection(.enabled)` on post content for native text selection/copy
- Reply banner above composer
- Full-width repost embed

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Test on simulator**

Run: `./apps/ios/meeshy.sh run`
- Tap on a post from the feed → should navigate to PostDetailView with instant display
- Verify back button works
- Verify comments load
- Send a comment → appears instantly
- Tap reply on a comment → reply banner appears, send → reply posted
- Long press on post text → native text selection handles appear, user can select and copy
- If post has a repost → embed takes almost full width

- [ ] **Step 4: Commit**

```
feat(ios): rewrite PostDetailView with UniversalComposerBar, copy, reply-to
```

---

## Task 5: Fix Repost Embed in FeedPostCard (bonus — wider frame)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:240-298`

- [ ] **Step 1: Make repost embed wider**

The current repost view uses `.padding(12)` inside a container that's already padded by the parent VStack's `.padding(16)`. This creates a narrow embed.

```swift
// In repostView(_ repost:), change:
.padding(12)
// to:
.padding(.horizontal, 12)
.padding(.vertical, 10)
.frame(maxWidth: .infinity)
```

Ensure the VStack containing the repost content uses `.frame(maxWidth: .infinity, alignment: .leading)`.

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```
fix(ios): widen repost embed to use full available width
```

---

## Execution Order

1. **Task 1** (Route + back button) — unblocks navigation
2. **Task 2** (tap gesture + post passthrough) — fixes broken tap and instant display
3. **Task 3** (ViewModel reply-to) — unblocks composer reply feature
4. **Task 4** (PostDetailView rewrite) — the main deliverable
5. **Task 5** (FeedPostCard repost width) — polish

Tasks 1-3 are quick pre-requisites. Task 4 is the bulk of the work. Task 5 is independent polish.
