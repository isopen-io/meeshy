#if DEBUG
import Foundation

/// Ce qu'un écran annonce une fois RENDU (#8921) : « prêt » n'en part qu'après l'avoir observé.
nonisolated enum VitrineEvenement: Hashable, Sendable {
    /// Une conversation dont `markAsRead` a reçu des bulles VISIBLES.
    case conversation(String)
    case progression
    case lien
    case fil
}

nonisolated enum VitrineAppareil: Sendable {
    case iphone
    case ipad
}

extension VitrineScene {
    /// Les rendus qui prouvent la scène. Sur iPad, sans conversation ouverte, la racine montre le
    /// fil à gauche (#8922) : il doit être peint lui aussi. Une conversation inconnue n'est jamais
    /// observée : la capture échoue en nommant la scène plutôt que de photographier autre chose.
    nonisolated func rendusAttendus(conversationId: String?, appareil: VitrineAppareil) -> Set<VitrineEvenement> {
        switch self {
        case .global: return [.conversation(conversationId ?? "")]
        case .progression: return appareil == .ipad ? [.progression, .fil] : [.progression]
        case .lien: return [.lien]
        }
    }
}

/// Le relais entre les écrans et la scène : les écrans SIGNALENT, la scène ATTEND.
@MainActor
final class VitrineRendu {
    static let shared = VitrineRendu(actif: VitrineLaunch.isActive)

    private let actif: Bool
    private(set) var observes: Set<VitrineEvenement> = []
    /// La conversation affichée : la scène y fait le geste du lecteur.
    private(set) weak var conversation: ConversationViewModel?
    private var attentes: [(attendus: Set<VitrineEvenement>, suite: CheckedContinuation<Void, Never>)] = []

    init(actif: Bool) {
        self.actif = actif
    }

    // Deinit isolée synthétisée (SE-0466) : double libération sous iOS 26.1 hors d'une tâche
    // (MainActorDeinitSourceGuardTests).
    nonisolated deinit {}

    func signaler(_ evenement: VitrineEvenement) {
        guard actif, observes.insert(evenement).inserted else { return }
        let comblees = attentes.filter { $0.attendus.isSubset(of: observes) }
        attentes.removeAll { $0.attendus.isSubset(of: observes) }
        comblees.forEach { $0.suite.resume() }
    }

    func conversationAffichee(_ viewModel: ConversationViewModel, visibles: [String]) {
        guard actif, !visibles.isEmpty else { return }
        conversation = viewModel
        signaler(.conversation(viewModel.conversationId))
    }

    func attendre(_ attendus: Set<VitrineEvenement>) async {
        guard !attendus.isSubset(of: observes) else { return }
        await withCheckedContinuation { attentes.append((attendus, $0)) }
    }
}
#endif
