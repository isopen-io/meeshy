import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La section Messages sous les conversations filtrées (#14619)

/// Montée sous la liste, elle observe le modèle que la liste PORTE sans le
/// lire (`ConversationListViewModel.messageSearchModel`) : une frappe ne
/// ré-évalue qu'elle. Hors recherche, elle ne rend rien.
struct ConversationListMessageSearchSection: View {
    @ObservedObject var model: ConversationListMessageSearchModel
    let conversations: () -> [Conversation]
    @Environment(\.routerCommands) private var router
    @Environment(\.colorScheme) private var colorScheme

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if model.showsSection {
            LazyVStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(String(localized: "tab.messages", defaultValue: "Messages"))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .textCase(.uppercase)
                    .padding(.top, MeeshySpacing.md)
                    .accessibilityAddTraits(.isHeader)

                if model.results.isEmpty {
                    SkeletonConversationRow()
                    SkeletonConversationRow()
                } else {
                    ForEach(model.results) { result in
                        Button { open(result) } label: {
                            MessageSearchResultRow(result: result, highlightedQuery: model.query, isDark: colorScheme == .dark)
                                .equatable()
                        }
                        .buttonStyle(MeeshyPointerButtonStyle())
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .transition(.opacity)
        }
    }

    /// Le toucher ouvre la conversation SUR le message : surligné, défilé
    /// jusqu'à lui. Une conversation hors de la page chargée se relit par
    /// son identifiant ; le verrou PIN reste à la porte du routeur.
    private func open(_ result: GlobalSearchMessageResult) {
        HapticFeedback.light()
        if let conversation = conversations().first(where: { $0.id == result.conversationId }) {
            router.navigateToConversation(conversation, highlightMessageId: result.id)
            return
        }
        Task { @MainActor in
            guard let api = try? await ConversationService.shared.getById(result.conversationId) else {
                FeedbackToastManager.shared.showError(String(localized: "deeplink.conversation.error", defaultValue: "Impossible d'ouvrir la conversation"))
                return
            }
            let conversation = api.toConversation(currentUserId: AuthManager.shared.currentUser?.id ?? "")
            router.navigateToConversation(conversation, highlightMessageId: result.id)
        }
    }
}

// MARK: - « Aucun résultat », seulement s'il n'y a rien du tout

/// La recherche ne trouve aucune CONVERSATION : l'état vide ne dit « Aucun
/// résultat » que si aucun MESSAGE ne répond non plus — sinon il contredirait
/// la section qui les liste juste en dessous.
struct ConversationSearchNoResultsGate<Content: View>: View {
    @ObservedObject var model: ConversationListMessageSearchModel
    @ViewBuilder let content: () -> Content

    var body: some View {
        if !model.showsSection { content() }
    }
}
