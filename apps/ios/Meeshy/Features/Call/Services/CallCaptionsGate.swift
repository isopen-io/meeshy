import Foundation
import MeeshySDK

// MARK: - Gate

/// **Un appel peut-il porter des sous-titres ?** (#13720, #9224, #9229)
///
/// Les sous-titres passent par la passerelle : chaque phrase finale part en
/// clair (`call:transcription-segment`), qui la relaie, la traduit et la grave
/// pour le journal d'après l'appel. Une conversation chiffrée de bout en bout
/// ne les ouvre donc jamais : rien ne se capte, rien ne s'annonce, rien ne
/// part. Une conversation dont le régime ne se lit pas reste fermée aussi
/// (fail-closed) — elle s'ouvre quand le régime se lit en clair.
///
/// Miroir Android : `CallCaptionsGate` (`apps/android/core/model`). Miroir
/// passerelle : `callCaptionsAdmissionOf` (`call-captions-admission.ts`).
nonisolated enum CallCaptionsGate: Equatable, Sendable {
    case open
    case endToEnd
    case unresolved

    var allowsCaptions: Bool { self == .open }

    /// La loi : un régime appris chiffré de bout en bout l'emporte toujours
    /// (le bout en bout ne se désactive pas, #12949) ; sinon seuls le clair
    /// (mode nul ou vide), `server` et `hybrid` ouvrent — un mode inconnu ou
    /// un régime illisible ferment. Même lecture que la passerelle.
    static func of(served: CallCaptionsServedRegime, rememberedEndToEnd: Bool) -> CallCaptionsGate {
        if rememberedEndToEnd { return .endToEnd }
        guard case .served(let mode) = served else { return .unresolved }
        switch (mode ?? "").trimmingCharacters(in: .whitespaces).lowercased() {
        case E2EEWire.mode: return .endToEnd
        case "", "server", "hybrid": return .open
        default: return .unresolved
        }
    }

    /// Ce que l'écran d'appel dit quand il refuse d'ouvrir les sous-titres.
    var refusalMessage: String {
        switch self {
        case .endToEnd:
            return String(
                localized: "call.captions.refused.e2ee",
                defaultValue: "Les sous-titres ne sont pas disponibles dans une conversation chiffrée de bout en bout.",
                bundle: .main
            )
        case .open, .unresolved:
            return String(
                localized: "call.captions.refused.unverified",
                defaultValue: "Les sous-titres ne peuvent pas s’ouvrir : le chiffrement de cette conversation n’a pas pu être vérifié.",
                bundle: .main
            )
        }
    }
}

/// Le régime que le serveur sert pour une conversation, ou son absence.
nonisolated enum CallCaptionsServedRegime: Equatable, Sendable {
    case served(mode: String?)
    case unreadable

    var mode: String? {
        guard case .served(let mode) = self else { return nil }
        return mode
    }
}

// MARK: - Resolver

@MainActor
protocol CallCaptionsGateResolving: AnyObject {
    func gate(conversationId: String?) async -> CallCaptionsGate
    /// Lecture SYNCHRONE de la mémoire de l'appareil : une conversation qui
    /// devient chiffrée pendant l'appel referme la porte déjà ouverte.
    func remembersEndToEnd(conversationId: String) -> Bool
}

/// Lit le régime de la conversation d'un appel : la mémoire monotone de
/// l'appareil (`EndToEndRegimeMemory`, une conversation vue chiffrée le
/// reste), puis le régime servi — la liste en cache d'abord, le serveur sinon.
@MainActor
final class CallCaptionsGateResolver: CallCaptionsGateResolving {
    nonisolated deinit {}

    typealias ServedRegimeReader = @MainActor (String) async -> CallCaptionsServedRegime

    private let memory: any EndToEndRegimeMemoryProviding
    private let readServedRegime: ServedRegimeReader

    init(
        memory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory.shared,
        readServedRegime: @escaping ServedRegimeReader = CallCaptionsGateResolver.servedRegimeCacheFirst
    ) {
        self.memory = memory
        self.readServedRegime = readServedRegime
    }

    func remembersEndToEnd(conversationId: String) -> Bool {
        memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd
    }

    func gate(conversationId: String?) async -> CallCaptionsGate {
        guard let conversationId, !conversationId.isEmpty else { return .unresolved }
        if remembersEndToEnd(conversationId: conversationId) { return .endToEnd }
        let served = await readServedRegime(conversationId)
        let remembered = memory.resolve(
            conversationId: conversationId,
            served: EndToEndRegime(encryptionMode: served.mode, enabledAt: nil)
        )
        return CallCaptionsGate.of(served: served, rememberedEndToEnd: remembered.isEndToEnd)
    }

    /// Une liste FRAÎCHE fait foi ; une liste périmée ne prouve que le
    /// chiffrement (une conversation chiffrée le reste) — jamais le clair, que
    /// seul le serveur confirme alors.
    static func servedRegimeCacheFirst(conversationId: String) async -> CallCaptionsServedRegime {
        switch await CacheCoordinator.shared.conversations.load(for: "list") {
        case .fresh(let list, _):
            if let conversation = list.first(where: { $0.id == conversationId }) {
                return .served(mode: conversation.encryptionMode)
            }
        case .stale(let list, _):
            let cached = list.first(where: { $0.id == conversationId })
            if EndToEndPlaintextLaw.isEndToEndConversation(cached?.encryptionMode) { return .served(mode: E2EEWire.mode) }
        case .expired, .empty:
            break
        }
        do {
            return .served(mode: try await ConversationService.shared.getById(conversationId).encryptionMode)
        } catch {
            return .unreadable
        }
    }
}

// MARK: - Refusal

/// Ce que l'appel fait d'un refus RÉGLÉ : la capture s'arrête, le panneau se
/// ferme, l'écoute retirée s'annonce si elle avait été annoncée, et
/// l'utilisateur qui avait ouvert le panneau lit pourquoi. Tant que le régime
/// se lit encore, rien ne bouge : le panneau attend, rien ne part.
@MainActor
enum CallCaptionsRefusal {
    static func settle(
        service: CallTranscriptionService,
        publishListeningIntent: () -> Void,
        tellUser: (String) -> Void
    ) {
        guard service.isCaptionsGateSettled else { return }
        let userAsked = service.closeForRefusedCaptions()
        publishListeningIntent()
        guard userAsked else { return }
        tellUser(service.captionsGate.refusalMessage)
    }
}
