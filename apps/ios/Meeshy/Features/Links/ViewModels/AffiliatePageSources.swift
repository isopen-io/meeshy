import Foundation
import MeeshySDK
import MeeshyUI

/// Ce que la page Parrainage garde sur l'appareil : mes jetons et mes filleuls, pour s'afficher sans attendre.
@MainActor
protocol AffiliatePageCacheProviding: AnyObject {
    /// Les jetons en cache et s'ils sont encore frais ; `nil` sans cache utilisable.
    func cachedTokens() async -> (tokens: [AffiliateToken], isFresh: Bool)?
    func saveTokens(_ tokens: [AffiliateToken]) async
    func cachedReferrals() async -> [AffiliateReferral]
    func saveReferrals(_ referrals: [AffiliateReferral]) async
}

/// Le cache réel : la liste de jetons que lisent aussi le déroulé photo et la vitrine (une seule liste), et les
/// filleuls que l'annuaire range sous la même clé.
@MainActor
final class AffiliatePageCache: AffiliatePageCacheProviding {
    nonisolated deinit {}

    private static let tokensKey = "list"
    private static let referralsKey = "affiliates:referrals"

    func cachedTokens() async -> (tokens: [AffiliateToken], isFresh: Bool)? {
        switch await CacheCoordinator.shared.affiliateTokens.load(for: Self.tokensKey) {
        case .fresh(let tokens, _): return (tokens, true)
        case .stale(let tokens, _): return (tokens, false)
        case .expired, .empty: return nil
        }
    }

    func saveTokens(_ tokens: [AffiliateToken]) async {
        await bestEffort("affiliateView.affiliateTokens.save", category: .cache) { try await CacheCoordinator.shared.affiliateTokens.save(tokens, for: Self.tokensKey) }
    }

    func cachedReferrals() async -> [AffiliateReferral] {
        switch await CacheCoordinator.shared.affiliates.load(for: Self.referralsKey) {
        case .fresh(let referrals, _), .stale(let referrals, _): return referrals
        case .expired, .empty: return []
        }
    }

    func saveReferrals(_ referrals: [AffiliateReferral]) async {
        await bestEffort("affiliateView.affiliates.save", category: .cache) { try await CacheCoordinator.shared.affiliates.save(referrals, for: Self.referralsKey) }
    }
}

/// Les sources de la page Parrainage, injectées d'un bloc : le réseau, le cache, la conversation directe.
struct AffiliatePageSources {
    let affiliateService: AffiliateServiceProviding
    let invitationsService: SentInvitationsProviding
    let deleteToken: @Sendable (String) async throws -> Void
    let sendEmailInvitation: @Sendable (String) async throws -> Void
    let conversationCreator: ConversationCreating
    let currentUserId: String
    let store: AffiliatePageCacheProviding

    static var live: AffiliatePageSources {
        let service = AffiliateService.shared
        return AffiliatePageSources(
            affiliateService: service,
            invitationsService: service,
            deleteToken: { id in try await service.deleteToken(id: id) },
            sendEmailInvitation: { email in try await FriendService.shared.sendEmailInvitation(email: email) },
            conversationCreator: ConversationCreator(),
            currentUserId: AuthManager.shared.currentUser?.id ?? "",
            store: AffiliatePageCache()
        )
    }
}
