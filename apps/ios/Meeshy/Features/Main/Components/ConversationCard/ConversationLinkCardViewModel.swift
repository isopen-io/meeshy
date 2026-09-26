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
    private var isFresh: Bool

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-card")

    init(
        target: ConversationCardTarget,
        service: ConversationCardServiceProviding = ConversationCardService.shared,
        performer: ConversationCardActionPerforming = LiveConversationCardActions()
    ) {
        self.target = target
        self.service = service
        self.performer = performer
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
    }

    var actions: ConversationCardActions {
        guard case .card(let card) = phase else { return .none }
        return ConversationCardActions.resolve(for: card, target: target)
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
            service.invalidate(target)
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
