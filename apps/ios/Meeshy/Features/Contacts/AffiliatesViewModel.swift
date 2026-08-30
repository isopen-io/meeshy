import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Affiliés — les filleuls de l'utilisateur, ceux qui ont rejoint Meeshy par
/// son lien d'affiliation.
///
/// Cache-first comme le reste de l'annuaire : la liste connue s'affiche
/// immédiatement, la revalidation se fait en silence.
@MainActor
final class AffiliatesViewModel: ObservableObject {
    @Published private(set) var referrals: [AffiliateReferral] = []
    @Published private(set) var loadState: LoadState = .idle
    @Published var searchQuery: String = ""

    private let affiliateService: AffiliateServiceProviding
    private let conversationCreator: ConversationCreating
    private let currentUserId: String
    private let cacheKey = "affiliates:referrals"
    private var revalidationTask: Task<Void, Never>?

    init(
        affiliateService: AffiliateServiceProviding = AffiliateService.shared,
        conversationCreator: ConversationCreating = ConversationCreator(),
        currentUserId: String = AuthManager.shared.currentUser?.id ?? ""
    ) {
        self.affiliateService = affiliateService
        self.conversationCreator = conversationCreator
        self.currentUserId = currentUserId
    }

    deinit {
        revalidationTask?.cancel()
    }

    var visibleReferrals: [AffiliateReferral] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return referrals }
        return referrals.filter { referral in
            referral.resolvedName.lowercased().contains(query)
                || referral.referredUser?.username.lowercased().contains(query) == true
        }
    }

    var isEmpty: Bool { referrals.isEmpty }

    // MARK: - Load

    func load(forceNetwork: Bool = false) async {
        if forceNetwork {
            await refreshFromNetwork()
            return
        }

        switch await CacheCoordinator.shared.affiliates.load(for: cacheKey) {
        case .fresh(let cached, _):
            referrals = cached
            loadState = .loaded

        case .stale(let cached, _):
            referrals = cached
            loadState = .loaded
            revalidationTask?.cancel()
            revalidationTask = Task { [weak self] in await self?.refreshFromNetwork() }

        case .expired, .empty:
            loadState = referrals.isEmpty ? .loading : .loaded
            await refreshFromNetwork()
        }
    }

    private func refreshFromNetwork() async {
        do {
            let stats = try await affiliateService.fetchStats()
            referrals = stats.referrals ?? []
            loadState = .loaded
            try? await CacheCoordinator.shared.affiliates.save(referrals, for: cacheKey)
        } catch {
            loadState = referrals.isEmpty
                ? .error(String(localized: "contacts.affiliates.load-error", defaultValue: "Impossible de charger les affiliés", bundle: .main))
                : .loaded
        }
    }

    // MARK: - Actions

    /// « Lui écrire » — ouvre la conversation directe avec un filleul.
    func startConversation(with referral: AffiliateReferral) async -> Conversation? {
        guard let user = referral.referredUser else { return nil }
        return await conversationCreator.openDirectConversation(with: user.id, currentUserId: currentUserId)
    }
}
