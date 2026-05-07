import SwiftUI
import MeeshySDK

/// Per-message dynamic data resolved at cell-config time. Lives outside the
/// `MessageStore` because the store is per-conversation persistence-only and
/// these fields come from the live `ConversationViewModel`.
struct MessageBubbleData {
    var translations: [MessageTranslation] = []
    var preferredTranslation: MessageTranslation? = nil
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var userLanguages: (regional: String?, custom: String?) = (nil, nil)
    var mentionDisplayNames: [String: String] = [:]
}

struct MessageListView: UIViewControllerRepresentable {
    let store: MessageStore
    let currentUserId: String
    let accentColor: String
    let isDirect: Bool
    /// Vertical clearance reserved at the bottom of the list so the latest
    /// message is never hidden behind the composer/keyboard.
    /// Pass the composer height here.
    var bottomInset: CGFloat = 0
    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the user approaches the older-messages threshold. Wire to
    /// `ConversationViewModel.loadOlderMessages()` so pagination chains cache
    /// then network — bypassing this hook leaves the store stuck on whatever
    /// GRDB already holds.
    var onLoadOlder: (() async -> Void)?
    /// Resolves the dynamic per-message data (translations, transcriptions,
    /// audio translations) at cell-config time. Closure is invoked on main
    /// thread inside `UICollectionView.CellRegistration`. Defaults to empty.
    var resolveBubbleData: (String) -> MessageBubbleData = { _ in MessageBubbleData() }
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @Environment(\.colorScheme) private var colorScheme

    func makeUIViewController(context: Context) -> MessageListViewController {
        let vc = MessageListViewController(
            store: store,
            currentUserId: currentUserId,
            accentColor: accentColor,
            isDirect: isDirect,
            isDark: colorScheme == .dark,
            router: router,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationListViewModel: conversationListViewModel
        )
        vc.onNewMessagesBadge = onNewMessagesBadge
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.resolveBubbleData = resolveBubbleData
        vc.applyBottomInset(bottomInset)
        return vc
    }

    func updateUIViewController(_ vc: MessageListViewController, context: Context) {
        vc.update(isDark: colorScheme == .dark, accentColor: accentColor)
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.resolveBubbleData = resolveBubbleData
        vc.applyBottomInset(bottomInset)
    }
}
