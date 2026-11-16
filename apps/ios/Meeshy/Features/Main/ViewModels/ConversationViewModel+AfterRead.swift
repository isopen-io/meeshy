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
    /// Ce que la liste vide APRÈS la porte de sortie part encore avec elle
    /// (#18556) : le démontage du fil vide ses lectures acquises, l'arrière-plan
    /// les vide au rendu suivant — tous deux après `leave`.
    static let lateReadWindow: TimeInterval = 3

    private(set) var displayed: Set<String> = []
    private(set) var leftAt: Date?

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

    /// La sortie : rend ce qui a été vu et ouvre la fenêtre des lectures tardives.
    mutating func leave(at now: Date = Date()) -> [String] {
        leftAt = now
        return takeAll()
    }

    /// L'écran revient : ce qu'on y lira attend la prochaine sortie.
    mutating func resume() {
        leftAt = nil
    }

    /// Ce qu'une lecture arrivée APRÈS la sortie a retenu, dans la fenêtre.
    mutating func takeLate(at now: Date = Date()) -> [String] {
        guard let leftAt, now.timeIntervalSince(leftAt) <= Self.lateReadWindow else { return [] }
        return takeAll()
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

/// Le chemin réel : l'accusé DURABLE d'abord (l'outbox le rejoue hors ligne et
/// survit à une app tuée), puis le MÊME effet local qu'un `message:expired`
/// servi (GRDB, index média, registre, aperçu —
/// `ConversationSyncEngine.expireLocally`), puis l'envoi. Dans l'ordre
/// inverse, une sortie par l'arrière-plan perdait l'accusé quand l'app était
/// tuée pendant l'effet local, et la visite, déjà vidée, ne le rendait plus.
@MainActor
final class AfterReadConsumption: AfterReadConsumptionProviding {
    // SE-0466 : la deinit synthétisée serait isolée au MainActor (cible app) et
    // libérerait deux fois au démontage hors tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = AfterReadConsumption()

    private let enqueue: @MainActor (ConsumeAfterReadPayload) async throws -> Void
    private let expireLocally: @MainActor (_ conversationId: String, _ messageIds: [String]) async -> Void
    private let flush: @MainActor () async -> Void

    init(
        enqueue: @escaping @MainActor (ConsumeAfterReadPayload) async throws -> Void = {
            try await OfflineQueue.shared.enqueue(.consumeAfterRead, payload: $0, conversationId: $0.conversationId)
        },
        expireLocally: @escaping @MainActor (_ conversationId: String, _ messageIds: [String]) async -> Void = {
            await ConversationSyncEngine.shared.expireLocally(conversationId: $0, messageIds: $1)
        },
        flush: @escaping @MainActor () async -> Void = { await OutboxFlushTrigger.flushNow() }
    ) {
        self.enqueue = enqueue
        self.expireLocally = expireLocally
        self.flush = flush
    }

    func consume(conversationId: String, messageIds: [String]) {
        Logger.messages.info("afterRead consume conv=\(conversationId, privacy: .public) ids=\(messageIds.count, privacy: .public)")
        Task { @MainActor in await self.run(conversationId: conversationId, messageIds: messageIds) }
    }

    func run(conversationId: String, messageIds: [String]) async {
        let payload = ConsumeAfterReadPayload(conversationId: conversationId, messageIds: messageIds)
        do {
            try await enqueue(payload)
            Logger.messages.info("afterRead consume enqueued conv=\(conversationId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch {
            Logger.messages.error("consumeAfterRead enqueue failed conv=\(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
        await expireLocally(conversationId, messageIds)
        await flush()
    }
}

extension ConversationViewModel {

    /// La sortie (#8303) et ce que la liste vide après elle (#18556) : retirés du fil, puis de la base et du serveur.
    func consumeAfterReadOnExit(late: Bool = false) {
        let ids = late ? afterReadVisit.takeLate() : afterReadVisit.leave()
        if !late { Logger.messages.info("afterRead exit conv=\(self.conversationId, privacy: .public) seen=\(ids.count, privacy: .public)") }
        guard !ids.isEmpty else { return }
        messages.removeAll { ids.contains($0.id) }
        afterReadConsumer.consume(conversationId: conversationId, messageIds: ids)
    }
}
