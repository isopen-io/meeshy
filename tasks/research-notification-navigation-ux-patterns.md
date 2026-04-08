# SOTA Research: Notification Navigation to Stories/Posts with Comments & Reactions

**Date**: 2026-04-04
**Purpose**: Document how top social media apps handle notification-to-content navigation for story/post reactions and comments, to inform Meeshy's implementation.

---

## 1. Instagram Stories

### Notification Types
Instagram has TWO distinct interaction systems for stories:
- **Story Replies** (legacy): Private DMs sent in response to a story
- **Story Comments** (launched Sept 2024): Public comments visible to all story viewers

### What Opens When Tapping a Notification

**Story Reply notification** -> Opens the DM chat thread with that user. The story is NOT re-opened. The reply appears as a quoted message in DMs (with a small thumbnail of the story frame). If the story has expired, the DM still shows the reply text but the thumbnail becomes unavailable.

**Story Comment notification** -> Opens the story viewer directly, with comments visible at the bottom of the frame.

### Comment Display Pattern
- Comments sit **at the bottom of the story frame**, above the function controls (send/share buttons)
- The layout is similar to **Instagram Live chat** -- a scrolling overlay at the bottom
- Comments are **inline on the story content itself**, NOT in a separate sheet or modal
- The story **continues to auto-advance its timer** while comments are visible
- Only **mutual followers** can leave comments
- Comments **disappear after 24 hours** with the story (unless saved to Highlights)

### Expired Story Case
- If the story has expired and you tap a **reply notification**, you land in DMs. The story thumbnail shows "Story unavailable"
- If the story has expired and you tap a **comment notification**, Instagram shows a toast/error -- the story is gone, and comments went with it
- Instagram added a **timer icon** on story bubbles about to expire as a "watch before it disappears" nudge

### Key Takeaway
Instagram uses TWO different patterns for the same content type: private replies go to chat, public comments stay on the story viewer. This is the most complex model in the industry.

---

## 2. TikTok

### What Opens When Tapping a Comment Notification
Tapping a comment notification opens the **full-screen video player** with the **comment section sliding up as a bottom modal overlay** covering approximately **75% of the screen**.

### Comment Display Pattern
- The video **continues to play in the background** behind the semi-transparent comment sheet
- The comment sheet slides in **from the bottom** as a modal overlay
- The sheet covers roughly **75% of the video** (leaving the top quarter visible)
- Comments are scrollable within the sheet
- Like counts are positioned to the right for quick scanning
- Creator-liked comments get a special indicator
- Dismissing the comment sheet (swipe down) returns to full-screen video

### Auto-Play Behavior
- Video **keeps playing** while comments are open
- Audio continues
- This is critical to TikTok's engagement model -- you never "leave" the content

### Why This Works
Allowing comments as a modal over content rather than a separate screen reduces friction. Users feel they can quickly peek at comments without commitment. This drives higher comment engagement rates.

### Key Takeaway
TikTok's pattern is the gold standard for "comments over media": bottom sheet overlay, content keeps playing, swipe to dismiss. This is what Gen Z users expect.

---

## 3. Snapchat Stories

### What Opens When Tapping a Story Reply Notification
- **From mutual friends**: Reply appears in the **primary Chat feed** (the main chat list). Tapping opens the chat conversation, NOT the story viewer.
- **From non-friends** (public stories): Reply appears in **Story Management & Notifications** section only (a separate area, not the main chat).

### Reply Mechanism
- To reply to a story: **Swipe up** while viewing a Snap to open a quick-reply text input
- The reply input appears as an **overlay on the story** (story pauses)
- The reply is then sent as a **chat message** to the story poster

### Story Expired Case
- Story replies live in Chat, so they persist even after the story expires
- The reply is a standalone chat message -- no thumbnail or reference to the original story frame

### Key Takeaway
Snapchat treats story replies purely as chat messages. There is NO concept of public comments on stories. The notification always routes to Chat, never to the story viewer.

---

## 4. WhatsApp Status

### What Opens When Tapping a Status Reply Notification
Tapping a status reply notification opens the **1-on-1 chat** with the person who replied. The reply appears as a regular chat message, sometimes with a small quoted reference to the status.

### Reply Mechanism
- While viewing a status: **Swipe up** or tap the reply field at the bottom
- You can reply with text, voice messages, stickers, or emoji reactions
- 8 quick-reaction emojis are available for fast status reactions
- All replies are **private** (only between poster and replier)

### Status Expired Case
- The chat message persists after the status expires
- The quoted status reference may show "Status unavailable" or disappear

### Key Takeaway
WhatsApp follows the same pattern as Snapchat: status reactions/replies are private chat messages. Notification always routes to the chat thread, not back to the status viewer.

---

## 5. YouTube Shorts

### What Opens When Tapping a Comment Notification
Tapping opens the **Shorts player** with the specific Short loaded, and the **comment panel opens automatically** as a bottom sheet.

### Comment Display Pattern
- Comments appear in a **bottom sheet** that slides up from below
- The sheet covers the **lower portion** of the screen (similar to TikTok)
- The video **pauses or continues** depending on the interaction (behavior varies)
- The comment panel has a **scrollable list** of comments
- A bottom text input bar allows quick replies
- Threaded replies are supported

### Default State
- By default, comments are **hidden** on Shorts (behind a tap on the comment icon)
- Many users don't realize comments exist on Shorts because the panel is collapsed by default

### Key Takeaway
YouTube Shorts follows TikTok's model closely: bottom sheet overlay over the video content. The main difference is that the comment panel is more hidden by default.

---

## 6. BeReal

### What Opens When Tapping a RealMoji/Reaction Notification
Tapping a reaction notification opens the **post detail view** showing your BeReal with all RealMoji reactions visible.

### Reaction Display Pattern
- RealMojis (selfie-based emoji reactions) appear **along the bottom** of the BeReal post
- Tapping a RealMoji makes it **larger** (detail view)
- Comments appear **below the post** in a traditional feed-style layout
- There is NO overlay or sheet -- it's a standard **scrollable detail page**

### Key Takeaway
BeReal uses a traditional post-detail pattern. No overlay, no sheet. Content is static (a photo), so there's no need to keep media playing. Simple and effective for photo-based content.

---

## 7. Twitter/X

### What Opens When Tapping a Reply/Quote Notification
Tapping opens the **thread view** -- the original post with all replies shown below in a scrollable feed.

### Reply Display Pattern
- Replies appear in a **threaded list** below the original post
- The original post is pinned at the top
- Reply sorting options: Trending, Recent, Liked (new 2025 feature)
- Full-page navigation -- no overlay, no sheet
- The content is text-based, so there's no media to "keep playing"

### Key Takeaway
Twitter/X uses traditional threaded navigation. Full-page, scroll-based. Appropriate for text-first content but not applicable to media-heavy experiences.

---

## Summary: Navigation Pattern Matrix

| App | Notification Target | Comment Display | Media Keeps Playing? | Sheet Type |
|-----|---------------------|-----------------|---------------------|------------|
| Instagram (Reply) | DM Chat | Inline in chat | N/A (no media in chat) | None |
| Instagram (Comment) | Story Viewer | Bottom overlay (live-chat style) | Yes (timer continues) | Inline overlay |
| TikTok | Video Player | Bottom sheet (~75% screen) | Yes | Modal bottom sheet |
| Snapchat | Chat | Inline in chat | N/A | None |
| WhatsApp | Chat | Inline in chat | N/A | None |
| YouTube Shorts | Shorts Player | Bottom sheet | Varies | Modal bottom sheet |
| BeReal | Post Detail | Below post (scroll) | N/A (photo) | None |
| Twitter/X | Thread View | Below post (scroll) | N/A (text) | None |

---

## Emerging Patterns & User Expectations (2025-2026)

### Pattern 1: "Comments Over Media" (TikTok/YouTube Shorts model)
- **When to use**: Video or time-limited visual content (stories)
- **How**: Bottom sheet overlay, content visible/playing behind
- **User expectation**: "I should be able to read comments without leaving the content"
- **Coverage**: ~75% of screen for comments, top ~25% shows content
- **Dismiss**: Swipe down to close

### Pattern 2: "Chat Redirect" (Snapchat/WhatsApp model)
- **When to use**: Private 1-on-1 reactions to ephemeral content
- **How**: Notification routes to chat thread, story is referenced but not re-opened
- **User expectation**: "Reactions are conversations, not annotations"
- **Best for**: Messaging-first apps where DMs are the primary surface

### Pattern 3: "Inline on Content" (Instagram Stories Comments model)
- **When to use**: Public comments that should feel like live interaction
- **How**: Comments scroll at bottom of content frame (like live streaming chat)
- **User expectation**: "Comments are part of the story experience"
- **Best for**: Ephemeral content where comments enhance the viewing experience

### Pattern 4: "Post Detail" (BeReal/Twitter model)
- **When to use**: Static content (photos, text)
- **How**: Full page navigation to content + comments below
- **User expectation**: Traditional social feed behavior
- **Best for**: Non-ephemeral, scrollable content

---

## iOS Implementation: Bottom Sheet Patterns (2025-2026)

### Native SwiftUI: `.presentationDetents`
```swift
.sheet(isPresented: $showComments) {
    CommentListView()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
}
```

**Pros**:
- Native feel, automatic gesture handling
- `.presentationBackgroundInteraction(.enabled)` lets users interact with content behind the sheet
- Supports multiple detent sizes (half, full, custom fraction)
- iOS 26 Liquid Glass support automatic

**Cons**:
- Sheet covers the entire view hierarchy (including tab bars)
- Limited control over background dimming behavior
- Cannot easily keep video playing while sheet is presented (need `.presentationBackgroundInteraction`)

### Custom DragGesture-based Sheet
```swift
// Custom bottom sheet with DragGesture for fine control
```

**Pros**:
- Full control over positioning, animation, and interaction
- Can keep content fully interactive behind the sheet
- No tab bar coverage issues
- Can implement TikTok-style partial overlay precisely

**Cons**:
- Must handle all gesture conflicts manually
- No automatic keyboard avoidance
- More code to maintain

### Industry Standard (2025-2026)
- **Most social apps use CUSTOM bottom sheets** for comments over media, not native `.sheet`
- Native `.presentationDetents` is used for settings, pickers, and non-media overlays
- The TikTok/Instagram comment overlay is typically a **custom view** with gesture handling, not a SwiftUI `.sheet`
- For the "comments over video" pattern, custom is strongly preferred because:
  1. You need the video to keep playing
  2. You need precise control over the overlay height
  3. You need the comment sheet to not cover navigation/tab bars
  4. You need smooth interruptible animations

### Recommendation for Meeshy
Given Meeshy's story/status feature:
- **For public story comments**: Use the Instagram-style inline overlay (comments at bottom of story frame)
- **For story reply notifications**: Route to the DM/chat thread (like Snapchat/WhatsApp)
- **For reaction notifications**: Open the story viewer with a brief reaction animation, then settle into a comment view
- **Implementation**: Custom bottom sheet (not native `.sheet`) for any overlay over story/media content
- **Expired stories**: Show the notification context in chat. If the story is gone, display a "Story no longer available" state with the comment/reaction text still visible

---

## Decision Points for Meeshy

### Question 1: Where do story reactions/comments live?
- **Option A** (Snapchat/WhatsApp): All reactions route to chat -> Simple, messaging-first
- **Option B** (Instagram dual): Public comments on story + private replies in chat -> Complex, engagement-first
- **Option C** (TikTok): Comments as an overlay on the content -> Engagement-first, content-centric
- **Recommendation**: Option A aligns best with Meeshy's messaging-first identity. Story reactions become conversation starters in DMs.

### Question 2: What to show when tapping a story reaction notification?
- **Option A**: Open the chat with that user (reaction quoted)
- **Option B**: Open the story viewer, then show a reaction overlay
- **Option C**: Open the story viewer with the specific reaction highlighted
- **Recommendation**: If the story is still live, open the story viewer briefly to show context, then transition to the chat. If expired, go directly to chat.

### Question 3: Custom sheet or native `.presentationDetents`?
- **For comments over stories**: Custom sheet (industry standard for media overlay)
- **For non-media interactions** (settings, pickers): Native `.presentationDetents`
- **Reasoning**: Native sheets cover tab bars and don't give enough control for the "content behind sheet" pattern

---

## Sources

- Instagram Story Comments: https://petapixel.com/2024/09/04/instagram-now-lets-you-leave-public-comments-on-stories/
- Instagram Story Comments (TechCrunch): https://techcrunch.com/2024/09/03/instagram-stories-public-comments-feature/
- Instagram Story Comments Design: https://www.socialmediatoday.com/news/instagram-adds-stories-comments-encourage-interaction/725572/
- TikTok vs Instagram Comments UX: https://medium.com/@danielledrislane/tiktok-vs-instagram-comments-ux-analysis-8a43597937d1
- Snapchat Story Replies in Chat: https://help.snapchat.com/hc/en-us/articles/7012279427348
- Snapchat Story Reply How-To: https://help.snapchat.com/hc/en-us/articles/7012366725268
- WhatsApp Status Mentions: https://faq.whatsapp.com/2920968938041709
- BeReal RealMojis: https://help.bereal.com/hc/en-us/articles/7536240858653-RealMojis
- YouTube Shorts Comments: https://support.google.com/youtube/thread/351057117
- SwiftUI presentationDetents: https://sarunw.com/posts/swiftui-bottom-sheet/
- Interactive Bottom Sheets: https://www.createwithswift.com/exploring-interactive-bottom-sheets-in-swiftui/
- iOS 26 Liquid Glass Sheets: https://nilcoalescing.com/blog/PresentingLiquidGlassSheetsInSwiftUI/
- Smashing Magazine Notification UX Guidelines: https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/
