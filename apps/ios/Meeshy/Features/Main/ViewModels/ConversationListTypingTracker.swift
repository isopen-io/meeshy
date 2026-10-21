import Foundation
import Combine
import MeeshySDK

/// Qui écrit dans quelle conversation de la liste — l'état par membre, les
/// échéances de 15 s et les trois abonnements socket qui les pilotent
/// (`typing:start`, `typing:stop`, `message:new`). Extrait de
/// `ConversationListViewModel` : l'hôte ne garde que les deux dictionnaires
/// PUBLIÉS que les lignes lisent, que ce collaborateur réaligne par
/// `onSelectionChanged`.
@MainActor
final class ConversationListTypingTracker {

    /// Un frappeur : son handle (`@pseudo`) et son nom d'affichage. Le gateway
    /// transmet les deux ; les deux surfaces n'en montrent pas le même.
    struct TypingUser: Equatable, Sendable {
        let username: String
        let displayName: String
    }

    /// Per-user source of truth: conversationId → (userId → frappeur). The
    /// published `typingUsernames` is derived from this so a `typing:stop` from
    /// ONE member of a group no longer wipes the whole row's indicator while
    /// OTHER members are still typing (displayed "personne n'écrit" ≠ real
    /// "B écrit").
    private var typers: [String: [String: TypingUser]] = [:]
    // `nonisolated(unsafe)` : muté uniquement sur le MainActor, lu une fois
    // par le `nonisolated deinit` pour invalider les timers de typing 15 s
    // encore armés — même pattern que `ConversationSocketHandler.typingSafetyTimers`.
    nonisolated(unsafe) private var typingTimers: [String: Timer] = [:]
    private var cancellables = Set<AnyCancellable>()
    private var onSelectionChanged: (@MainActor (_ conversationId: String, _ selection: TypingUser?) -> Void)?

    nonisolated deinit {
        typingTimers.values.forEach { $0.invalidate() }
    }

    /// Picks the single typer surfaced for a conversation. The row API is
    /// single-name; sorting keeps the choice deterministic (and stable across
    /// re-renders) when several members type at once.
    static func typingSelection(for typers: [String: TypingUser]?) -> TypingUser? {
        guard let typers, !typers.isEmpty else { return nil }
        return typers.values.sorted { ($0.displayName, $0.username) < ($1.displayName, $1.username) }.first
    }

    func observe(
        typingStarted: PassthroughSubject<TypingEvent, Never>,
        typingStopped: PassthroughSubject<TypingEvent, Never>,
        messageReceived: PassthroughSubject<APIMessage, Never>,
        currentUserId: @escaping @MainActor () -> String,
        onSelectionChanged: @escaping @MainActor (_ conversationId: String, _ selection: TypingUser?) -> Void
    ) {
        self.onSelectionChanged = onSelectionChanged

        // Typing indicator — affiche "<Auteur> écrit..." dans le row
        typingStarted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                // Don't surface YOUR OWN typing — the gateway echoes typing to every
                // participant including the author, so on multi-device this would show
                // "<You> écrit…" on your own conversation row. Mirror the per-conversation
                // guard in ConversationSocketHandler.
                guard event.userId != currentUserId() else { return }
                typers[event.conversationId, default: [:]][event.userId] = TypingUser(
                    username: event.username,
                    displayName: event.preferredDisplayName
                )
                refreshTypingDerivations(for: event.conversationId)
                scheduleTypingCleanup(for: event.conversationId)
            }
            .store(in: &cancellables)

        typingStopped
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleTypingStopped(userId: event.userId, conversationId: event.conversationId)
            }
            .store(in: &cancellables)

        // Un message rétracte la frappe qui l'annonçait.
        //
        // `typingStopped` ci-dessus ne couvre PAS ce cas : le `typing:stop` de
        // l'expéditeur voyage sur un canal distinct, dans un ordre non garanti
        // vis-à-vis de `message:new`, et peut se perdre (arrière-plan, coupure
        // brève, crash de l'onglet). Le gateway, lui, n'émet aucun `typing:stop`
        // implicite à la création d'un message — seul `handleSocketDisconnecting`
        // le fait. Sans ce chemin, la pastille affichait « @alice ⋯ » jusqu'à
        // l'échéance de `scheduleTypingCleanup` (15 s) APRÈS l'arrivée du
        // message, pendant que le toast annonçait ce même message trente points
        // plus bas — deux états contradictoires de la même conversation.
        //
        // Pendant exact de la règle inverse déjà en vigueur (`typing:start`
        // reçu = preuve d'activité) : l'arrivée du message est la preuve la plus
        // forte que la frappe est terminée. `handleTypingStopped` est réutilisé
        // tel quel — il ne retire que CET auteur et laisse les autres frappeurs
        // de la conversation en place.
        messageReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.handleTypingStopped(
                    userId: message.senderId,
                    conversationId: message.conversationId
                )
            }
            .store(in: &cancellables)
    }

    // MARK: - Typing Cleanup

    private func scheduleTypingCleanup(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.clearTyping(for: conversationId)
            }
        }
    }

    /// A `typing:stop` removes ONLY the member who stopped. The row's indicator
    /// stays up (re-derived from the remaining typers) until the last one stops.
    /// Falls back to a full clear when we have no per-user tracking for the
    /// conversation (e.g. the display was seeded out-of-band), preserving the
    /// legacy "a stop clears the row" contract for that case.
    private func handleTypingStopped(userId: String, conversationId: String) {
        guard var convTypers = typers[conversationId], !convTypers.isEmpty else {
            clearTyping(for: conversationId)
            return
        }
        convTypers.removeValue(forKey: userId)
        if convTypers.isEmpty {
            clearTyping(for: conversationId)
            return
        }
        typers[conversationId] = convTypers
        refreshTypingDerivations(for: conversationId)
    }

    private func clearTyping(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = nil
        typers.removeValue(forKey: conversationId)
        onSelectionChanged?(conversationId, nil)
    }

    /// Réaligne les deux vues publiques sur le frappeur retenu. Une seule
    /// sélection les alimente : la ligne et la pastille désignent donc toujours
    /// la même personne.
    private func refreshTypingDerivations(for conversationId: String) {
        onSelectionChanged?(conversationId, Self.typingSelection(for: typers[conversationId]))
    }
}
