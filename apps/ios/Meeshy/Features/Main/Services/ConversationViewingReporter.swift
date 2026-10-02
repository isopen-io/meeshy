import Foundation
import Combine
import MeeshySDK
import MeeshyUI

/// « Est dans la conversation » (#8892), côté ÉMISSION : dit au serveur quelle
/// conversation l'utilisateur a à l'écran, au premier plan.
///
/// `viewing:start` part quand l'écran de la conversation devient actif ET que
/// l'app est au premier plan ; `viewing:stop` quand il se ferme ou que l'app
/// passe en arrière-plan. Le serveur oublie tout à la déconnexion : chaque
/// (re)connexion ré-émet `viewing:start` pour la conversation affichée.
///
/// L'écran VISIBLE (#9052) : un écran poussé par-dessus la conversation ne
/// démonte pas son modèle, mais l'utilisateur n'y est plus. L'écran rapporte
/// `onAppear` / `onDisappear` ; tant qu'aucune instance de la conversation
/// n'est visible, rien n'est annoncé. Une conversation dont l'écran n'a encore
/// rien rapporté compte comme visible.
///
/// Le PLEIN ÉCRAN ouvert depuis la conversation (#9065) — galerie,
/// visionneuse, story, audio, caméra — garde l'utilisateur dans la
/// conversation : il y REGARDE. `viewing:activity` part avec `focus` à
/// l'ouverture puis à chaque battement, et une activité simple au retour au
/// fil. L'écran d'APPEL, lui, fait quitter tant qu'il est affiché en grand.
@MainActor
protocol ConversationViewingReporting: AnyObject {
    func conversationOpened(_ conversationId: String)
    @discardableResult
    func conversationClosed(_ conversationId: String) -> Bool
    func setForeground(_ isForeground: Bool)
    func screenAppeared(_ conversationId: String)
    func screenDisappeared(_ conversationId: String)
    func coverBegan()
    func coverEnded()
    func setCallScreenShown(_ isShown: Bool)
    func activityOccurred(_ conversationId: String)
    func scrollingChanged(_ isScrolling: Bool)
    func touched()
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
    private var visibleScreens: [String: Int] = [:]
    private var covers = 0
    private var isCallScreenShown = false
    private let now: () -> Date
    private let isBusy: () -> Bool
    private var lastActivity: (conversationId: String, at: Date)?
    private var isScrolling = false
    private var heartbeatTimer: Timer?

    /// L'écart minimal entre deux `viewing:activity` — jumeau de
    /// `ACTIVITY_THROTTLE_MS` (`apps/web/src/lib/api/conversation-viewing.ts`).
    static let activityThrottle: TimeInterval = 2

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
        isForeground: Bool = true,
        now: @escaping () -> Date = Date.init,
        isBusy: @escaping () -> Bool = { PlaybackCoordinator.shared.isAnyPlaying || AudioRecorderManager.shared.isRecording }
    ) {
        self.emitter = emitter
        self.isForeground = isForeground
        self.now = now
        self.isBusy = isBusy
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
        let before = announced
        openings[conversationId, default: 0] += 1
        viewingConversationId = conversationId
        transition(from: before, reannounce: true)
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
        let before = announced
        visibleScreens[conversationId] = nil
        if viewingConversationId == conversationId { viewingConversationId = nil }
        transition(from: before)
        return true
    }

    func setForeground(_ isForeground: Bool) {
        guard self.isForeground != isForeground else { return }
        let before = announced
        self.isForeground = isForeground
        transition(from: before)
    }

    /// L'écran revient au premier plan de la navigation : retour d'une
    /// couverture plein écran, d'un écran poussé, ou d'une autre conversation
    /// empilée dessus — c'est elle qu'on regarde désormais. Une première
    /// apparition, avant l'ouverture du handler, ne fait que compter :
    /// `conversationOpened` annoncera.
    func screenAppeared(_ conversationId: String) {
        guard !conversationId.isEmpty else { return }
        let before = announced
        visibleScreens[conversationId] = (visibleScreens[conversationId] ?? 0) + 1
        if openings[conversationId] != nil { viewingConversationId = conversationId }
        transition(from: before)
    }

    /// Comptée par instance : une conversation poussée par-dessus elle-même
    /// reste visible quand l'ancienne instance disparaît.
    func screenDisappeared(_ conversationId: String) {
        let before = announced
        visibleScreens[conversationId] = max((visibleScreens[conversationId] ?? 1) - 1, 0)
        transition(from: before)
    }

    /// Un plein écran présenté depuis la conversation ; comptés, car une
    /// visionneuse peut en présenter une autre. Le premier dit `focus` tout
    /// de suite, le dernier refermé rend le fil sans attendre la tenue.
    func coverBegan() {
        covers += 1
        guard covers == 1 else { return }
        signalAtOnce()
    }

    func coverEnded() {
        guard covers > 0 else { return }
        covers -= 1
        guard covers == 0 else { return }
        signalAtOnce()
    }

    func setCallScreenShown(_ isShown: Bool) {
        guard isCallScreenShown != isShown else { return }
        let before = announced
        isCallScreenShown = isShown
        transition(from: before)
    }

    /// L'utilisateur fait défiler, écoute un média, écrit ou réagit dans la
    /// conversation (#9061) : ses pairs voient son point pulser. Rien ne part
    /// pour une conversation qui n'est pas annoncée, et au plus une fois toutes
    /// les `activityThrottle` secondes.
    func activityOccurred(_ conversationId: String) {
        guard announced == conversationId else { return }
        let at = now()
        if let last = lastActivity, last.conversationId == conversationId,
           at.timeIntervalSince(last.at) < Self.activityThrottle { return }
        lastActivity = (conversationId, at)
        emitter.emitViewingActivity(conversationId: conversationId, focus: covers > 0)
    }

    private func signalAtOnce() {
        guard let current = announced else { return }
        lastActivity = nil
        activityOccurred(current)
    }

    /// Le doigt fait défiler le fil (regarder) : l'activité part au premier
    /// mouvement, et le battement la tient tant que le défilement dure.
    func scrollingChanged(_ isScrolling: Bool) {
        self.isScrolling = isScrolling
        guard isScrolling, let current = announced else { return }
        activityOccurred(current)
    }

    /// Un geste dans le fil — réagir, lancer un audio, ouvrir un menu.
    func touched() {
        guard let current = announced else { return }
        activityOccurred(current)
    }

    /// Ce qui dure sans geste — écouter un média, enregistrer un vocal,
    /// défiler longtemps — se redit à chaque battement, tant que la
    /// conversation est annoncée.
    func heartbeat() {
        guard let current = announced, covers > 0 || isScrolling || isBusy() else { return }
        activityOccurred(current)
    }

    private func syncHeartbeat() {
        guard announced != nil else {
            heartbeatTimer?.invalidate()
            heartbeatTimer = nil
            return
        }
        guard heartbeatTimer == nil else { return }
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: Self.activityThrottle, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.heartbeat() }
        }
    }

    private var announced: String? {
        guard isForeground, !isCallScreenShown, let current = viewingConversationId, (visibleScreens[current] ?? 1) > 0 else { return nil }
        return current
    }

    private func transition(from before: String?, reannounce: Bool = false) {
        let after = announced
        if let before, before != after {
            emitter.emitViewingStop(conversationId: before)
        }
        if let after, after != before || reannounce {
            emitter.emitViewingStart(conversationId: after)
        }
        syncHeartbeat()
    }

    private func announceCurrent() {
        guard let current = announced else { return }
        emitter.emitViewingStart(conversationId: current)
    }
}
