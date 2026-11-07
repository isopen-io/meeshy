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
                    if model.canLoadMore { nextPageSentinel }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .transition(.opacity)
        }
    }

    /// Paraître au bas de la section demande la page suivante. Chaque curseur
    /// fait naître un NOUVEAU témoin, sans quoi `.task(id:)` partirait pour le
    /// témoin qu'une page pleine vient de pousser hors de l'écran : requête
    /// annulée aussitôt, mesuré au simulateur. Né à l'écran après une page
    /// courte, il enchaîne ; un échec attend le prochain défilement.
    private var nextPageSentinel: some View {
        ZStack {
            if model.isLoadingMore { ProgressView() }
        }
        .frame(maxWidth: .infinity, minHeight: MeeshySpacing.xxl)
        .task { await model.loadMore() }
        .id(model.nextCursor)
    }

    private func open(_ result: GlobalSearchMessageResult) {
        HapticFeedback.light()
        Task { @MainActor in
            await MessageSearchResultOpener.open(result, among: conversations(), router: router)
        }
    }
}

// MARK: - Toucher un message trouvé

/// La porte UNIQUE d'un message trouvé, de la liste comme de la recherche
/// générale : le toucher ouvre la conversation SUR le message, surligné et
/// défilé jusqu'à lui. Une conversation hors de la page chargée se relit par
/// son identifiant ; le verrou PIN reste à la porte du routeur.
@MainActor
enum MessageSearchResultOpener {
    static func open(
        _ result: GlobalSearchMessageResult,
        among conversations: [Conversation],
        fetch: (String) async -> Conversation?,
        navigate: (Conversation, String) -> Void,
        failed: () -> Void
    ) async {
        let known = conversations.first { $0.id == result.conversationId }
        guard let conversation = await resolved(known, fetch: fetch, id: result.conversationId) else {
            failed()
            return
        }
        navigate(conversation, result.id)
    }

    static func open(_ result: GlobalSearchMessageResult, among conversations: [Conversation], router: RouterCommands) async {
        await open(
            result,
            among: conversations,
            fetch: { id in
                guard let api = try? await ConversationService.shared.getById(id) else { return nil }
                return api.toConversation(currentUserId: AuthManager.shared.currentUser?.id ?? "")
            },
            navigate: { router.navigateToConversation($0, highlightMessageId: $1) },
            failed: {
                FeedbackToastManager.shared.showError(String(localized: "deeplink.conversation.error", defaultValue: "Impossible d'ouvrir la conversation"))
            }
        )
    }

    private static func resolved(
        _ known: Conversation?,
        fetch: (String) async -> Conversation?,
        id: String
    ) async -> Conversation? {
        if let known { return known }
        return await fetch(id)
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
