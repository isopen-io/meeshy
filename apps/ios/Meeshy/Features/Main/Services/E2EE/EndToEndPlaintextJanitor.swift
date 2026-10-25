import Foundation
import MeeshySDK
import os

/// La file des messages effacés sur cet appareil, que la base des messages
/// tient dans la transaction de l'effacement (#13001), et le compte à qui
/// cette base appartient.
nonisolated protocol EndToEndPlaintextErasureQueue: Sendable {
    var account: String? { get }
    func pending(limit: Int) async throws -> [String]
    func acknowledge(_ keys: [String], now: Date) async throws
    func isErased(_ messageKey: String) async throws -> Bool
}

extension MessagePlaintextErasureQueue: EndToEndPlaintextErasureQueue {}

/// **Un clair E2EE effacé quitte aussi le coffre local** (#13001) : suppression
/// pour tous, retrait pour moi, éphémère échu, vue unique ouverte. Modèle de
/// menace : un appareil volé qui garderait le texte d'un message que tout le
/// monde croit parti, et un serveur compromis qui repointerait une ligne dessus.
///
/// Une suppression lancée sur cet appareil n'entre dans la file qu'une fois
/// confirmée (réponse du serveur, écho `message:deleted`, page REST) : refusée,
/// elle se rétablit avec son clair. Le coffre n'est vidé que pour le compte de
/// la base qui porte la file, et seulement s'il est le sien.
actor EndToEndPlaintextJanitor {
    static let shared = EndToEndPlaintextJanitor(
        endToEnd: EndToEndMessagingRuntime.shared,
        queue: { await DependencyContainer.shared.messagePersistence.plaintextErasures }
    )

    private static let batch = 500

    private let endToEnd: any EndToEndMessagingProviding
    private let queue: @MainActor @Sendable () async -> any EndToEndPlaintextErasureQueue

    init(
        endToEnd: any EndToEndMessagingProviding,
        queue: @escaping @MainActor @Sendable () async -> any EndToEndPlaintextErasureQueue
    ) {
        self.endToEnd = endToEnd
        self.queue = queue
    }

    /// Retire du coffre tout effacement confirmé de la file.
    func drain() async {
        let erasures = await queue()
        guard let account = erasures.account, !account.isEmpty else { return }
        do {
            while true {
                let keys = try await erasures.pending(limit: Self.batch)
                guard !keys.isEmpty, await endToEnd.erase(keys, as: account) else { return }
                try await erasures.acknowledge(keys, now: Date())
                guard keys.count == Self.batch else { return }
            }
        } catch {
            Logger.e2ee.warning("e2ee plaintext erasures deferred: \(String(describing: type(of: error)), privacy: .public)")
        }
    }

    /// Une enveloppe s'ouvre APRÈS l'effacement de son message (appareil hors
    /// ligne pendant la suppression, enveloppe encore en file) : son clair,
    /// tout juste rangé, repart aussitôt.
    func reconsider(_ messageId: String) async {
        let erasures = await queue()
        guard let account = erasures.account, !account.isEmpty,
              (try? await erasures.isErased(messageId)) == true else { return }
        _ = await endToEnd.erase([messageId], as: account)
    }
}
