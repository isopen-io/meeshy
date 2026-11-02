import Foundation
import Testing
@testable import MeeshySDK

/// #11374 / #11381 — ce que l'en-tête DIT du chiffrement d'une conversation :
/// « de bout en bout » pour `e2ee` seul, « sur le serveur » pour `server` et
/// `hybrid` (chiffrés au repos, lus par la passerelle), rien sinon.
struct ConversationEncryptionBadgeTests {

    @Test func e2ee_seDitDeBoutEnBout() {
        #expect(ConversationEncryptionBadge(encryptionMode: "e2ee") == .endToEnd)
        #expect(ConversationEncryptionBadge(encryptionMode: " E2EE ") == .endToEnd)
    }

    @Test func serverEtHybrid_seDisentChiffresSurLeServeur() {
        #expect(ConversationEncryptionBadge(encryptionMode: "server") == .server)
        #expect(ConversationEncryptionBadge(encryptionMode: "hybrid") == .server)
        #expect(ConversationEncryptionBadge(encryptionMode: "Hybrid") == .server)
    }

    @Test func sansModeOuModeInconnu_neDitRien() {
        #expect(ConversationEncryptionBadge(encryptionMode: nil) == nil)
        #expect(ConversationEncryptionBadge(encryptionMode: "") == nil)
        #expect(ConversationEncryptionBadge(encryptionMode: "quantum") == nil)
    }

    @Test func libelles_neConfondentJamaisLesDeuxRegimes() {
        #expect(ConversationEncryptionBadge.endToEnd.localizationKey == "conversation.encryption.endToEnd")
        #expect(ConversationEncryptionBadge.endToEnd.defaultLabel == "Chiffré de bout en bout")
        #expect(ConversationEncryptionBadge.server.localizationKey == "conversation.encryption.server")
        #expect(ConversationEncryptionBadge.server.defaultLabel == "Chiffré sur le serveur")
        #expect(!ConversationEncryptionBadge.server.defaultLabel.contains("bout en bout"))
    }

    @Test func icones_distinguentLesDeuxRegimes() {
        #expect(ConversationEncryptionBadge.endToEnd.systemImage == "lock.fill")
        #expect(ConversationEncryptionBadge.server.systemImage == "lock.icloud.fill")
    }
}
