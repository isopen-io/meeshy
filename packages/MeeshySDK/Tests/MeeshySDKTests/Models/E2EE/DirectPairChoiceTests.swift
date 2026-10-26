import Foundation
import Testing
@testable import MeeshySDK

/// #13006 — deux tête-à-tête avec le même contact, l'un chiffré de bout en
/// bout, l'autre lisible par le serveur : sans précision, le CHIFFRÉ s'ouvre,
/// comme la passerelle le rend (#12966), quel que soit l'ordre de la liste.
struct DirectPairChoiceTests {

    private let peer = "00000000000000000000ab01"

    private func direct(_ id: String, peer: String, mode: String? = nil, at seconds: TimeInterval) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: id, identifier: id, type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: seconds), encryptionMode: mode
        )
        conversation.participantUserId = peer
        return conversation
    }

    private func served(_ id: String, mode: String? = nil) -> APIConversation {
        APIConversation(id: id, type: "direct", encryptionMode: mode, createdAt: Date(timeIntervalSince1970: 0))
    }

    @Test func theEndToEndDirect_winsOverAMoreRecentReadableOne() {
        let readable = direct("readable", peer: peer, at: 900)
        let sealed = direct("sealed", peer: peer, mode: "e2ee", at: 100)

        #expect(DirectPairChoice.preferred(among: [readable, sealed], with: peer)?.id == "sealed")
        #expect(DirectPairChoice.preferred(among: [sealed, readable], with: peer)?.id == "sealed")
    }

    /// Vue e2ee par le compte, servie sans mode : elle reste le chiffré (#12949).
    @Test func aDirectRememberedEndToEnd_wins_evenServedWithoutMode() {
        let readable = direct("readable", peer: peer, at: 900)
        let remembered = direct("remembered", peer: peer, at: 100)

        let chosen = DirectPairChoice.preferred(among: [readable, remembered], with: peer) { $0 == "remembered" }

        #expect(chosen?.id == "remembered")
    }

    @Test func withoutEndToEnd_theMostRecentlyActiveDirectOfThatPeer() {
        let older = direct("older", peer: peer, at: 100)
        let newer = direct("newer", peer: peer, at: 900)
        let otherPeer = direct("other", peer: "00000000000000000000ab02", mode: "e2ee", at: 999)
        var group = MeeshyConversation(id: "group", identifier: "group", type: .group, encryptionMode: "e2ee")
        group.participantUserId = peer

        #expect(DirectPairChoice.preferred(among: [older, otherPeer, group, newer], with: peer)?.id == "newer")
        #expect(DirectPairChoice.preferred(among: [otherPeer, group], with: peer) == nil)
    }

    @Test func serverAtRestModes_areReadable_notEndToEnd() {
        let atRest = direct("atRest", peer: peer, mode: "server", at: 900)
        let hybrid = direct("hybrid", peer: peer, mode: "hybrid", at: 800)

        #expect(DirectPairChoice.preferred(among: [atRest, hybrid], with: peer)?.id == "atRest")
    }

    @Test func servedDirects_theEndToEndOneFirst_elseTheServerOrder() {
        #expect(DirectPairChoice.preferred(among: [served("readable"), served("sealed", mode: "e2ee")])?.id == "sealed")
        #expect(DirectPairChoice.preferred(among: [served("recent", mode: "server"), served("older")])?.id == "recent")
        #expect(DirectPairChoice.preferred(among: []) == nil)
    }

    /// Audit M5 — servi sans mode, vu chiffré par le compte : il passe devant.
    @Test func servedDirects_aRememberedEndToEndOne_winsOverTheMoreRecent() {
        let chosen = DirectPairChoice.preferred(among: [served("readable"), served("remembered")]) { $0 == "remembered" }

        #expect(chosen?.id == "remembered")
    }

    /// Un refus E2EE posé avant tout transport ne se rejoue jamais : la file
    /// le classe définitif (#12985).
    @Test func anEndToEndRefusal_isAPermanentOutboxRejection() {
        #expect(OutboxFlusher.isPermanentServerRejection(EndToEndSendRefusal.outboxUnsealable))
        #expect(OutboxFlusher.isPermanentServerRejection(EndToEndSendRefusal.servedWithoutEndToEnd))
    }
}
