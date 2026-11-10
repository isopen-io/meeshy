import Foundation
import MeeshySDK

// MARK: - Écrire à un ami WhatsApp depuis la nouvelle conversation (#17118)
//
// L'entrée n'existe que si `ExternalConversationEntry.isVisible` l'autorise
// (avant la signature avec Meta, pour l'équipe) : ce modèle ne la garde pas, il
// porte ce qu'elle fait une fois montrée. Le numéro saisi est normalisé en
// E.164 AVANT tout envoi ; la passerelle ouvre ou retrouve la conversation
// chiffrée de bout en bout ; chaque refus devient un état que la vue DIT.
// Miroir web : `apps/web/src/components/external-conversation-entry.tsx`.

/// Où en est l'entrée : rien, une ouverture en vol, ou ce qui s'y oppose.
nonisolated enum ExternalConversationEntryPhase: Equatable, Sendable {
    case idle
    case opening
    /// Le numéro n'est pas au format international : rien n'est parti.
    case malformed
    case phoneUnverified
    /// L'information sur ce qui part chez Meta doit être lue et acceptée d'abord (#17120).
    case consentRequired
    case refused(ExternalOpeningRefusal)
}

@MainActor
final class ExternalConversationEntryModel: ObservableObject {
    typealias Phase = ExternalConversationEntryPhase

    @Published var handle = ""
    @Published private(set) var isExpanded = false
    @Published private(set) var phase: Phase = .idle
    /// La conversation ouverte, à remettre au navigateur puis à consommer.
    @Published private(set) var openedConversationId: String?

    private let service: ExternalConversationServiceProviding

    init(service: ExternalConversationServiceProviding = ExternalConversationService.shared) {
        self.service = service
    }

    nonisolated deinit {}

    var canSubmit: Bool {
        phase != .opening && !handle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Le numéro de l'utilisateur doit être vérifié : la vue propose la vérification sur place.
    var offersPhoneVerification: Bool { phase == .phoneUnverified }

    /// La passerelle exige le consentement à ce qui part chez Meta : la vue montre l'information.
    var asksForConsent: Bool { phase == .consentRequired }

    func toggle() {
        isExpanded.toggle()
        guard !isExpanded else { return }
        handle = ""
        phase = .idle
    }

    func submit() async {
        guard phase != .opening else { return }
        guard let e164 = ExternalConversationEntry.normalizeHandle(handle) else {
            phase = .malformed
            return
        }
        await open(e164)
    }

    /// Le consentement est enregistré : le même numéro repart, sans nouvelle saisie.
    func consentGranted() async {
        guard phase == .consentRequired, let e164 = ExternalConversationEntry.normalizeHandle(handle) else { return }
        await open(e164)
    }

    /// « Annuler » sur l'information : rien n'est écrit, rien ne s'ouvre.
    func consentDeclined() {
        guard phase == .consentRequired else { return }
        phase = .idle
    }

    private func open(_ e164: String) async {
        phase = .opening
        switch await service.open(network: .whatsapp, handle: e164) {
        case .open(let conversationId, _):
            phase = .idle
            openedConversationId = conversationId
        case .phoneUnverified:
            phase = .phoneUnverified
        case .consentRequired:
            phase = .consentRequired
        case .refused(let refusal):
            phase = .refused(refusal)
        }
    }

    func consumeOpened() {
        openedConversationId = nil
    }
}

/// Ce que l'entrée dit de chaque état — dans la langue de l'interface, jamais un échec muet.
nonisolated enum ExternalConversationEntryCopy {
    static func message(for phase: ExternalConversationEntryPhase) -> String? {
        switch phase {
        case .idle, .opening, .consentRequired:
            return nil
        case .malformed:
            return String(localized: "conversation.external.handle.invalid", defaultValue: "Ce numéro n’est pas au format international. Commencez par + et l’indicatif du pays.", bundle: .main)
        case .phoneUnverified:
            return String(localized: "conversation.external.phoneUnverified", defaultValue: "Vérifiez votre numéro pour écrire à un ami WhatsApp.", bundle: .main)
        case .refused(let refusal):
            return refusalMessage(refusal)
        }
    }

    private static func refusalMessage(_ refusal: ExternalOpeningRefusal) -> String {
        switch refusal {
        case .disabled:
            return String(localized: "conversation.external.refused.disabled", defaultValue: "Écrire à un ami WhatsApp n’est pas encore disponible ici.", bundle: .main)
        case .reserved:
            return String(localized: "conversation.external.refused.reserved", defaultValue: "Pendant la phase de test, les conversations chiffrées de bout en bout sont réservées à certains comptes.", bundle: .main)
        case .limit:
            return String(localized: "conversation.external.refused.limit", defaultValue: "Vous avez déjà le nombre maximal de conversations WhatsApp ouvertes. Fermez-en une pour en ouvrir une autre.", bundle: .main)
        case .invalid:
            return String(localized: "conversation.external.handle.invalid", defaultValue: "Ce numéro n’est pas au format international. Commencez par + et l’indicatif du pays.", bundle: .main)
        case .rateLimited:
            return String(localized: "conversation.external.refused.rateLimited", defaultValue: "Trop de conversations ouvertes en peu de temps. Réessayez dans une heure.", bundle: .main)
        case .offline:
            return String(localized: "conversation.external.refused.offline", defaultValue: "Hors ligne : reconnectez-vous, puis touchez de nouveau « Écrire ».", bundle: .main)
        case .failed:
            return String(localized: "conversation.external.refused.failed", defaultValue: "Impossible d’ouvrir cette conversation. Réessayez dans un instant.", bundle: .main)
        }
    }
}
