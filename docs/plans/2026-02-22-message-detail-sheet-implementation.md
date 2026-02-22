# Message Detail Sheet & Reactions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic MessageOverlayMenu with a simplified overlay + a modern MessageDetailSheet with navigable tabs (Language, Views, Reactions, React, Report, Delete, Forward, Sentiment, Transcription, Meta).

**Architecture:** Two-level interaction: Level 1 is a simplified long-press overlay (5 emojis + preview + quick actions). Level 2 is a full `.sheet` with all tabs. Backend enrichment adds user details to the reactions endpoint. SDK bug fix for `includesMe`.

**Tech Stack:** SwiftUI (iOS), Fastify/Prisma (gateway), MeeshySDK (Swift SDK)

---

## Task 1: Fix the `includesMe` Bug in SDK

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:152-157`

**Step 1: Fix `toMessage()` to use `currentUserReactions`**

In `MessageModels.swift`, replace lines 152-157. The current code creates `MeeshyReaction` objects without `userId`, making `includesMe` always false. Use `currentUserReactions` (line 81) to mark which reactions belong to the current user:

```swift
let uiReactions: [MeeshyReaction] = {
    guard let summary = reactionSummary else { return [] }
    let myEmojis = Set(currentUserReactions ?? [])
    var myEmojiCounts: [String: Int] = [:]

    return summary.flatMap { emoji, count in
        (0..<count).map { i -> MeeshyReaction in
            let isMyReaction: Bool = {
                guard myEmojis.contains(emoji) else { return false }
                let used = myEmojiCounts[emoji, default: 0]
                if used < 1 {
                    myEmojiCounts[emoji, default: 0] += 1
                    return true
                }
                return false
            }()
            return MeeshyReaction(
                messageId: id,
                userId: isMyReaction ? currentUserId : nil,
                emoji: emoji
            )
        }
    }
}()
```

**Step 2: Verify the fix compiles**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift
git commit -m "fix(sdk): use currentUserReactions to fix includesMe always false"
```

---

## Task 2: Add `currentUserRole` to MeeshyConversation

The delete tab needs to check if the user is admin/moderator. The role exists in `APIConversationMember.role` (ConversationModels.swift:42) but is not mapped into the domain model.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` (MeeshyConversation struct)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift` (toConversation mapping)

**Step 1: Add `currentUserRole` property to `MeeshyConversation`**

In `CoreModels.swift`, find the `MeeshyConversation` struct. Add a new property:

```swift
public var currentUserRole: String?
```

Add it to the `init` as well with default `nil`.

**Step 2: Map role in `toConversation()`**

In `ConversationModels.swift`, find the `toConversation(currentUserId:)` method. After the existing member extraction logic, add:

```swift
let currentRole = members?.first(where: { $0.userId == currentUserId })?.role
```

Pass `currentUserRole: currentRole` to the `MeeshyConversation` init.

**Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift
git commit -m "feat(sdk): add currentUserRole to MeeshyConversation for permission checks"
```

---

## Task 3: Enrich Backend Reactions Endpoint with User Details

**Files:**
- Modify: `services/gateway/src/services/ReactionService.ts:174-250` (getMessageReactions)
- Modify: `services/gateway/src/routes/reactions.ts:344-457` (GET handler)

**Step 1: Add user lookup to `getMessageReactions`**

In `ReactionService.ts`, after aggregating reactions (line 234), add a user lookup step. Collect all unique `userIds` from all aggregations, query the `User` collection for `id`, `username`, `displayName`, `avatar`, then enrich each aggregation with user details.

```typescript
// After line 234: const aggregations = Array.from(aggregationMap.values());

// Collect all unique userIds
const allUserIds = new Set<string>();
aggregations.forEach(a => a.userIds.forEach(uid => allUserIds.add(uid)));

// Fetch user details
const users = allUserIds.size > 0
  ? await this.prisma.user.findMany({
      where: { id: { in: Array.from(allUserIds) } },
      select: { id: true, username: true, displayName: true, avatar: true }
    })
  : [];

const userMap = new Map(users.map(u => [u.id, u]));

// Build enriched reactions with user details
const enrichedReactions = aggregations.map(agg => ({
  ...agg,
  users: agg.userIds.map(uid => {
    const user = userMap.get(uid);
    // Find the reaction's createdAt for this user
    const reaction = reactions.find(r => r.emoji === agg.emoji && r.userId === uid);
    return {
      userId: uid,
      username: user?.displayName ?? user?.username ?? 'Anonymous',
      avatar: user?.avatar ?? null,
      createdAt: reaction?.createdAt?.toISOString() ?? new Date().toISOString()
    };
  })
}));
```

Update the return to use `enrichedReactions` instead of `aggregations`:

```typescript
return {
  messageId,
  reactions: enrichedReactions,
  totalCount: reactions.length,
  userReactions: Array.from(new Set(userReactions))
};
```

**Step 2: Verify gateway compiles and starts**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add services/gateway/src/services/ReactionService.ts
git commit -m "feat(gateway): enrich reactions endpoint with user details (username, avatar, date)"
```

---

## Task 4: Add SDK Models for Enriched Reactions

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`

**Step 1: Add `ReactionDetail` and `ReactionGroup` structs**

Add after the existing `MeeshyReactionSummary` (after line ~497):

```swift
// MARK: - Enriched Reaction Models

public struct ReactionUserDetail: Codable, Identifiable {
    public let userId: String
    public let username: String
    public let avatar: String?
    public let createdAt: Date

    public var id: String { userId }

    public init(userId: String, username: String, avatar: String? = nil, createdAt: Date = Date()) {
        self.userId = userId
        self.username = username
        self.avatar = avatar
        self.createdAt = createdAt
    }
}

public struct ReactionGroup: Codable, Identifiable {
    public let emoji: String
    public let count: Int
    public let users: [ReactionUserDetail]

    public var id: String { emoji }

    public init(emoji: String, count: Int, users: [ReactionUserDetail]) {
        self.emoji = emoji
        self.count = count
        self.users = users
    }
}

public struct ReactionSyncResponse: Codable {
    public let messageId: String
    public let reactions: [ReactionGroup]
    public let totalCount: Int
    public let userReactions: [String]
}
```

**Step 2: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift
git commit -m "feat(sdk): add ReactionUserDetail, ReactionGroup, ReactionSyncResponse models"
```

---

## Task 5: Add `fetchReactionDetails` to ConversationViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

**Step 1: Add reaction detail state and fetch method**

Add new published property near the other state properties:

```swift
@Published var reactionDetails: [ReactionGroup] = []
@Published var isLoadingReactions = false
```

Add the fetch method near `toggleReaction`:

```swift
func fetchReactionDetails(messageId: String) async {
    isLoadingReactions = true
    defer { isLoadingReactions = false }
    do {
        let response: APIResponse<ReactionSyncResponse> = try await APIClient.shared.request(
            endpoint: "/reactions/\(messageId)"
        )
        if response.success, let data = response.data {
            reactionDetails = data.reactions
        }
    } catch {
        reactionDetails = []
    }
}
```

**Step 2: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "feat(ios): add fetchReactionDetails to ConversationViewModel"
```

---

## Task 6: Create EmojiPickerView (embeddable version)

The current `EmojiPickerSheet` is wrapped in `NavigationView` and presented as a sheet. We need an embeddable version without the NavigationView wrapper that can be placed inside a tab.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift`

**Step 1: Extract embeddable EmojiPickerView**

Add a new struct `EmojiPickerView` in the same file (or at the top), that contains the search bar, category tabs, and emoji grid without the `NavigationView` wrapper:

```swift
struct EmojiPickerView: View {
    let recentEmojis: [String]
    let onSelect: (String) -> Void

    @State private var searchText = ""
    @State private var selectedCategory: EmojiGridCategory = .recent
    @AppStorage("frequentEmojis") private var frequentEmojisData: Data = Data()
    @ObservedObject private var theme = ThemeManager.shared

    // Reuse the same internal logic from EmojiPickerSheet
    // (searchResults, categoryEmojis, frequentEmojis, selectEmoji)
    // but without NavigationView, toolbar, presentationDetents

    var body: some View {
        VStack(spacing: 0) {
            // Search bar
            // Category tabs (horizontal scroll)
            // Emoji grid (LazyVGrid 8 columns)
        }
    }
}
```

Refactor `EmojiPickerSheet` to use `EmojiPickerView` internally to avoid code duplication:

```swift
struct EmojiPickerSheet: View {
    let quickReactions: [String]
    let onSelect: (String) -> Void

    var body: some View {
        NavigationView {
            EmojiPickerView(recentEmojis: quickReactions, onSelect: onSelect)
                .navigationTitle("Emojis")
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}
```

**Step 2: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift
git commit -m "refactor(ios): extract EmojiPickerView as embeddable component from EmojiPickerSheet"
```

---

## Task 7: Create MessageDetailSheet

This is the main new component. Create it as a single file with all tab content.

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Step 1: Create the file with the full sheet structure**

```swift
import SwiftUI
import MeeshySDK

// MARK: - DetailTab Enum

enum DetailTab: String, CaseIterable, Identifiable {
    case language, views, reactions, react, report, delete, forward, sentiment, transcription, meta

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .language: return "globe"
        case .views: return "eye.fill"
        case .reactions: return "heart.circle"
        case .react: return "face.smiling"
        case .report: return "exclamationmark.triangle"
        case .delete: return "trash"
        case .forward: return "arrowshape.turn.up.forward"
        case .sentiment: return "brain.head.profile"
        case .transcription: return "waveform"
        case .meta: return "info.circle"
        }
    }

    var label: String {
        switch self {
        case .language: return "Langue"
        case .views: return "Vues"
        case .reactions: return "Reactions"
        case .react: return "Reagir"
        case .report: return "Signaler"
        case .delete: return "Supprimer"
        case .forward: return "Transferer"
        case .sentiment: return "Sentiment"
        case .transcription: return "Transcription"
        case .meta: return "Meta"
        }
    }
}

// MARK: - MessageDetailSheet

struct MessageDetailSheet: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    var initialTab: DetailTab = .language
    var canDelete: Bool = false  // isMe OR admin/moderator

    // Action callbacks
    var onReact: ((String) -> Void)?
    var onReport: ((String, String?) -> Void)?
    var onDelete: (() -> Void)?
    var onForward: ((Conversation) -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTab: DetailTab
    @StateObject private var viewModel: ConversationViewModel  // Or pass it in

    init(/* all params */) {
        // Set _selectedTab = State(initialValue: initialTab)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle
            // Header: avatar + name + date + message preview
            // Tab bar: horizontal scroll of capsules
            // Tab content: scrollable area
        }
        .background(theme.backgroundPrimary)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
```

The sheet contains:

1. **Header section**: Fixed. Shows sender avatar, name, date, and 1-line message preview. Uses glassmorphism `.ultraThinMaterial` background. Copy the pattern from `MessageOverlayMenu.viewsTabContent` (lines 253-309).

2. **Tab bar**: Horizontal `ScrollView` with capsule buttons. Same pattern as `infoTabsSection` (lines 171-248 of MessageOverlayMenu). Filter tabs based on conditions:
   - Remove `.delete` if `!canDelete`
   - Remove `.sentiment` if message has no text
   - Remove `.transcription` if no audio/video attachments

3. **Tab content**: `ScrollView` with `switch selectedTab`. Each case renders the corresponding content:
   - `.language` → move `languageTabContent` from MessageOverlayMenu
   - `.views` → move `viewsTabContent` from MessageOverlayMenu
   - `.reactions` → NEW: `ReactionsTabContent` (see Task 8)
   - `.react` → NEW: `ReactTabContent` with embedded `EmojiPickerView`
   - `.report` → Embed `ReportMessageSheet` content (without NavigationStack)
   - `.delete` → NEW: `DeleteConfirmationContent`
   - `.forward` → Embed `ForwardPickerSheet` content (without NavigationStack)
   - `.sentiment` → move `sentimentTabContent` from MessageOverlayMenu
   - `.transcription` → move `transcriptionTabContent` from MessageOverlayMenu
   - `.meta` → move `metaTabContent` from MessageOverlayMenu

**Step 2: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (may need multiple iterations to fix imports/types)

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "feat(ios): create MessageDetailSheet with navigable tabs"
```

---

## Task 8: Implement Reactions Tab Content with Sub-tabs

Inside `MessageDetailSheet`, implement the reactions tab with sub-tab filtering.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Step 1: Add the ReactionsTabContent view**

```swift
private struct ReactionsTabContent: View {
    let reactionGroups: [ReactionGroup]
    let isLoading: Bool

    @State private var selectedFilter: String = "all"  // "all" or an emoji string
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        VStack(spacing: 12) {
            // Sub-tab filter bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    // "Toutes" tab
                    filterCapsule(label: "Toutes", count: totalCount, isSelected: selectedFilter == "all") {
                        selectedFilter = "all"
                    }

                    // Per-emoji tabs
                    ForEach(reactionGroups) { group in
                        filterCapsule(label: group.emoji, count: group.count, isSelected: selectedFilter == group.emoji) {
                            selectedFilter = group.emoji
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            // User list
            if isLoading {
                ProgressView()
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredUsers) { item in
                        reactionUserRow(item)
                    }
                }
            }
        }
    }

    // filteredUsers: if "all", flatten all groups with emoji; if specific emoji, show that group's users
    // reactionUserRow: avatar + username + emoji (if "all") + relative date
    // filterCapsule: capsule button with label + count badge
}
```

**Step 2: Wire fetchReactionDetails on tab selection**

In `MessageDetailSheet`, when `selectedTab` changes to `.reactions`:

```swift
.onChange(of: selectedTab) { _, newTab in
    if newTab == .reactions {
        Task { await viewModel.fetchReactionDetails(messageId: message.id) }
    }
}
.onAppear {
    if selectedTab == .reactions {
        Task { await viewModel.fetchReactionDetails(messageId: message.id) }
    }
}
```

**Step 3: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "feat(ios): add ReactionsTabContent with sub-tab filtering (all/per-emoji)"
```

---

## Task 9: Implement React, Delete, Report, Forward Tab Content

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`

**Step 1: ReactTabContent**

```swift
// Top: 5 most recent emojis (large, from EmojiUsageTracker)
// Bottom: Embedded EmojiPickerView
// On select: call onReact(emoji) + dismiss
```

**Step 2: DeleteConfirmationContent**

```swift
// Centered: animated trash icon
// Text: "Supprimer ce message ?"
// Subtitle: "Cette action est irreversible"
// Two buttons: Annuler (secondary) / Supprimer (red, destructive)
```

**Step 3: Embedded ReportContent**

Extract the body content of `ReportMessageSheet` (the ForEach of `ReportType`, the details TextField, submit button) into a reusable view. Keep `ReportMessageSheet` as a wrapper that uses this internal view.

**Step 4: Embedded ForwardContent**

Extract the body content of `ForwardPickerSheet` (search, conversation list, send buttons) into a reusable view. Keep `ForwardPickerSheet` as a wrapper.

**Step 5: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift apps/ios/Meeshy/Features/Main/Components/ReportMessageSheet.swift apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift
git commit -m "feat(ios): add React, Delete, Report, Forward tab content to MessageDetailSheet"
```

---

## Task 10: Simplify MessageOverlayMenu

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`

**Step 1: Reduce emoji bar to 5**

Change `allQuickEmojis` (line 33-38) to only 5 emojis. Or better: use `EmojiUsageTracker.sortedEmojis(from:)` and take `.prefix(5)`.

**Step 2: Remove `infoTabsSection`**

Delete the entire `infoTabsSection` method (lines 151-248), the `InfoTab` enum (lines 1151-1175), and the tab content methods (viewsTabContent, transcriptionTabContent, languageTabContent, sentimentTabContent, metaTabContent — lines 252-585).

Remove `selectedInfoTab` state (line 28).

**Step 3: Simplify the bottom action menu**

Replace the 3-column action grid with a single horizontal row of capsule buttons: Reply, Copy, Pin. Remove Forward, Delete, Report, Info, Edit from the overlay actions (they're now in the sheet).

**Step 4: Update the body layout**

The body becomes:
```
VStack {
    quickViewArea(5 emojis + (+) button)  // TOP
    Spacer
    messagePreview  // CENTER
    Spacer
    quickActionRow (Reply, Copy, Pin)  // BOTTOM - horizontal capsules
}
```

**Step 5: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift
git commit -m "refactor(ios): simplify MessageOverlayMenu to 5 emojis + preview + quick actions"
```

---

## Task 11: Wire Up Sheet Presentation in ConversationView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

**Step 1: Add sheet state to ConversationView**

Add new state properties (near lines 63-78):

```swift
@State var showMessageDetailSheet = false
@State var detailSheetMessage: Message? = nil
@State var detailSheetInitialTab: DetailTab = .language
```

**Step 2: Add the sheet modifier**

Near the existing sheet modifiers (lines 283-333), add:

```swift
.sheet(isPresented: $showMessageDetailSheet) {
    if let msg = detailSheetMessage {
        MessageDetailSheet(
            message: msg,
            contactColor: viewModel.conversation?.accentColor ?? "#FF2E63",
            conversationId: viewModel.conversationId,
            initialTab: detailSheetInitialTab,
            canDelete: msg.isMe || isCurrentUserAdminOrMod,
            onReact: { emoji in viewModel.toggleReaction(messageId: msg.id, emoji: emoji) },
            onReport: { type, reason in viewModel.reportMessage(messageId: msg.id, type: type, reason: reason) },
            onDelete: { viewModel.deleteMessage(messageId: msg.id) },
            onForward: { conv in /* forward logic */ }
        )
    }
}
```

Add computed property:

```swift
private var isCurrentUserAdminOrMod: Bool {
    let role = viewModel.conversation?.currentUserRole?.uppercased() ?? ""
    return ["ADMIN", "MODERATOR", "BIGBOSS"].contains(role)
}
```

**Step 3: Update overlay callbacks**

In `overlayMenuContent` (lines 571-589), change `onAddReaction` to open the detail sheet:

```swift
onAddReaction: {
    detailSheetMessage = msg
    detailSheetInitialTab = .react
    showMessageDetailSheet = true
}
```

**Step 4: Add long deep press gesture**

In `ConversationView+MessageRow.swift`, add a second gesture for deep press (longer duration) that opens the sheet directly:

```swift
.onLongPressGesture(minimumDuration: 1.0) {
    detailSheetMessage = msg
    detailSheetInitialTab = .language
    showMessageDetailSheet = true
    HapticFeedback.medium()
} minimumDuration: 0.5 {  // The regular long press
    // existing overlay logic
}
```

Note: SwiftUI doesn't support two `onLongPressGesture` easily. Use a `simultaneousGesture` with `LongPressGesture(minimumDuration: 1.0)` for deep press, and keep the existing 0.5s for regular overlay.

**Step 5: Update ThemedMessageBubble reaction pills tap**

In `ThemedMessageBubble.swift`, make tapping on reaction pills open the detail sheet on `.reactions` tab. Add a new callback:

```swift
var onShowReactions: ((String) -> Void)? = nil  // receives messageId
```

Add tap gesture on the reaction pills (around line 606-648):

```swift
.onTapGesture {
    onShowReactions?(message.id)
}
```

Wire it in `ConversationView+MessageRow.swift`:

```swift
onShowReactions: { messageId in
    detailSheetMessage = msg
    detailSheetInitialTab = .reactions
    showMessageDetailSheet = true
}
```

**Step 6: Remove old separate sheets**

Remove the old `showEmojiPickerSheet`, `showReportSheet`, `showMessageInfoSheet` sheet modifiers from ConversationView since they're now consolidated in `MessageDetailSheet`. Update any remaining references.

**Step 7: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat(ios): wire MessageDetailSheet with all entry points (overlay, deep press, reaction pills)"
```

---

## Task 12: Add Xcode Project Reference

**Files:**
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj`

**Step 1: Verify the new file is picked up**

If using Xcode's file system references (not manual PBX entries), the new `MessageDetailSheet.swift` should be auto-discovered. If not, open the project in Xcode and add the file to the target, or add the PBX entry manually.

**Step 2: Full build + test on simulator**

Run: `./apps/ios/meeshy.sh run`

Test the following flows:
1. Long press a message → simplified overlay (5 emojis + preview + Reply/Copy/Pin)
2. Tap (+) in overlay → sheet opens on "Reagir" tab
3. Long deep press a message → sheet opens on "Langue" tab
4. Tap reaction pill on bubble → sheet opens on "Reactions" tab
5. In Reactions tab, verify sub-tabs (Toutes, per-emoji)
6. In Reagir tab, select emoji → reaction applied, sheet dismisses
7. In Signaler tab, submit report
8. In Supprimer tab, confirm deletion
9. In Transferer tab, search and forward

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(ios): complete MessageDetailSheet integration with all flows verified"
```

---

## Summary of All Files

| File | Action | Task |
|------|--------|------|
| `packages/MeeshySDK/.../MessageModels.swift` | Fix toMessage() includesMe bug | 1 |
| `packages/MeeshySDK/.../CoreModels.swift` | Add currentUserRole, ReactionGroup models | 2, 4 |
| `packages/MeeshySDK/.../ConversationModels.swift` | Map role in toConversation() | 2 |
| `services/gateway/.../ReactionService.ts` | Enrich with user details | 3 |
| `apps/ios/.../ConversationViewModel.swift` | Add fetchReactionDetails | 5 |
| `apps/ios/.../EmojiPickerSheet.swift` | Extract EmojiPickerView | 6 |
| `apps/ios/.../MessageDetailSheet.swift` | CREATE: Full sheet with all tabs | 7, 8, 9 |
| `apps/ios/.../MessageOverlayMenu.swift` | Simplify to 5 emojis + quick actions | 10 |
| `apps/ios/.../ConversationView.swift` | Wire sheet state + remove old sheets | 11 |
| `apps/ios/.../ConversationView+MessageRow.swift` | Deep press + reaction callbacks | 11 |
| `apps/ios/.../ThemedMessageBubble.swift` | Add onShowReactions callback | 11 |
| `apps/ios/.../ReportMessageSheet.swift` | Extract body content as reusable view | 9 |
| `apps/ios/.../ForwardPickerSheet.swift` | Extract body content as reusable view | 9 |
