import Combine
import Foundation
import os
import MeeshySDK
import MeeshyUI

/// Les gestes de la carte — chacun REPREND un chemin existant de l'app, aucun
/// n'est réécrit ici (#8099).
@MainActor
protocol ConversationCardActionPerforming {
    /// Jonction par compte : `ShareLinkService.joinAuthenticated` (idempotente).
    func join(identifier: String) async throws -> String
    /// Jonction SANS compte : le parcours invité de `MeeshyApp`
    /// (`DeepLinkRouter.requestedGuestJoin` → `GuestSession`).
    func joinAnonymously(identifier: String)
    /// Départ : `ConversationStore.apply(.leave)`, le chemin du menu d'options.
    func leave(conversationId: String) async throws
    /// Ouverture : la même voie qu'un lien `/c/<id>` tapé.
    func open(conversationId: String)
}

struct LiveConversationCardActions: ConversationCardActionPerforming {
    func join(identifier: String) async throws -> String {
        try await ShareLinkService.shared.joinAuthenticated(linkId: identifier).conversationId
    }

    func joinAnonymously(identifier: String) {
        DeepLinkRouter.shared.requestedGuestJoin = identifier
    }

    func leave(conversationId: String) async throws {
        try await ConversationStore.shared.apply(.leave, for: conversationId)
    }

    func open(conversationId: String) {
        DeepLinkRouter.shared.pendingDeepLink = .conversation(id: conversationId)
    }
}

@MainActor
final class ConversationLinkCardViewModel: ObservableObject {
    nonisolated deinit {}

    enum Phase: Equatable {
        case loading
        case card(ConversationCard)
        case privateConversation
        case unavailable
    }

    enum Pending: Equatable {
        case none
        case joining
        case leaving
    }

    @Published private(set) var phase: Phase
    @Published private(set) var pending: Pending = .none
    @Published private(set) var errorMessage: String?

    let target: ConversationCardTarget
    private let service: ConversationCardServiceProviding
    private let performer: ConversationCardActionPerforming
    private let viewerHasAccount: Bool
    private var isFresh: Bool
    private var changeSubscription: AnyCancellable?
    /// Le changement que CETTE carte vient d'annoncer : elle connaît déjà son
    /// nouvel état et ne se relit pas. Une autre carte du même lien, elle, se
    /// relit — d'où un jeton par carte plutôt qu'une comparaison de cibles.
    private var ownAnnouncedChange: ConversationCardChange?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-card")

    init(
        target: ConversationCardTarget,
        service: ConversationCardServiceProviding = ConversationCardService.shared,
        performer: ConversationCardActionPerforming = LiveConversationCardActions(),
        viewerHasAccount: Bool = ConversationLinkCardViewModel.currentViewerHasAccount()
    ) {
        self.target = target
        self.service = service
        self.performer = performer
        self.viewerHasAccount = viewerHasAccount
        // Cache d'abord, à la construction : une carte déjà vue se rend dès la
        // première image, sans squelette.
        switch service.cached(target) {
        case .fresh(let resolution, _):
            phase = Self.phase(for: resolution)
            isFresh = true
        case .stale(let resolution, _):
            phase = Self.phase(for: resolution)
            isFresh = false
        case .expired, .empty:
            phase = .loading
            isFresh = false
        }
        // #8138 — une jonction ou un départ fait depuis UNE AUTRE carte de la
        // même conversation (lien de partage ↔ lien direct) périme celle-ci.
        changeSubscription = NotificationCenter.default
            .publisher(for: ConversationCardChange.notification)
            .compactMap { $0.object as? ConversationCardChange }
            .sink { [weak self] change in
                Task { @MainActor [weak self] in self?.conversationDidChange(change) }
            }
    }

    /// Relit la carte si le geste vient d'ailleurs et qu'elle désigne la même
    /// conversation — par sa cible (lien direct) ou par ce que le serveur a
    /// servi (lien de partage vu en membre).
    private func conversationDidChange(_ change: ConversationCardChange) {
        if change == ownAnnouncedChange {
            ownAnnouncedChange = nil
            return
        }
        guard pending == .none, change.origin == target || designates(change.conversationId) else { return }
        isFresh = false
        Task { await load() }
    }

    private func announceChange(of conversationId: String) {
        ownAnnouncedChange = ConversationCardChange(conversationId: conversationId, origin: target)
        service.invalidate(conversationId: conversationId, from: target)
    }

    /// Un compte connecté (pas une session invitée) : il ne rejoint qu'en son
    /// nom, jamais « en anonyme » — même règle que la page d'invitation web.
    static func currentViewerHasAccount() -> Bool {
        guard let user = AuthManager.shared.currentUser else { return false }
        return user.isAnonymous != true
    }

    private func designates(_ conversationId: String) -> Bool {
        if target.directConversationId == conversationId { return true }
        if case .card(let card) = phase { return card.conversationId == conversationId }
        return false
    }

    var actions: ConversationCardActions {
        guard case .card(let card) = phase else { return .none }
        return ConversationCardActions.resolve(for: card, target: target, viewerHasAccount: viewerHasAccount)
    }

    /// Relit la carte, sauf si le cache est frais. Une carte périmée reste à
    /// l'écran pendant la relecture — elle n'est remplacée qu'à l'arrivée.
    func load() async {
        guard !isFresh else { return }
        let resolution = await service.refresh(target)
        isFresh = true
        if case .unavailable = resolution, case .card = phase { return }
        phase = Self.phase(for: resolution)
    }

    /// Retour immédiat (haptique + bouton « en cours »), puis la carte passe
    /// « membre » et la conversation s'ouvre. Un échec rend la carte d'avant
    /// et son erreur, dans la carte même. Les boutons ne basculent pas vers
    /// Quitter | Ouvrir AVANT la réponse : proposer de quitter un groupe dont
    /// l'entrée n'est pas acquise serait un mensonge de l'interface.
    func join() async {
        guard case .join(let identifier, _) = actions, case .card(let before) = phase, pending == .none else { return }
        pending = .joining
        errorMessage = nil
        HapticFeedback.light()
        do {
            let conversationId = try await performer.join(identifier: identifier)
            let joined = before.with(isMember: true, conversationId: conversationId)
            phase = .card(joined)
            announceChange(of: conversationId)
            service.store(.card(joined), for: target)
            pending = .none
            HapticFeedback.success()
            performer.open(conversationId: conversationId)
        } catch {
            Self.logger.error("join failed: \(error.localizedDescription, privacy: .public)")
            phase = .card(before)
            pending = .none
            errorMessage = ConversationLinkCardCopy.joinError(error)
            HapticFeedback.error()
        }
    }

    func joinAnonymously() {
        guard case .join(let identifier, true) = actions, pending == .none else { return }
        HapticFeedback.light()
        performer.joinAnonymously(identifier: identifier)
    }

    func leave() async {
        guard case .leaveOrOpen(let conversationId) = actions, case .card(let before) = phase, pending == .none else { return }
        pending = .leaving
        errorMessage = nil
        let left = before.with(isMember: false, conversationId: before.kind == .direct ? conversationId : nil)
        phase = .card(left)
        do {
            try await performer.leave(conversationId: conversationId)
            pending = .none
            // Hors du groupe, un lien DIRECT ne montre plus rien : le serveur
            // en décide à la prochaine lecture.
            announceChange(of: conversationId)
            if before.kind == .direct { phase = .privateConversation }
            HapticFeedback.success()
        } catch {
            Self.logger.error("leave failed: \(error.localizedDescription, privacy: .public)")
            phase = .card(before)
            pending = .none
            errorMessage = ConversationLinkCardCopy.leaveError
            HapticFeedback.error()
        }
    }

    func open() {
        guard case .leaveOrOpen(let conversationId) = actions else { return }
        HapticFeedback.light()
        performer.open(conversationId: conversationId)
    }

    private static func phase(for resolution: ConversationCardResolution) -> Phase {
        switch resolution {
        case .card(let card): return .card(card)
        case .privateConversation: return .privateConversation
        case .unavailable: return .unavailable
        }
    }
}
