#if DEBUG
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Aperçu DEBUG des cartes de lien de conversation**, sans compte ni réseau —
/// pour vérifier au simulateur chaque état de la carte, dans chaque langue et
/// chaque thème, sans toucher une vraie conversation (#8726).
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyConversationCardPreview YES \
///     -MeeshyConversationCardPreviewJoin fail -AppleLanguages "(en)"
/// ```
///
/// `-MeeshyConversationCardPreviewJoin fail|succeed` : ce que répond la jonction
/// « Mon compte » après 1,5 s (défaut : `fail`, pour dessiner l'erreur). Aucun
/// geste ne quitte l'aperçu : ni réseau, ni session invitée, ni navigation.
enum ConversationLinkCardPreviewLaunch {
    static let argument = "-MeeshyConversationCardPreview"

    static var isActive: Bool {
        ProcessInfo.processInfo.arguments.contains(argument)
    }

    static var joinSucceeds: Bool {
        UserDefaults.standard.string(forKey: "MeeshyConversationCardPreviewJoin") == "succeed"
    }
}

struct ConversationLinkCardPreviewScreen: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let isDark = colorScheme == .dark
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                ForEach(PreviewCase.allCases, id: \.self) { item in
                    ConversationLinkCard(
                        target: item.target,
                        urlString: "https://meeshy.me/join/\(item.identifier)",
                        fallbackAccent: "6366F1",
                        isDark: isDark,
                        model: ConversationLinkCardViewModel(
                            target: item.target,
                            service: PreviewCardService(resolution: .card(item.card)),
                            performer: PreviewCardActions(succeeds: ConversationLinkCardPreviewLaunch.joinSucceeds)
                        )
                    )
                    .frame(maxWidth: 300, alignment: .leading)
                }
            }
            .padding(MeeshySpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background((isDark ? MeeshyColors.indigo950 : MeeshyColors.indigo50).ignoresSafeArea())
        .accessibilityIdentifier("conversation-link-card-preview")
    }

    enum PreviewCase: CaseIterable {
        case guestFriendly
        case accountOnly
        case member

        var identifier: String {
            switch self {
            case .guestFriendly: return "mshy_club"
            case .accountOnly: return "mshy_team"
            case .member: return "mshy_family"
            }
        }

        var target: ConversationCardTarget { .shareLink(identifier: identifier) }

        var card: ConversationCard {
            let isMember = self == .member
            return ConversationCard(
                kind: .shareLink,
                conversationId: isMember ? "c-family" : nil,
                title: title,
                description: "Un espace pour échanger en plusieurs langues.",
                avatarUrl: nil, bannerUrl: nil, conversationType: "group",
                stats: ConversationCardStats(memberCount: 12, messageCount: isMember ? 340 : nil, languages: ["fr", "en", "es"]),
                viewer: ConversationCardViewer(isMember: isMember, canJoin: !isMember,
                                               requiresAccount: self == .accountOnly,
                                               canJoinAnonymously: self == .guestFriendly),
                link: ConversationCardLink(identifier: identifier, isActive: true, expiresAt: nil),
                inviter: ConversationCardInviter(displayName: "Awa", username: "awa", avatarUrl: nil)
            )
        }

        private var title: String {
            switch self {
            case .guestFriendly: return "Club des polyglottes"
            case .accountOnly: return "Équipe produit"
            case .member: return "Famille"
            }
        }
    }
}

private struct PreviewCardService: ConversationCardServiceProviding {
    let resolution: ConversationCardResolution

    func cached(_ target: ConversationCardTarget) -> CacheResult<ConversationCardResolution> {
        .fresh(resolution, age: 0)
    }
    func refresh(_ target: ConversationCardTarget) async -> ConversationCardResolution { resolution }
    func store(_ resolution: ConversationCardResolution, for target: ConversationCardTarget) {}
    func invalidate(_ target: ConversationCardTarget) {}
    func invalidate(conversationId: String, from origin: ConversationCardTarget) {}
}

private struct PreviewCardActions: ConversationCardActionPerforming {
    let succeeds: Bool

    func join(identifier: String) async throws -> String {
        try await Task.sleep(nanoseconds: 1_500_000_000)
        guard succeeds else { throw MeeshyError.server(statusCode: 410, message: "inactive") }
        return "c-\(identifier)"
    }
    func joinAnonymously(identifier: String) {}
    func leave(conversationId: String) async throws {}
    func open(conversationId: String) {}
}
#endif
