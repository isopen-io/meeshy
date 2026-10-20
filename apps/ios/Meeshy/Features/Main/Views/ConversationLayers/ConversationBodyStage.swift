import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La scène de la conversation, en type NOMINAL** (LOT-10) — le `ZStack` qui
/// vivait dans `ConversationView.bodyContent`.
///
/// Chaque fente est une closure `() -> T` dont `T` est une struct nominale
/// PETITE : la construction se fait dans le `body` de cette struct, jamais dans
/// le cadre de l'appelant, qui réservait en `-Onone` la place de TOUTES les
/// branches de type opaque. Les valeurs qui gouvernent un `zIndex`, une
/// transition ou une animation arrivent en PRIMITIVES : la scène n'observe rien.
struct ConversationBodyStage<Header: View, Quick: View, Banner: View, Scroll: View, Dock: View, Search: View>: View {

    let showsSkeleton: Bool
    let skeletonBottomInset: CGFloat
    let readingMode: ReadingModeOrchestrator.ConversationReadingMode
    let quickReactionMessageId: String?
    let showsOwnConnectionBanner: Bool
    let error: String?
    let showOptions: Bool
    let hidesComposerChrome: Bool
    let showTextEmojiPicker: Bool
    let hasMentionQuery: Bool
    let onDismissError: () -> Void
    let onLeaveSummary: () -> Void

    let background: () -> ConversationBackgroundLayer
    let reader: () -> ConversationReaderModeBranch
    let list: () -> ConversationMessageListLayer
    @ViewBuilder let header: () -> Header
    @ViewBuilder let quickReaction: (String) -> Quick
    @ViewBuilder let connectionBanner: () -> Banner
    @ViewBuilder let scrollToBottom: () -> Scroll
    @ViewBuilder let dock: () -> Dock
    @ViewBuilder let searchOverlay: () -> Search

    var body: some View {
        ZStack {
            background()
            if showsSkeleton {
                ConversationMessageSkeleton(bottomInset: skeletonBottomInset)
                    .transition(.opacity)
                    .zIndex(1)
            }
            reader()
            list()
            header()
            if let quickReactionMessageId {
                quickReaction(quickReactionMessageId)
                    .zIndex(99)
            }
            if showsOwnConnectionBanner {
                connectionBanner()
                    .inSyncPillBand()
                    .zIndex(98)
                    .allowsHitTesting(false)
            }
            ConversationErrorBanner(error: error, showOptions: showOptions, onDismiss: onDismissError)
                .zIndex(97)
                .animation(.easeInOut, value: error)
            scrollToBottom()
            dock()
                .zIndex(readingMode == .river ? 85 : 50)
                .hiddenTowardsEdge(hidesComposerChrome, .bottom)
                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTextEmojiPicker)
                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: hasMentionQuery)
            searchOverlay()
        }
        .adaptiveOnChange(of: readingMode) { old, new in
            guard old == .summary, new != .summary else { return }
            onLeaveSummary()
        }
    }
}

/// Le mode `.river` et le mode `.summary` routent vers un HÔTE DÉDIÉ, additif
/// au fil. La Rivière est LARGE par nature : elle ne doit jamais élargir la
/// scène (voir `ConversationRiverLayer`). `zIndex(80)` : au-dessus du fil, du
/// composeur et du bouton de retour en bas (≤ 60) et de l'aperçu (49), sous
/// l'en-tête flottant (100). L'identité du Résumé bascule EXACTEMENT une fois,
/// au passage vide → peuplé, pour que l'autoclosure du `@StateObject` de son
/// hôte se réévalue avec les messages.
struct ConversationReaderModeBranch: View {
    let mode: ReadingModeOrchestrator.ConversationReadingMode
    let viewModel: ConversationViewModel
    let conversationId: String?
    let topInset: CGFloat
    let bottomInset: CGFloat
    let isDark: Bool
    let isAnonymous: Bool
    @Binding var scrollState: ConversationScrollState
    @Binding var overlayState: ConversationOverlayState
    let showScript: () -> Void
    let reply: (Message) -> Void
    let openViewOnce: (String) -> Bool
    let openMedia: (MessageAttachment) -> Void

    var body: some View {
        if mode == .river {
            ConversationRiverLayer(
                viewModel: viewModel,
                conversationId: conversationId,
                topInset: topInset,
                bottomInset: bottomInset,
                scrollState: $scrollState,
                overlayState: $overlayState,
                showScript: showScript,
                reply: reply,
                openViewOnce: openViewOnce,
                openMedia: openMedia
            )
            .ignoresSafeArea(edges: .top)
            .zIndex(80)
            .transition(.opacity)
        }
        if mode == .summary {
            ConversationSummaryLayer(
                viewModel: viewModel,
                isDark: isDark,
                isAnonymous: isAnonymous,
                scrollState: $scrollState,
                showScript: showScript,
                reply: reply
            )
            .id(viewModel.messages.isEmpty)
            .zIndex(80)
            .transition(.opacity)
        }
    }
}

/// La bulle « retour en bas » : elle NE suit PAS le repli du défilement (#8002,
/// directive porteur 2026-09-26) — c'est pendant qu'on remonte qu'on la cherche.
/// Seules ses propres entrées et sorties (proximité du bas) la font glisser.
struct ConversationScrollToBottomBranch<Pill: View>: View {
    let isShown: Bool
    let stateStore: ConversationStateStore
    let bottomAnchor: CGFloat
    let isNearBottom: Bool
    let isSearchingQuotedMessage: Bool
    let isInJumpedState: Bool
    @ViewBuilder let button: ([TypingParticipant]) -> Pill

    var body: some View {
        if isShown {
            ConversationTypingRosterHost(store: stateStore) { typing in
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        button(typing)
                            .padding(.trailing, MeeshySpacing.lg)
                            .padding(.bottom, bottomAnchor + MeeshySpacing.sm)
                    }
                }
            }
            .zIndex(60)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isNearBottom)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isSearchingQuotedMessage)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isInJumpedState)
        }
    }
}
