import Foundation
import Testing
@testable import MeeshySDK

/// #14369 — le mode hybride chiffre deux fois : le clair part vers la passerelle
/// (couche serveur) et la couche appareil libsignal voyage à côté.
struct HybridDeviceLayerTests {

    private func json(_ request: SendMessageRequest) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return String(decoding: try encoder.encode(request), as: UTF8.self)
    }

    private let envelope = E2EEOutgoingEnvelope(userId: "b", deviceId: 2, registrationId: 77, type: 3, body: "Y2lwaGVy")

    @Test func withDeviceLayer_keepsTheTextAndAddsTheEnvelopes_withoutAnyCiphertextMarker() throws {
        let plain = SendMessageRequest(content: "Rendez-vous à 18 h", originalLanguage: "fr", clientMessageId: "cid_1")

        let hybrid = plain.withHybridDeviceLayer(senderDeviceId: 1, envelopes: [envelope], unapprovedOwnDevices: [], regimeEpoch: 4)

        #expect(try json(hybrid) == #"{"clientMessageId":"cid_1","content":"Rendez-vous à 18 h","encryptionMetadata":{"protocol":"libsignal-v1","regimeEpoch":4,"senderDeviceId":1},"encryptionMode":"hybrid","encryptionProtocol":"libsignal-v1","envelopes":[{"body":"Y2lwaGVy","deviceId":2,"registrationId":77,"type":3,"userId":"b"}],"originalLanguage":"fr"}"#)
    }

    @Test func withDeviceLayer_neverDeclaresTheMessageEncrypted() throws {
        let hybrid = SendMessageRequest(content: "Salut", clientMessageId: "cid_1")
            .withHybridDeviceLayer(senderDeviceId: 1, envelopes: [envelope], unapprovedOwnDevices: [3], regimeEpoch: nil)

        #expect(hybrid.isEncrypted == nil)
        #expect(hybrid.encryptedContent == nil)
        #expect(hybrid.unapprovedOwnDevices == [3])
    }

    @Test func isHybrid_readsTheModeWithoutCaseNorBlanks() {
        #expect(HybridDeviceLayer.isHybrid(" Hybrid "))
        #expect(!HybridDeviceLayer.isHybrid("server"))
        #expect(!HybridDeviceLayer.isHybrid("e2ee"))
        #expect(!HybridDeviceLayer.isHybrid(nil))
    }

    @Test func judge_sameTextServedAndSealed_isVerified() {
        #expect(HybridDeviceLayer.judge(served: "Rendez-vous à 18 h", sealed: "Rendez-vous à 18 h", edited: false) == .verified)
    }

    @Test func judge_ignoresTheBlanksThatThePasserelleTrims() {
        #expect(HybridDeviceLayer.judge(served: "Salut", sealed: "  Salut\n", edited: false) == .verified)
    }

    @Test func judge_differentText_isAMismatchCarryingTheSealedText() {
        #expect(HybridDeviceLayer.judge(served: "Rendez-vous à 20 h", sealed: "Rendez-vous à 18 h", edited: false)
            == .mismatch(deviceText: "Rendez-vous à 18 h"))
    }

    @Test func judge_editedMessage_isUnverifiable_neverAMismatch() {
        #expect(HybridDeviceLayer.judge(served: "Rendez-vous à 20 h", sealed: "Rendez-vous à 18 h", edited: true) == .unverifiable)
    }
}
