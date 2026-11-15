import Testing
import Foundation
@testable import MeeshySDK

/// #7927 — la loi pure des réactions de message reçues en temps réel.
///
/// Deux défauts mesurés à l'audit :
/// 1. ma réaction posée depuis mon AUTRE appareil arrivait keyée par mon
///    `Participant.id` alors que « c'est moi » se teste sur `currentUserId` :
///    pastille jamais surlignée, tap qui ajoutait un doublon, réaction
///    impossible à retirer d'ici ;
/// 2. le retrait par un autre participant ne trouvait pas les lignes
///    rechargées depuis REST/cache (`participantId == nil`) : le compte restait.
@Suite("ReactionLedger — réactions reçues en temps réel")
struct ReactionLedgerTests {

    private static let me = "user_me"

    private static func row(_ emoji: String, _ participantId: String?, id: String = UUID().uuidString) -> MeeshyReaction {
        MeeshyReaction(id: id, messageId: "m1", participantId: participantId, emoji: emoji)
    }

    private static func append(
        _ reactions: [MeeshyReaction], emoji: String = "👍", participantId: String?,
        ownerUserId: String?, maxCount: Int? = nil
    ) -> [MeeshyReaction]? {
        ReactionLedger.appending(
            reactions, reactionId: "r_new", messageId: "m1", emoji: emoji,
            participantId: participantId, ownerUserId: ownerUserId,
            currentUserId: me, maxCount: maxCount
        )
    }

    private static func remove(
        _ reactions: [MeeshyReaction], emoji: String = "👍", participantId: String?,
        ownerUserId: String?, aggregate: ReactionLedger.Aggregate? = nil
    ) -> [MeeshyReaction]? {
        ReactionLedger.removing(
            reactions, emoji: emoji, participantId: participantId,
            ownerUserId: ownerUserId, currentUserId: me, aggregate: aggregate
        )
    }

    // MARK: - Ajout

    @Test("ma réaction venue d'un autre appareil est keyée currentUserId — elle est MIENNE")
    func mineFromOtherDevice_isKeyedByCurrentUserId() {
        let out = Self.append([], participantId: "participant_me", ownerUserId: Self.me, maxCount: 1)
        #expect(out?.map(\.participantId) == [Self.me])
    }

    @Test("puis l'écho de la même réaction ne double pas")
    func mineEchoTwice_noDuplicate() throws {
        let first = try #require(Self.append([], participantId: "participant_me", ownerUserId: Self.me, maxCount: 1))
        #expect(Self.append(first, participantId: "participant_me", ownerUserId: Self.me, maxCount: 3) == nil)
    }

    @Test("la réaction d'un tiers garde son Participant.id")
    func otherUser_keepsParticipantId() {
        let out = Self.append([Self.row("👍", nil)], participantId: "participant_bob", ownerUserId: "user_bob", maxCount: 2)
        #expect(out?.map(\.participantId) == [nil, "participant_bob"])
    }

    @Test("le cap du serveur borne toujours l'ajout")
    func cap_stillBounds() {
        #expect(Self.append([Self.row("👍", nil)], participantId: "participant_bob", ownerUserId: "user_bob", maxCount: 1) == nil)
    }

    // MARK: - Retrait

    @Test("retrait par un tiers sur des lignes rechargées sans auteur : le compte se cale sur l'agrégat")
    func otherRemoval_onUnattributedRows_calibratesToAggregate() {
        let rows = [Self.row("👍", nil), Self.row("👍", nil), Self.row("❤️", nil)]
        let out = Self.remove(rows, participantId: "participant_bob", ownerUserId: "user_bob",
                              aggregate: .init(count: 1, participantIds: nil))
        #expect(out?.filter { $0.emoji == "👍" }.count == 1)
        #expect(out?.filter { $0.emoji == "❤️" }.count == 1)
    }

    @Test("retrait par un tiers ne touche JAMAIS ma ligne, même si l'agrégat dit zéro")
    func otherRemoval_neverTouchesMine() {
        let rows = [Self.row("👍", Self.me), Self.row("👍", nil)]
        let out = Self.remove(rows, participantId: "participant_bob", ownerUserId: "user_bob",
                              aggregate: .init(count: 0, participantIds: []))
        #expect(out?.map(\.participantId) == [Self.me])
    }

    @Test("l'agrégat ne fait jamais passer sous zéro")
    func aggregate_neverBelowZero() {
        let out = Self.remove([Self.row("👍", nil)], participantId: "participant_bob", ownerUserId: "user_bob",
                              aggregate: .init(count: -3, participantIds: nil))
        #expect(out?.isEmpty == true)
    }

    @Test("participantIds servis : une ligne attribuée à un absent de la liste part")
    func participantIds_dropStaleAttributedRows() {
        let rows = [Self.row("👍", "participant_bob"), Self.row("👍", "participant_eve")]
        let out = Self.remove(rows, participantId: "participant_zed", ownerUserId: "user_zed",
                              aggregate: .init(count: 1, participantIds: ["participant_eve"]))
        #expect(out?.map(\.participantId) == ["participant_eve"])
    }

    @Test("mon retrait depuis un autre appareil efface ma ligne")
    func myRemovalFromOtherDevice_removesMine() {
        let rows = [Self.row("👍", Self.me), Self.row("👍", nil)]
        let out = Self.remove(rows, participantId: "participant_me", ownerUserId: Self.me,
                              aggregate: .init(count: 1, participantIds: nil))
        #expect(out?.map(\.participantId) == [nil])
    }

    @Test("le retrait local explicite de ma ligne (rollback optimiste) reste possible")
    func explicitLocalRemovalOfMine_works() {
        let out = Self.remove([Self.row("👍", Self.me)], participantId: Self.me, ownerUserId: nil)
        #expect(out?.isEmpty == true)
    }

    @Test("sans agrégat, le retrait d'un tiers retire UNE ligne non attribuée")
    func noAggregate_removesOneUnattributedRow() {
        let rows = [Self.row("👍", nil), Self.row("👍", nil)]
        let out = Self.remove(rows, participantId: "participant_bob", ownerUserId: "user_bob")
        #expect(out?.count == 1)
    }

    @Test("rien à retirer ⇒ nil (aucune écriture)")
    func nothingToRemove_returnsNil() {
        let rows = [Self.row("👍", Self.me)]
        #expect(Self.remove(rows, participantId: "participant_bob", ownerUserId: "user_bob",
                            aggregate: .init(count: 1, participantIds: nil)) == nil)
    }
}
