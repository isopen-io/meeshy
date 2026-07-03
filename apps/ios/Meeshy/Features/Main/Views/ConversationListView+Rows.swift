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
    let onLoadPreview: () async -> Void
    /// Appui long → overlay de menu custom (dessine ses icônes ; le
    /// `.contextMenu` natif ne les affiche pas sur iOS 26).
    let onLongPress: () -> Void

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
            .contentShape(Rectangle())
            .onTapGesture {
                HapticFeedback.light()
                onTap()
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(String(localized: "conversation.row.hint", bundle: .main))
            // Le menu custom n'est plus un `.contextMenu` natif (auto-exposé
            // à VoiceOver) : cette action de rotor reste le seul accès non-visuel
            // à épingler/sourdine/archiver/verrouiller depuis la ligne.
            .accessibilityAction(named: String(
                localized: "conversation.row.menu_action",
                defaultValue: "Ouvrir le menu",
                bundle: .main
            )) {
                onLongPress()
            }
            // Appui long → overlay custom (icônes garanties iOS 26). Le
            // drag-to-reorder natif (`.onDrag`) a été retiré : il installe une
            // UIDragInteraction UIKit qui capte le long-press système et
            // empêchait la gesture SwiftUI d'ouvrir le menu (le `.contextMenu`
            // natif, lui, se coordonnait avec `.onDrag`). Le déplacement reste
            // accessible via « Déplacer vers » dans le menu.
            //
            // AUCUN DragGesture custom ici — jamais. Un `highPriorityGesture(
            // DragGesture())` plein-ligne (régression ff5d5649) capturait le
            // pan vertical du ScrollView parent et figeait le scroll de la
            // liste sous le doigt. Le LongPressGesture (distance max 10 pt)
            // s'annule de lui-même dès que le scroll démarre : le pan reste
            // la propriété exclusive du ScrollView. Le geste « replier
            // l'aperçu » vit dans l'overlay du menu (+Overlays), hors de tout
            // contexte scrollable.
            .modifier(RowPressBounceModifier(onTrigger: onLongPress))
            .task {
                await onLoadPreview()
            }
        }
    }
}

// MARK: - Press feedback (réduction pendant l'appui + rebond au trigger)

/// Feedback d'appui de la ligne : réduction à 0.90 dès le toucher (easeOut
/// ≈ 0.2 s), puis rebond élastique visible quand le long-press aboutit à
/// 0.4 s — le spring peu amorti (0.25) donne ≈ 1.05 à ~0.6 s, ≈ 0.98 à
/// ~0.9 s, repos à ~1.5 s, pendant que l'overlay preview jaillit (zoom
/// 0.7 → 1.0, +Overlays). Relâcher (ou scroller > 10 pt) avant les 0.4 s
/// ANNULE : `onPressingChanged(false)` arrive à l'échec du geste et la
/// ligne remonte élastiquement, sans ouvrir le menu.
///
/// `onPressingChanged` (et PAS `LongPressGesture.updating`) : le callback
/// `updating`/@GestureState ne fire qu'à la RECONNAISSANCE du long-press,
/// pas au touch-down (vérifié frame par frame sur simulateur 2026-07-03 —
/// aucune réduction pendant l'appui) ; `onPressingChanged(true)` arrive,
/// lui, dès le toucher. Le @State vit dans ce ViewModifier, PAS dans
/// `ConversationRowItem` : une View conformée manuellement à Equatable avec
/// du state interne perd ses invalidations @State sur iOS 18+ (footgun
/// BubbleExpandableText). Le modifier est un nœud enfant du gate
/// `.equatable()` — son state s'invalide indépendamment, comme le drag
/// interne de `SwipeableRow`.
private struct RowPressBounceModifier: ViewModifier {
    let onTrigger: () -> Void

    @State private var isPressing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPressing ? 0.90 : 1.0)
            .animation(
                isPressing
                    ? .easeOut(duration: 0.18)
                    : .spring(response: 0.55, dampingFraction: 0.25),
                value: isPressing
            )
            .onLongPressGesture(minimumDuration: 0.4, maximumDistance: 10) {
                HapticFeedback.medium()
                onTrigger()
            } onPressingChanged: { pressing in
                isPressing = pressing
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
