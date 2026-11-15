import Foundation
import MeeshySDK
import os

// MARK: - La flamme-œil : ce qu'on a lu disparaît quand on quitte (#8303)

/// **Ce qu'un lecteur a VU d'une flamme-œil pendant sa visite** (#8303).
///
/// Directive porteur 2026-09-27 : « une flamme avec un œil qui permet de faire
/// disparaître un message après avoir été vu et quitté la conversation ». La
/// disparition est PAR LECTEUR (contrat #8302) : seuls les messages REÇUS
/// comptent — l'expéditeur garde le sien jusqu'à ce que tous l'aient vu —, et
/// seulement ceux qui ont été AFFICHÉS : un message resté hors écran n'a pas
/// été lu, il ne part pas.
///
/// Valeur pure : elle ne connaît ni l'écran ni le réseau. Le ViewModel l'alimente
/// depuis la même preuve d'affichage que les accusés de lecture, et la vide à la
/// sortie.
struct AfterReadVisit: Equatable {
    private(set) var displayed: Set<String> = []

    /// Retient, parmi `ids`, les flammes-œil REÇUES de `messages`.
    mutating func note<S: Sequence>(displayed ids: S, among messages: [Message]) where S.Element == String {
        let shown = Set(ids)
        guard !shown.isEmpty else { return }
        for message in messages where shown.contains(message.id) && Self.isConsumable(message) {
            displayed.insert(message.id)
        }
    }

    /// Retient TOUTES les flammes-œil reçues — les modes qui ne rendent pas
    /// bulle par bulle (Résumé, Rivière) prouvent la lecture autrement.
    mutating func noteAll(among messages: [Message]) {
        note(displayed: messages.map(\.id), among: messages)
    }

    /// Rend ce qui a été vu, et oublie : la seconde porte de sortie ne trouve
    /// plus rien.
    mutating func takeAll() -> [String] {
        defer { displayed.removeAll() }
        return displayed.sorted()
    }

    static func isConsumable(_ message: Message) -> Bool {
        !message.isMe
            && message.deletedAt == nil
            && message.effects.flags.contains(.ephemeralAfterRead)
    }
}

/// **Ce que la sortie fait des flammes-œil lues** — l'effet local ET l'accusé.
@MainActor
protocol AfterReadConsumptionProviding {
    func consume(conversationId: String, messageIds: [String])
}

/// Le chemin réel : le MÊME effet local qu'un `message:expired` servi (GRDB,
/// index média, registre, aperçu — `ConversationSyncEngine.expireLocally`),
/// puis la consommation serveur par l'outbox, qui la rejoue hors ligne.
@MainActor
final class AfterReadConsumption: AfterReadConsumptionProviding {
    // SE-0466 : la deinit synthétisée serait isolée au MainActor (cible app) et
    // libérerait deux fois au démontage hors tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = AfterReadConsumption()

    func consume(conversationId: String, messageIds: [String]) {
        Task { @MainActor in
            await ConversationSyncEngine.shared.expireLocally(conversationId: conversationId, messageIds: messageIds)
            let payload = ConsumeAfterReadPayload(conversationId: conversationId, messageIds: messageIds)
            do {
                try await OfflineQueue.shared.enqueue(.consumeAfterRead, payload: payload, conversationId: conversationId)
                await OutboxFlushTrigger.flushNow()
            } catch {
                Logger.messages.error("consumeAfterRead enqueue failed conv=\(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}

extension ConversationViewModel {

    /// La sortie de la conversation : les flammes-œil lues quittent le fil tout
    /// de suite, puis la base et le serveur (#8303).
    func consumeAfterReadOnExit() {
        let ids = afterReadVisit.takeAll()
        guard !ids.isEmpty else { return }
        let gone = Set(ids)
        messages.removeAll { gone.contains($0.id) }
        afterReadConsumer.consume(conversationId: conversationId, messageIds: ids)
    }
}
