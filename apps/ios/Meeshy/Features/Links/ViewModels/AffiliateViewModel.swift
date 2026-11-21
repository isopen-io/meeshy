import Foundation
import Combine
import os
import MeeshySDK
import MeeshyUI

/// La page Parrainage (#19507) : mes jetons (cache d'abord), mes statistiques, mes filleuls et mes invitations
/// envoyées. Ce qui est en cache s'affiche aussitôt ; le réseau revalide ensuite chaque source sans en attendre
/// une autre, et une source en panne laisse son bloc absent sans retenir les autres.
@MainActor
final class AffiliateViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    enum StatsPhase: Equatable {
        case loading
        case loaded
        case unavailable
    }

    @Published var tokens: [AffiliateToken] = []
    @Published var isLoading = false
    @Published private(set) var stats: AffiliateStats?
    @Published private(set) var statsPhase: StatsPhase = .loading
    @Published private(set) var cachedReferrals: [AffiliateReferral] = []
    @Published private(set) var invitations: [SentEmailInvitation] = []

    private static let logger = MeeshyLog.logger(.affiliate)

    private let sources: AffiliatePageSources
    private let now: () -> Date

    init(sources: AffiliatePageSources = .live, now: @escaping () -> Date = { Date() }) {
        self.sources = sources
        self.now = now
    }

    /// Ce que la page montre, composé depuis ce que l'appareil sait à l'instant.
    var page: ReferralPage {
        ReferralPage.compose(tokens: tokens, stats: stats, cachedReferrals: cachedReferrals,
                             invitations: invitations, now: now())
    }

    // MARK: - Les jetons (cache d'abord)

    func load() async {
        if let cached = await sources.store.cachedTokens() {
            tokens = cached.tokens
            if cached.isFresh { return }
        } else {
            isLoading = tokens.isEmpty
        }
        await refreshFromAPI()
    }

    private func refreshFromAPI() async {
        do {
            tokens = try await sources.affiliateService.listTokens(offset: 0, limit: 50)
            await sources.store.saveTokens(tokens)
        } catch {
            AffiliateViewModel.logger.error("affiliate tokens refresh failed: \(error.localizedDescription)")
        }
        isLoading = false
    }

    // MARK: - La page entière

    /// Jetons et filleuls en cache d'abord, puis les trois lectures réseau en parallèle.
    func loadPage() async {
        await loadCachedReferrals()
        async let tokensDone: Void = load()
        async let statsDone: Void = refreshStats()
        async let invitationsDone: Void = refreshInvitations()
        await tokensDone
        await statsDone
        await invitationsDone
    }

    private func loadCachedReferrals() async {
        let cached = await sources.store.cachedReferrals()
        guard !cached.isEmpty else { return }
        cachedReferrals = cached
    }

    func refreshStats() async {
        do {
            let served = try await sources.affiliateService.fetchStats()
            stats = served
            statsPhase = .loaded
            guard let referrals = served.referrals else { return }
            cachedReferrals = referrals
            await sources.store.saveReferrals(referrals)
        } catch {
            statsPhase = stats == nil ? .unavailable : .loaded
            AffiliateViewModel.logger.error("affiliate stats refresh failed: \(error.localizedDescription)")
        }
    }

    /// Une passerelle qui ne connaît pas encore la liste (#19207) répond par une erreur : le bloc reste absent.
    func refreshInvitations() async {
        guard let served = try? await sources.invitationsService.listSentInvitations(offset: 0, limit: 20) else { return }
        invitations = served
    }

    // MARK: - Gestes

    /// Optimiste : la rangée part tout de suite et revient si le serveur refuse.
    func deleteToken(_ token: AffiliateToken) async -> Bool {
        let snapshot = tokens
        tokens.removeAll { $0.id == token.id }
        await sources.store.saveTokens(tokens)
        do {
            try await sources.deleteToken(token.id)
            return true
        } catch {
            tokens = snapshot
            await sources.store.saveTokens(snapshot)
            return false
        }
    }

    func insertToken(_ token: AffiliateToken) {
        tokens.insert(token, at: 0)
    }

    /// « Relancer » : l'invitation se dit relancée tout de suite (une relance de moins, plus de bouton), puis
    /// adopte l'invitation servie ; un refus (délai, plafond, adresse inscrite) rend l'état d'avant.
    func resend(_ invitation: SentEmailInvitation) async -> Bool {
        guard invitation.canResend == true, invitations.contains(where: { $0.id == invitation.id }) else { return false }
        let snapshot = invitations
        let optimistic = invitation.resent(at: WireDate.string(from: now()))
        invitations = invitations.map { $0.id == invitation.id ? optimistic : $0 }
        do {
            let served = try await sources.invitationsService.resendInvitation(id: invitation.id)
            invitations = invitations.map { $0.id == served.id ? served : $0 }
            return true
        } catch {
            invitations = snapshot
            return false
        }
    }

    /// « Inviter quelqu'un » / « Par e-mail » : l'invitation part, puis la liste se relit (l'adresse revient masquée
    /// par la passerelle, jamais recopiée par l'appareil).
    func invite(email: String) async -> Bool {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard ReferralInviteRule.isPlausibleEmail(address) else { return false }
        do {
            try await sources.sendEmailInvitation(address)
        } catch {
            return false
        }
        await refreshInvitations()
        return true
    }

    /// « Dire bonjour » : la conversation directe avec le filleul.
    func sayHello(to referral: ReferralPage.Referral) async -> Conversation? {
        guard let userId = referral.userId else { return nil }
        return await sources.conversationCreator.openDirectConversation(with: userId, currentUserId: sources.currentUserId)
    }
}

/// Ce qu'on accepte d'envoyer comme adresse : une partie locale, une arobase, un domaine à point. La passerelle
/// juge le reste ; le client n'envoie simplement pas ce qui ne peut pas être une adresse.
nonisolated enum ReferralInviteRule {
    static func isPlausibleEmail(_ text: String) -> Bool {
        let parts = text.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, !text.contains(" ") else { return false }
        let domain = parts[1]
        guard let dot = domain.lastIndex(of: "."), dot != domain.startIndex else { return false }
        return domain.index(after: dot) != domain.endIndex
    }
}
