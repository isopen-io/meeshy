import Combine
import Foundation
import MeeshySDK

/// Ce que l'écran dit d'une demande qui n'a pas abouti comme prévu.
enum SharedLocationAskFeedback: Equatable {
    /// Une demande est déjà partie vers cette personne il y a peu : elle reste « Demandé ».
    case alreadyAsked
    /// La personne ne reçoit pas de demande de moi : le bouton disparaît, sans raison dite.
    case closed
    /// La passerelle ne sert pas encore la demande : les boutons disparaissent.
    case unavailable
    case offline
    case failed
}

/// DEMANDER À PROLONGER, REDEMANDER (#19204, #19476) : UNE demande par personne, quelle qu'en soit la nature, comme la
/// passerelle la plafonne. Le geste se voit aussitôt (« Demandé »), le réseau confirme ; un échec réseau le défait. Une
/// personne qui ferme la demande (403) perd son bouton, sans raison dite ; une passerelle qui ne la sert pas (404) les
/// retire tous. Aucune position ne part, aucun effet automatique : l'autre décide.
@MainActor
final class SharedLocationAskCenter: ObservableObject {

    @Published private(set) var asked: Set<String> = []
    @Published private(set) var closed: Set<String> = []
    @Published private(set) var isServed = true

    private let requester: SharedLocationRequesting

    nonisolated deinit {}

    init(requester: SharedLocationRequesting = RelationsService.shared) {
        self.requester = requester
    }

    /// Le bouton existe-t-il pour cette personne ?
    func canAsk(_ userId: String) -> Bool {
        isServed && !closed.contains(userId.lowercased())
    }

    func hasAsked(_ userId: String) -> Bool {
        asked.contains(userId.lowercased())
    }

    /// `nil` : la demande est partie.
    @discardableResult
    func ask(_ userId: String, kind: SharedLocationRequestKind) async -> SharedLocationAskFeedback? {
        let id = userId.lowercased()
        guard canAsk(id), !asked.contains(id) else { return nil }
        asked.insert(id)
        let outcome = await requester.requestSharedLocation(from: id, kind: kind)
        return settle(outcome, for: id)
    }

    private func settle(_ outcome: SharedLocationRequestOutcome, for id: String) -> SharedLocationAskFeedback? {
        switch outcome {
        case .sent:
            return nil
        case .tooSoon:
            return .alreadyAsked
        case .closed:
            asked.remove(id)
            closed.insert(id)
            return .closed
        case .notServed:
            asked.remove(id)
            isServed = false
            return .unavailable
        case .offline:
            asked.remove(id)
            return .offline
        case .failed:
            asked.remove(id)
            return .failed
        }
    }
}

/// Le centre des demandes du compte connecté : un autre compte repart sans demande.
enum SharedLocationAskHolder {
    private static var current: (userId: String, center: SharedLocationAskCenter)?

    static func center() -> SharedLocationAskCenter {
        let userId = AuthManager.shared.currentUser?.id ?? ""
        if let current, current.userId == userId { return current.center }
        let center = SharedLocationAskCenter()
        current = (userId, center)
        return center
    }
}

/// Les mots des demandes (sept langues dans `Localizable.xcstrings`).
enum SharedLocationAskWording {
    static var extend: String {
        String(localized: "locationMap.ask.extend", defaultValue: "Demander à prolonger", bundle: .main)
    }
    static var reask: String {
        String(localized: "locationMap.ask.reask", defaultValue: "Redemander", bundle: .main)
    }
    static var askHim: String {
        String(localized: "locationMap.ask.askThem", defaultValue: "Lui demander", bundle: .main)
    }
    static var asked: String {
        String(localized: "locationMap.ask.asked", defaultValue: "Demandé", bundle: .main)
    }

    static func ask(name: String) -> String {
        String(format: String(localized: "locationMap.ask.askName", defaultValue: "Demander à %@", bundle: .main), name)
    }

    static func askedAccessibility(name: String) -> String {
        String(format: String(localized: "locationMap.ask.askedA11y", defaultValue: "Demande envoyée à %@", bundle: .main), name)
    }

    static func feedback(_ feedback: SharedLocationAskFeedback) -> String {
        switch feedback {
        case .closed:
            return ""
        case .alreadyAsked:
            return String(localized: "locationMap.ask.alreadyAsked", defaultValue: "Tu lui as déjà demandé il y a peu.", bundle: .main)
        case .unavailable:
            return String(localized: "locationMap.ask.unavailable", defaultValue: "Cette demande n'est pas encore possible.", bundle: .main)
        case .offline:
            return String(localized: "locationMap.ask.offline", defaultValue: "Pas de connexion : la demande n'est pas partie.", bundle: .main)
        case .failed:
            return String(localized: "locationMap.ask.failed", defaultValue: "La demande n'est pas partie. Réessaie.", bundle: .main)
        }
    }

    /// Le retour d'une demande, en bandeau : un avis pour ce qui n'est pas un échec, une erreur sinon.
    static func show(_ feedback: SharedLocationAskFeedback?) {
        guard let feedback else {
            HapticFeedback.success()
            return
        }
        switch feedback {
        case .closed: return
        case .alreadyAsked, .unavailable: FeedbackToastManager.shared.showNotice(Self.feedback(feedback))
        case .offline, .failed: FeedbackToastManager.shared.showError(Self.feedback(feedback))
        }
    }
}
