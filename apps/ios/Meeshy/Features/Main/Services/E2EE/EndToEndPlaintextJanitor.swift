import Foundation
import MeeshySDK
import os

/// La file des messages effacés sur cet appareil, que la base des messages
/// tient dans la transaction de l'effacement (#13001).
nonisolated protocol EndToEndPlaintextErasureQueue: Sendable {
    func pendingPlaintextErasures(recordedBefore: Date, limit: Int) async throws -> [String]
    func oldestPendingPlaintextErasure() async throws -> Date?
    func acknowledgePlaintextErasures(_ keys: [String]) async throws
}

extension MessagePersistenceActor: EndToEndPlaintextErasureQueue {}

/// **Un clair E2EE effacé quitte aussi le coffre local** (#13001) : suppression
/// pour tous, retrait pour moi, éphémère échu, vue unique ouverte. Modèle de
/// menace : un appareil volé qui garderait le texte d'un message que tout le
/// monde croit parti, et un serveur compromis qui repointerait une ligne dessus.
///
/// L'effacement attend `grace` : une suppression qui échoue sur le réseau se
/// rétablit (`markUndeleted` retire son inscription) sans avoir perdu son
/// clair. Hors d'une session ouverte pour le compte du coffre, rien n'est
/// retiré et la file attend la suivante.
actor EndToEndPlaintextJanitor {
    static let shared = EndToEndPlaintextJanitor(
        endToEnd: EndToEndMessagingRuntime.shared,
        queue: { DependencyContainer.shared.messagePersistence }
    )

    static let grace: TimeInterval = 30
    private static let batch = 500

    private let endToEnd: any EndToEndMessagingProviding
    private let queue: @MainActor @Sendable () -> any EndToEndPlaintextErasureQueue
    private let now: @Sendable () -> Date
    private var scheduled: Task<Void, Never>?

    init(
        endToEnd: any EndToEndMessagingProviding,
        queue: @escaping @MainActor @Sendable () -> any EndToEndPlaintextErasureQueue,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.endToEnd = endToEnd
        self.queue = queue
        self.now = now
    }

    /// Retire du coffre tout effacement sorti de sa grâce, puis se reprogramme
    /// pour le suivant.
    func drain() async {
        let erasures = await queue()
        do {
            while true {
                let keys = try await erasures.pendingPlaintextErasures(
                    recordedBefore: now().addingTimeInterval(-Self.grace), limit: Self.batch
                )
                guard !keys.isEmpty else { break }
                guard await endToEnd.erase(keys) else { return }
                try await erasures.acknowledgePlaintextErasures(keys)
                guard keys.count == Self.batch else { break }
            }
            let oldest = try await erasures.oldestPendingPlaintextErasure()
            scheduleNext(after: oldest)
        } catch {
            Logger.e2ee.warning("e2ee plaintext erasures deferred: \(String(describing: type(of: error)), privacy: .public)")
        }
    }

    private func scheduleNext(after oldest: Date?) {
        scheduled?.cancel()
        guard let oldest else { return }
        let wait = max(0, oldest.addingTimeInterval(Self.grace).timeIntervalSince(now())) + 1
        scheduled = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(wait)) } catch { return }
            await self?.drain()
        }
    }
}
