import Foundation
import Testing
@testable import MeeshySDK

/// #11164 — la liste nommait le LECTEUR à la place de son interlocuteur.
///
/// Une conversation directe porte le nom et l'avatar de l'AUTRE participant,
/// élu contre l'identifiant du lecteur. Quand cet identifiant est vide (session
/// dont le profil n'est pas encore chargé), « celui qui n'est pas le lecteur »
/// devenait le PREMIER participant servi — le plus souvent le lecteur lui-même,
/// créateur de la conversation. La ligne se gravait ainsi sous son propre nom et
/// son propre avatar, et aucune synchronisation ne la réparait : `/sync`
/// avançait le titre sans l'avatar, la route riche remplaçait la ligne par ce
/// qu'elle venait d'élire.
@Suite("L'interlocuteur d'un direct")
struct DirectInterlocutorTests {

    private static let readerId = "68f33afa8ae497b2054c84d7"
    private static let peerId = "6ad65e870d750c3615db0597"

    private func decode(_ payload: [String: Any]) throws -> APIConversation {
        let data = try JSONSerialization.data(withJSONObject: payload)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversation.self, from: data)
    }

    /// L'ordre de la production : le lecteur, créateur du direct, est servi en premier.
    private func directServedReaderFirst(lastSenderIsReader: Bool = true) -> [String: Any] {
        let sender: [String: Any] = lastSenderIsReader
            ? ["id": "p-reader", "userId": Self.readerId, "displayName": "J. Charles N. M."]
            : ["id": "p-peer", "userId": Self.peerId, "displayName": "Mc"]
        return [
            "id": "6ad677020d750c3615db2234",
            "type": "direct",
            "createdAt": "2026-10-19T20:01:06Z",
            "participants": [
                ["id": "p-reader", "userId": Self.readerId, "displayName": "J. Charles N. M.", "avatar": "/me.webp"],
                ["id": "p-peer", "userId": Self.peerId, "displayName": "Mc", "avatar": "/mc.webp"],
            ],
            "lastMessage": [
                "id": "m1",
                "content": "Bonjour!",
                "createdAt": "2026-10-20T08:52:44Z",
                "sender": sender,
            ],
        ]
    }

    private func row(
        id: String = "6ad677020d750c3615db2234",
        type: MeeshyConversation.ConversationType = .direct,
        title: String?,
        participantUserId: String?,
        avatar: String?
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: id, identifier: "direct", type: type,
            lastMessageAt: Date(timeIntervalSince1970: 1_000), unreadCount: 0,
            participantUserId: participantUserId, participantAvatarURL: avatar
        )
        conversation.title = title
        return conversation
    }

    // MARK: - L'élection, à la conversion

    @Test("un lecteur connu voit son interlocuteur, même servi en second")
    func knownReaderSeesThePeer() throws {
        let conversation = try decode(directServedReaderFirst()).toConversation(currentUserId: Self.readerId)

        #expect(conversation.title == "Mc")
        #expect(conversation.participantUserId == Self.peerId)
        #expect(conversation.participantAvatarURL == "/mc.webp")
    }

    @Test("un lecteur inconnu n'élit personne : la ligne ne prend ni son nom ni son avatar")
    func unknownReaderElectsNobody() throws {
        let conversation = try decode(directServedReaderFirst()).toConversation(currentUserId: "")

        #expect(conversation.title != "J. Charles N. M.")
        #expect(conversation.participantUserId == nil)
        #expect(conversation.participantAvatarURL == nil)
    }

    @Test("un lecteur inconnu ne prend pas l'expéditeur du dernier message pour l'interlocuteur")
    func unknownReaderDoesNotNameTheLastSender() throws {
        var payload = directServedReaderFirst()
        payload["participants"] = nil

        let conversation = try decode(payload).toConversation(currentUserId: "")

        #expect(conversation.title == "Conversation")
    }

    // MARK: - La fusion d'une ligne `/sync`

    @Test("une ligne /sync qui élit l'interlocuteur répare le titre ET l'avatar d'une ligne gravée sous le lecteur")
    func syncRowHealsTitleAndAvatarTogether() {
        let corrupted = row(title: "J. Charles N. M.", participantUserId: Self.readerId, avatar: "/me.webp")
        let served = row(title: "Mc", participantUserId: Self.peerId, avatar: "/mc.webp")

        let merged = ConversationDeltaRules.fusionneLigneDeSync(existante: corrupted, recue: served)

        #expect(merged.title == "Mc")
        #expect(merged.participantUserId == Self.peerId)
        #expect(merged.participantAvatarURL == "/mc.webp")
    }

    @Test("une ligne /sync sans interlocuteur élu n'efface pas celui que le cache connaît")
    func unresolvedSyncRowKeepsTheKnownPeer() {
        let known = row(title: "Mc", participantUserId: Self.peerId, avatar: "/mc.webp")
        let served = row(title: "Conversation", participantUserId: nil, avatar: nil)

        let merged = ConversationDeltaRules.fusionneLigneDeSync(existante: known, recue: served)

        #expect(merged.title == "Mc")
        #expect(merged.participantUserId == Self.peerId)
        #expect(merged.participantAvatarURL == "/mc.webp")
    }

    @Test("le titre d'un groupe servi par /sync avance toujours")
    func groupTitleStillAdvances() {
        let known = row(type: .group, title: "Équipe", participantUserId: nil, avatar: nil)
        let served = row(type: .group, title: "Équipe renommée", participantUserId: nil, avatar: nil)

        let merged = ConversationDeltaRules.fusionneLigneDeSync(existante: known, recue: served)

        #expect(merged.title == "Équipe renommée")
    }

    // MARK: - La réécriture par la route riche

    @Test("une ligne riche sans interlocuteur élu garde celui que le cache connaît")
    func unresolvedRichRowKeepsTheKnownPeer() {
        let known = row(title: "Mc", participantUserId: Self.peerId, avatar: "/mc.webp")
        let served = row(title: "Conversation", participantUserId: nil, avatar: nil)

        let merged = ConversationDeltaRules.mergeDeltaConversations(existing: [known], deltas: [served]).merged

        #expect(merged.first?.title == "Mc")
        #expect(merged.first?.participantUserId == Self.peerId)
        #expect(merged.first?.participantAvatarURL == "/mc.webp")
    }

    // MARK: - La réparation du cache déjà gravé

    @Test("un direct gravé sous le lecteur perd l'identité fausse et fixe l'horizon de sa resynchronisation")
    func corruptedRowIsClearedAndResynced() throws {
        var corrupted = row(title: "J. Charles N. M.", participantUserId: Self.readerId, avatar: "/me.webp")
        corrupted.updatedAt = Date(timeIntervalSince1970: 5_000)
        var healthy = row(id: "6ad4e3c90d750c3615da78de", title: "Andynjanjo", participantUserId: Self.peerId, avatar: "/andy.webp")
        healthy.updatedAt = Date(timeIntervalSince1970: 1_000)

        let reparation = try #require(
            ConversationDeltaRules.reparationDesInterlocuteurs([corrupted, healthy], readerId: Self.readerId)
        )

        let cleared = try #require(reparation.liste.first { $0.id == corrupted.id })
        #expect(cleared.title != "J. Charles N. M.")
        #expect(cleared.participantUserId == nil)
        #expect(cleared.participantAvatarURL == nil)
        #expect(reparation.liste.first { $0.id == healthy.id } == healthy)
        #expect(reparation.horizon < corrupted.updatedAt)
    }

    @Test("rien à réparer quand aucun direct n'est gravé sous le lecteur, ni quand le lecteur est inconnu")
    func nothingToRepair() {
        let healthy = row(title: "Mc", participantUserId: Self.peerId, avatar: "/mc.webp")
        let corrupted = row(title: "J. Charles N. M.", participantUserId: Self.readerId, avatar: "/me.webp")

        #expect(ConversationDeltaRules.reparationDesInterlocuteurs([healthy], readerId: Self.readerId) == nil)
        #expect(ConversationDeltaRules.reparationDesInterlocuteurs([corrupted], readerId: "") == nil)
    }

    @Test("une ligne riche qui élit l'interlocuteur remplace celle gravée sous le lecteur")
    func resolvedRichRowReplacesTheCorruptedOne() {
        let corrupted = row(title: "J. Charles N. M.", participantUserId: Self.readerId, avatar: "/me.webp")
        let served = row(title: "Mc", participantUserId: Self.peerId, avatar: "/mc.webp")

        let merged = ConversationDeltaRules.mergeDeltaConversations(existing: [corrupted], deltas: [served]).merged

        #expect(merged.first?.title == "Mc")
        #expect(merged.first?.participantAvatarURL == "/mc.webp")
    }
}
