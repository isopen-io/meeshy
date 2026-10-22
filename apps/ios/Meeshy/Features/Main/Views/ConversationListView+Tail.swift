import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Accès rapides (queue de liste / état vide, 2026-08-21)

/// La queue de la liste : les accès rapides, ou l'espace neutre quand le
/// drapeau Lentille est éteint ou que la liste n'est pas encore connue. Elle
/// reçoit la branche vide DÉJÀ résolue par la liste et les trois booléens de
/// feuilles que ses portes ouvrent ; le reste (routeur, stories, corpus) se
/// relit dans l'environnement.
struct ConversationListTail: View {
    let emptyBranch: ConversationListEmptyBranch?
    let listColumnSize: CGSize
    let onNewConversation: (() -> Void)?
    @Binding var showStatusComposer: Bool
    @Binding var showCreateAffiliate: Bool
    @Binding var showCreateTrackingLink: Bool
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var conversationViewModel: ConversationListViewModel
    @Environment(\.routerCommands) private var router

    private var theme: ThemeManager { ThemeManager.shared }

    /// Vue PURE routée vers les portes EXISTANTES : nouveau message
    /// (`onNewConversation`), story (`StoryViewModel.showStoryComposer`),
    /// mood (`MoodComposerDoor`, déjà hébergé ici), post (drapeau `Router
    /// .pendingOpenFeedComposer`, consommé par le flux), invitation
    /// (`AffiliateCreateView`, lien de parrainage), lien raccourci
    /// (`CreateTrackingLinkView`, `/l/<token>`).
    private func quickActions(isEmptyState: Bool, conversationCount: Int, minHeight: CGFloat = 0) -> some View {
        ConversationListQuickActions(
            isDark: theme.mode.isDark,
            isEmptyState: isEmptyState, conversationCount: conversationCount,
            minHeight: minHeight,
            onAction: { action in
                switch action {
                case .findMembers: router.push(.peopleDiscovery(.discover))
                case .myContacts: router.push(.contacts(.contacts))
                case .myAffiliates: router.push(.affiliate)
                case .newMessage: onNewConversation?()
                case .story: storyViewModel.showStoryComposer = true
                case .mood: showStatusComposer = true
                case .post: router.requestFeedComposer()
                case .invite: showCreateAffiliate = true
                case .shortcutLink: showCreateTrackingLink = true
                }
            }
        )
        .equatable()
    }

    /// Hauteur de queue : une DEMI-région visible, pour que la dernière
    /// rangée puisse rejoindre la bande de focus au centre.
    private var listTailMinHeight: CGFloat {
        SceneWindowSize.resolve(listColumnSize, fallback: DeviceLayout.windowSize).height / 2
    }

    @ViewBuilder
    var body: some View {
        // Sous un squelette, la queue attend la liste (#8759) : posée sous
        // lui, elle était repoussée par les rangées réelles.
        if LentilleFeatureFlag.isLentilleListEnabled, ConversationListView.showsQuickActionsTail(emptyBranch: emptyBranch) {
            // UNIQUE montage des accès rapides (2026-09-09). `listTail` vit
            // HORS du `if groupedConversations.isEmpty` : il se rend dans
            // toutes les branches. Le titre suit donc le VIDE plutôt que le
            // site d'appel — « Aucune conversation » à qui démarre, « Et
            // maintenant ? » à qui a fini de lire sa liste.
            quickActions(isEmptyState: conversationViewModel.conversations.isEmpty,
                         conversationCount: conversationViewModel.conversations.count,
                         minHeight: listTailMinHeight)
        } else {
            Color.clear.frame(height: 60)
        }
    }
}
