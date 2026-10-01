import Foundation
import Combine
import MeeshySDK

/// « Est dans la conversation » (#8892), côté ÉMISSION : dit au serveur quelle
/// conversation l'utilisateur a à l'écran, au premier plan.
///
/// `viewing:start` part quand l'écran de la conversation devient actif ET que
/// l'app est au premier plan ; `viewing:stop` quand il se ferme ou que l'app
/// passe en arrière-plan. Le serveur oublie tout à la déconnexion : chaque
/// (re)connexion ré-émet `viewing:start` pour la conversation affichée.
@MainActor
protocol ConversationViewingReporting: AnyObject {
    func conversationOpened(_ conversationId: String)
    @discardableResult
    func conversationClosed(_ conversationId: String) -> Bool
    func setForeground(_ isForeground: Bool)
}

@MainActor
final class ConversationViewingReporter: ConversationViewingReporting {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = ConversationViewingReporter()

    private let emitter: ConversationViewingEmitting
    private var cancellables = Set<AnyCancellable>()

    private(set) var viewingConversationId: String?
    private(set) var isForeground: Bool
    private var openings: [String: Int] = [:]

    /// `connection` : l'état de connexion du socket ; chaque passage à `true`
    /// ré-annonce la conversation affichée. `reconnections` : chaque nouvelle
    /// session après une première — une reconnexion automatique de Socket.IO
    /// peut laisser `isConnected` à `true` de bout en bout, sans passage à
    /// `false` que `connection` verrait. `isForeground` vaut `true` par
    /// défaut : le socket ne se connecte qu'au premier plan.
    init(
        emitter: ConversationViewingEmitting = MessageSocketManager.shared,
        connection: AnyPublisher<Bool, Never> = MessageSocketManager.shared.$isConnected.eraseToAnyPublisher(),
        reconnections: AnyPublisher<Void, Never> = MessageSocketManager.shared.didReconnect.eraseToAnyPublisher(),
        isForeground: Bool = true
    ) {
        self.emitter = emitter
        self.isForeground = isForeground
        connection
            .removeDuplicates()
            .filter { $0 }
            .map { _ in () }
            .merge(with: reconnections)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.announceCurrent()
            }
            .store(in: &cancellables)
    }

    /// Ré-émet `viewing:start` même quand la conversation est déjà la courante :
    /// l'instance précédente de l'écran a pu envoyer `conversation:leave` (qui
    /// retire la présence côté serveur) juste avant. Le serveur est idempotent —
    /// un second `start` ne rediffuse rien.
    func conversationOpened(_ conversationId: String) {
        guard !conversationId.isEmpty else { return }
        openings[conversationId, default: 0] += 1
        if let previous = viewingConversationId, previous != conversationId, isForeground {
            emitter.emitViewingStop(conversationId: previous)
        }
        viewingConversationId = conversationId
        announceCurrent()
    }

    /// Nommée et comptée : la fermeture d'un écran arrive par un `deinit`
    /// différé, parfois APRÈS l'ouverture de la suivante — ou d'une nouvelle
    /// instance de la MÊME conversation. Elle ne retire la présence que quand
    /// plus aucun écran de cette conversation n'est ouvert.
    ///
    /// Rend `true` quand c'était le DERNIER écran de cette conversation :
    /// l'appelant peut alors quitter sa room (#9047). Quitter plus tôt — dans
    /// le `deinit`, sans compter — retirait le socket de la room et la
    /// présence côté serveur alors qu'un écran rouvert l'affichait encore.
    @discardableResult
    func conversationClosed(_ conversationId: String) -> Bool {
        let remaining = (openings[conversationId] ?? 0) - 1
        openings[conversationId] = remaining > 0 ? remaining : nil
        guard remaining <= 0 else { return false }
        guard viewingConversationId == conversationId else { return true }
        viewingConversationId = nil
        guard isForeground else { return true }
        emitter.emitViewingStop(conversationId: conversationId)
        return true
    }

    func setForeground(_ isForeground: Bool) {
        guard self.isForeground != isForeground else { return }
        self.isForeground = isForeground
        guard let current = viewingConversationId else { return }
        if isForeground {
            emitter.emitViewingStart(conversationId: current)
        } else {
            emitter.emitViewingStop(conversationId: current)
        }
    }

    private func announceCurrent() {
        guard isForeground, let current = viewingConversationId else { return }
        emitter.emitViewingStart(conversationId: current)
    }
}
