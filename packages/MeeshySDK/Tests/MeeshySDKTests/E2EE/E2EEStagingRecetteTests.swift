import CryptoKit
import Foundation
import GRDB
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// Recette CROISÉE sur la vraie passerelle de STAGING (#3707, spec § 8.5 et
/// 8.6) : ce SDK Swift (libsignal Swift) échange avec un pair Node
/// (`@signalapp/libsignal-client`) par les vraies routes `/e2ee` et le vrai
/// `POST /conversations/:id/messages`. Sautée sans ses variables : elle ne
/// tourne que lancée à la main avec `TEST_RUNNER_MEESHY_TEST_LIVE_NETWORK=1`
/// et un jeton de compte de RECETTE, jamais en production.
final class E2EEStagingRecetteTests: XCTestCase {
    private struct Recette {
        let token: String
        let userId: String
        let peerUserId: String
        let conversationId: String
        let sentinel: String
        let expectedReply: String
    }

    private func recette() throws -> Recette {
        let env = ProcessInfo.processInfo.environment
        guard let token = env["MEESHY_E2EE_RECETTE_TOKEN"], let userId = env["MEESHY_E2EE_RECETTE_USER"],
              let peer = env["MEESHY_E2EE_RECETTE_PEER"], let conversation = env["MEESHY_E2EE_RECETTE_CONVERSATION"],
              let sentinel = env["MEESHY_E2EE_RECETTE_SENTINEL"], let reply = env["MEESHY_E2EE_RECETTE_REPLY"] else {
            throw XCTSkip("recette staging : variables MEESHY_E2EE_RECETTE_* absentes")
        }
        return Recette(token: token, userId: userId, peerUserId: peer, conversationId: conversation, sentinel: sentinel, expectedReply: reply)
    }

    func test_swiftAndNodeExchangeThroughStaging() async throws {
        let recette = try recette()
        let previousBase = MeeshyConfig.shared.apiBaseURL
        let previousToken = APIClient.shared.authToken
        MeeshyConfig.shared.apiBaseURL = "https://gate.staging.meeshy.me/api/v1"
        APIClient.shared.authToken = recette.token
        defer {
            MeeshyConfig.shared.apiBaseURL = previousBase
            APIClient.shared.authToken = previousToken
        }

        let vault = try E2EEGRDBRecordVault(writer: DatabaseQueue(), sealingKey: SymmetricKey(size: .bits256))
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))
        let directory = E2EEDirectoryClient()
        let registrar = E2EEDeviceRegistrar(
            identities: E2EEIdentityVault(secrets: E2EEInMemorySecretStore()), vault: vault, lock: lock,
            directory: directory, platform: .ios, label: "Recette SDK"
        )
        let enrolled = try await registrar.ensureEnrolled(userId: recette.userId)
        var failure: (any Error)?
        do {
            try await exchange(recette, enrolled: enrolled, vault: vault, lock: lock, directory: directory)
        } catch {
            failure = error
        }
        _ = try? await registrar.retire(deviceId: enrolled.device.deviceId)
        if let failure { throw failure }
    }

    private func exchange(
        _ recette: Recette, enrolled: E2EEEnrolledDevice, vault: E2EEGRDBRecordVault, lock: E2EEProcessLock, directory: E2EEDirectoryClient
    ) async throws {
        let cipher = E2EESessionCipher(
            local: enrolled.device.address, store: MeeshySignalProtocolStore(identity: enrolled.identity), vault: vault, lock: lock
        )
        let sealer = E2EEMessageSealer(local: enrolled.device, cipher: cipher, directory: directory, approvals: E2EEOwnDeviceApprovals(vault: vault))
        let opener = E2EEEnvelopeOpener(local: enrolled.device, cipher: cipher, plaintexts: E2EEPlaintextVault(vault: vault), directory: directory)
        let clientMessageId = ClientMessageId.generate()
        let content = E2EEContent(
            text: recette.sentinel, language: "fr", replyTo: nil,
            conversationId: recette.conversationId, clientMessageId: clientMessageId, sentAt: Date()
        )

        let conversationId = recette.conversationId
        let sent = try await sealer.sealAndDeliver(content, to: recette.peerUserId) { sealed in
            do {
                return try await MessageService.shared.send(conversationId: conversationId, request: .libsignal(
                    clientMessageId: clientMessageId, senderDeviceId: sealed.senderDeviceId,
                    envelopes: sealed.envelopes, unapprovedOwnDevices: sealed.unapprovedOwnDevices
                ))
            } catch let error as MeeshyError {
                if case .rejected(let rejection) = error, let mismatch = rejection.e2eeMismatch { throw mismatch }
                throw error
            }
        }
        XCTAssertFalse(sent.id.isEmpty)

        let deadline = Date().addingTimeInterval(90)
        var reply: E2EEOpenedMessage?
        while reply == nil, Date() < deadline {
            reply = try await opener.catchUp().compactMap { outcome -> E2EEOpenedMessage? in
                guard case .opened(let message) = outcome, message.senderUserId == recette.peerUserId else { return nil }
                return message
            }.first
            if reply == nil { try await Task.sleep(nanoseconds: 2_000_000_000) }
        }
        XCTAssertEqual(reply?.content.text, recette.expectedReply, "la réponse du pair Node se déchiffre dans le SDK Swift")
        XCTAssertEqual(reply?.conversationId, recette.conversationId)
    }
}
