import Foundation
import MeeshySDK

/// **Une photo reçue pendant que l'app dort rejoint l'album au réveil** (#8358).
///
/// L'enregistrement automatique (#8307) part à la réception par le socket et à
/// l'accusé de réception d'une conversation ouverte. Un message reçu par PUSH,
/// app suspendue, n'entrait dans l'album qu'à l'ouverture de SA conversation :
/// une photo reçue et jamais ouverte n'y entrait pas.
///
/// Le push NOTE ce qu'il a synchronisé ; le premier plan le VIDE vers
/// `ReceivedMediaAutoSaver.consider`, qui garde ses règles (une fois, jamais
/// un protégé, interrupteur, politique réseau). Rien ne se télécharge dans la
/// tâche silencieuse : son budget (~25 s) appartient à la synchronisation. La
/// note est persistée — un réveil peut être suivi d'une mise à mort.
@MainActor
protocol PushedMediaAutoSaving: AnyObject {
    func notePush(conversationId: String, messageId: String?)
    func drain() async
}

@MainActor
final class PushedMediaAutoSaveQueue: PushedMediaAutoSaving {
    // SE-0466 — garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = PushedMediaAutoSaveQueue()
    static let key = "meeshy.media.pushedAwaitingAutoSave.v1"
    /// Un push sans identifiant de message : toute la fenêtre de la
    /// conversation, comme à son ouverture.
    private static let wholeWindow = "*"

    private let defaults: UserDefaults
    private let saver: ReceivedMediaAutoSaving
    private let loadMessages: @MainActor (String) async -> [Message]

    init(defaults: UserDefaults = .standard,
         saver: ReceivedMediaAutoSaving? = nil,
         loadMessages: (@MainActor (String) async -> [Message])? = nil) {
        self.defaults = defaults
        self.saver = saver ?? ReceivedMediaAutoSaver.shared
        self.loadMessages = loadMessages ?? { @MainActor conversationId in
            await CacheCoordinator.shared.messages.load(for: conversationId).snapshot() ?? []
        }
    }

    func notePush(conversationId: String, messageId: String?) {
        guard !conversationId.isEmpty else { return }
        var pending = stored()
        let marker = messageId.flatMap { $0.isEmpty ? nil : $0 } ?? Self.wholeWindow
        let known = pending[conversationId] ?? []
        guard !known.contains(marker) else { return }
        pending[conversationId] = known + [marker]
        defaults.set(pending, forKey: Self.key)
    }

    func drain() async {
        let pending = stored()
        guard !pending.isEmpty else { return }
        defaults.removeObject(forKey: Self.key)
        for (conversationId, markers) in pending.sorted(by: { $0.key < $1.key }) {
            let messages = await loadMessages(conversationId)
            let wanted = Set(markers)
            let selected = wanted.contains(Self.wholeWindow) ? messages : messages.filter { wanted.contains($0.id) }
            saver.consider(selected)
        }
    }

    private func stored() -> [String: [String]] {
        defaults.dictionary(forKey: Self.key) as? [String: [String]] ?? [:]
    }
}
