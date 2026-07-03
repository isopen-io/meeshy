import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ConversationListView row & pagination components
//
// Dedicated View structs extracted from ConversationListView so the deeply
// nested per-row and pagination subtrees no longer compose into
// ConversationListView.body's opaque type. That monolithic type exceeded the
// Swift type-checker budget and triggered a type-metadata instantiation crash
// at launch on low-memory devices (iPhone XR / iOS 17.6). Nominal structs (vs
// AnyView) break the type while preserving SwiftUI structural identity, so
// per-row diffing and the inner ThemedConversationRow `.equatable()`
// short-circuit keep working.

// MARK: - Conversation Row Item

/// One conversation row: swipe actions + tappable themed row + context menu
/// + hard-press preview. Extracted from `ConversationListView.conversationRow`.
/// All inputs are plain values / closures so the row re-evaluates only when
/// its own inputs change, not on every ConversationListView body pass.
struct ConversationRowItem: View {
    let conversation: Conversation
    let community: MeeshyCommunity?
    let rowWidth: CGFloat
    let isDragging: Bool
    let presenceState: PresenceState
    let isDark: Bool
    let storyRingState: StoryRingState
    let moodStatus: StatusEntry?
    let typingUsername: String?
    let isSelected: Bool
    let draftSummary: DraftSummary?
    /// B1 (Prisme Linguistique) — viewer preferred languages used to
    /// resolve the last-message preview translation. Passed once from
    /// the list (`AuthManager.currentUser?.preferredContentLanguages`)
    /// instead of read per-row to keep the row equatable.
    let preferredContentLanguages: [String]
    let cachedPreviewMessages: [Message]
    let leadingActions: [SwipeAction]
    let trailingActions: [SwipeAction]
    let onViewStory: () -> Void
    let onViewProfile: () -> Void
    let onViewConversationInfo: () -> Void
    let onMoodBadgeTap: (CGPoint) -> Void
    let onCreateShareLink: (() -> Void)?
    let onTap: () -> Void
    let onDragStart: () -> Void
    let onLoadPreview: () async -> Void
    /// Appui long → overlay de menu custom (dessine ses icônes ; le
    /// `.contextMenu` natif ne les affiche pas sur iOS 26).
    let onLongPress: () -> Void
    /// Menu is dismissed → parent calls this to reset row press state
    let onMenuDismissed: (() -> Void)?

    @State private var isPressed = false

    var body: some View {
        SwipeableRow(
            leadingActions: leadingActions,
            trailingActions: trailingActions
        ) {
            ThemedConversationRow(
                conversation: conversation,
                community: community,
                availableWidth: rowWidth,
                isDragging: isDragging,
                presenceState: presenceState,
                onViewStory: onViewStory,
                onViewProfile: onViewProfile,
                onViewConversationInfo: onViewConversationInfo,
                onMoodBadgeTap: onMoodBadgeTap,
                onCreateShareLink: onCreateShareLink,
                isDark: isDark,
                storyRingState: storyRingState,
                moodStatus: moodStatus,
                typingUsername: typingUsername,
                isSelected: isSelected,
                draftSummary: draftSummary,
                preferredContentLanguages: preferredContentLanguages
            )
            .equatable()
            .scaleEffect(isPressed ? 0.90 : 1.0)
            .contentShape(Rectangle())
            .onTapGesture {
                HapticFeedback.light()
                onTap()
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(String(localized: "conversation.row.hint", bundle: .main))
            // Appui long → overlay custom (icônes garanties iOS 26). Le
            // drag-to-reorder natif (`.onDrag`) a été retiré : il installe une
            // UIDragInteraction UIKit qui capte le long-press système et
            // empêchait la gesture SwiftUI d'ouvrir le menu (le `.contextMenu`
            // natif, lui, se coordonnait avec `.onDrag`). Le déplacement reste
            // accessible via « Déplacer vers » dans le menu.
            .onLongPressGesture(minimumDuration: 0.4) {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                    isPressed = true
                }
                HapticFeedback.medium()
                onLongPress()
            }
            .task {
                await onLoadPreview()
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.7), value: isPressed)
        }
    }
}

// MARK: - Equatable re-render gate (list rows)
//
// `ConversationRowItem` carries NO @State (every property is a `let` value or a
// stable closure), so it is a clean `.equatable()` candidate — unlike the
// bubble it has none of the iOS 18+ EquatableView-vs-@State footgun. Without
// this gate the row re-evaluated on every `ConversationListView` body pass and
// rebuilt its `SwipeableRow` wrapper + `.contextMenu` + `preview:` subtree
// (device Allocations trace 2026-06-10: ~800k `TypedElement<…ButtonStyle…>`
// allocations). The `==` MIRRORS `ThemedConversationRow.==` field-for-field
// (so the visible content is never under-compared — `renderFingerprint` folds
// every render-affecting conversation field) and adds the SwipeableRow geometry
// (action counts) + the share-link affordance toggle. Closures are assumed
// stable (they capture `conversation`, which is compared); the context-menu /
// preview closures are long-press-only, so minor staleness there is acceptable.
extension ConversationRowItem: @MainActor Equatable {
    static func == (lhs: ConversationRowItem, rhs: ConversationRowItem) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
        lhs.community?.id == rhs.community?.id &&
        lhs.rowWidth == rhs.rowWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.presenceState == rhs.presenceState &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.typingUsername == rhs.typingUsername &&
        lhs.isSelected == rhs.isSelected &&
        lhs.draftSummary == rhs.draftSummary &&
        lhs.preferredContentLanguages == rhs.preferredContentLanguages &&
        // Compare swipe action ICONS, not just `.count`: the lock/block toggles
        // (`leadingSwipeActions`/`trailingSwipeActions`) read live state from
        // `ConversationLockManager` / `BlockService` — singletons NOT folded into
        // `renderFingerprint`. Counting alone would freeze a stale "Unblock" /
        // "Unlock" action behind the equatable gate (the icon encodes the state:
        // hand.raised.fill ⇄ hand.raised.slash.fill, lock.fill ⇄ lock.open.fill).
        // The list now observes both singletons (see ConversationListView) so a
        // change re-evaluates the rows and this comparison detects it. Zip avoids
        // allocating arrays in `==`.
        lhs.leadingActions.count == rhs.leadingActions.count &&
        lhs.trailingActions.count == rhs.trailingActions.count &&
        zip(lhs.leadingActions, rhs.leadingActions).allSatisfy { $0.icon == $1.icon } &&
        zip(lhs.trailingActions, rhs.trailingActions).allSatisfy { $0.icon == $1.icon } &&
        (lhs.onCreateShareLink == nil) == (rhs.onCreateShareLink == nil) &&
        lhs.cachedPreviewMessages.count == rhs.cachedPreviewMessages.count
    }
}

// MARK: - Pagination Footer

/// Cursor-based infinite-scroll footer driven by `paginationState`.
/// Extracted from `ConversationListView.paginationFooter`. Rendered once at
/// the tail of the list, so it reads the view model directly rather than
/// taking a dozen primitive inputs.
struct ConversationPaginationFooter: View {
    @EnvironmentObject var conversationViewModel: ConversationListViewModel

    var body: some View {
        switch conversationViewModel.paginationState {
        case .loadingMore:
            HStack {
                Spacer()
                ProgressView()
                    .tint(MeeshyColors.indigo400)
                Spacer()
            }
            .padding(.vertical, 16)
        case .exhausted:
            // Show the "all loaded" hint only on lists that actually
            // had to paginate -- avoids cluttering empty/small lists.
            if conversationViewModel.conversations.count > 30 {
                Text(String(
                    localized: "conversations.pagination.allLoaded",

                ))
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }
        case .error:
            VStack(spacing: 6) {
                Text(String(
                    localized: "conversations.pagination.errorTitle",

                ))
                .font(.caption)
                .foregroundStyle(.secondary)
                Button {
                    Task { await conversationViewModel.loadMore() }
                } label: {
                    Text(String(
                        localized: "conversations.pagination.retry",

                    ))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(MeeshyColors.indigo400)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        case .idle:
            // Invisible sentinel: when the user scrolls deep enough to
            // reveal this row, fire `loadMore`. The ViewModel guards
            // against re-entry and short-circuits when hasMore=false.
            if conversationViewModel.hasMore {
                Color.clear
                    .frame(height: 1)
                    .onAppear {
                        Task { await conversationViewModel.loadMore() }
                    }
            }
        }
    }
}
