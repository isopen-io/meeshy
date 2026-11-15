import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// Les SIGNAUX chiffrés d'une conversation e2ee (#13142, #13060), vus par l'app :
/// les envoyer (scellés pour chaque appareil, par la route unique), relire ceux
/// que la boîte a gardés, et les régler une fois appliqués.
nonisolated protocol EndToEndSignalingProviding: Sendable {
    /// Scelle `signal` pour les appareils de `peerUserId` et mes appareils
    /// approuvés, puis le remet par la route unique ; un 409 Sesame rechiffre.
    /// `wake` demande un réveil silencieux des destinataires, jamais le type du signal.
    func send(_ signal: E2EESignal, from userId: String, to peerUserId: String, wake: Bool) async throws -> E2EESignalReceipt
    /// Les signaux reçus et non réglés du coffre de `account` ; rien si ce n'est pas le compte de la session.
    func pendingSignals(as account: String) async -> [E2EEReceivedSignal]
    func settleSignals(_ signalIds: [String], as account: String) async
}

extension EndToEndMessagingRuntime: EndToEndSignalingProviding {
    func send(_ signal: E2EESignal, from userId: String, to peerUserId: String, wake: Bool) async throws -> E2EESignalReceipt {
        let device = try await ready(for: userId)
        guard let sealer = device.signalSealer else { throw E2EESealError.devicesMismatchUnresolved }
        let transport = signalTransport
        let conversationId = signal.conversationId
        do {
            return try await sealer.sealAndDeliver(signal, to: peerUserId) { sealed in
                try await transport.relay(sealed, conversationId: conversationId, wake: wake)
            }
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.deviceNotBound {
            forgetDevice(of: userId)
            throw error
        }
    }

    func pendingSignals(as account: String) async -> [E2EEReceivedSignal] {
        guard let inbox = await inbox(as: account) else { return [] }
        do {
            return try inbox.pending()
        } catch {
            Logger.e2ee.warning("e2ee signals unreadable: \(String(describing: type(of: error)), privacy: .public)")
            return []
        }
    }

    func settleSignals(_ signalIds: [String], as account: String) async {
        guard !signalIds.isEmpty, let inbox = await inbox(as: account) else { return }
        do {
            try inbox.settle(signalIds, at: Date())
        } catch {
            Logger.e2ee.warning("e2ee signals not settled count=\(signalIds.count, privacy: .public): \(String(describing: type(of: error)), privacy: .public)")
        }
    }

    /// La boîte du compte de la session ouverte, et de lui seul.
    private func inbox(as account: String) async -> (any E2EESignalInboxProviding)? {
        guard let owner = openAccount, owner == account else { return nil }
        return try? await ready(for: owner).signalInbox
    }
}
