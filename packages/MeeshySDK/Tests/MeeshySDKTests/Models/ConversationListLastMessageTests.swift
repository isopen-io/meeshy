import XCTest
@testable import MeeshySDK

/// #7548 — la liste affiche toujours le bon dernier message.
///
/// Quatre défauts, un témoin chacun, écrits sur le COMPORTEMENT de la ligne :
/// 1. la course `conversation:updated` puis `message:new` faisait perdre
///    l'icône et les effets du message à la ligne ;
/// 2. le ViewModel gravait un groupe dépouillé par-dessus l'état complet du
///    moteur — deux écrivains du même groupe ;
/// 3. « Vous » ne valait pas sur tous les chemins ;
/// 4. supprimer le dernier message d'une conversation jamais ouverte VIDAIT
///    la ligne au lieu de revenir au message précédent.
final class ConversationListLastMessageTests: XCTestCase {

    private static let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeRow(
        id: String = "conv-1",
        lastMessageId: String? = "m-old",
        at: Date = ConversationListLastMessageTests.t0,
        preview: String? = "avant"
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: id,
            type: .group,
            lastMessageAt: at,
            lastMessagePreview: preview,
            lastMessageId: lastMessageId
        )
    }

    private func photoFacet(id: String = "m-new", at: Date) -> LastMessageFacet {
        LastMessageFacet(
            id: id,
            preview: "regarde",
            senderName: "Alice",
            at: at,
            attachments: [MeeshyMessageAttachment(id: "att-1")],
            attachmentCount: 1,
            isViewOnce: true
        )
    }

    /// Ce que `conversation:updated` message-driven laisse sur la ligne : le
    /// store appose l'identité, le texte et l'horodatage, et remet le reste à
    /// neutre (`adoptLastMessage`).
    private func rowAfterConversationUpdated(messageId: String, at: Date) throws -> MeeshyConversation {
        let event = ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: at,
            lastMessage: .replaced(messageId),
            lastMessagePreview: "regarde"
        )
        return try XCTUnwrap(ConversationStore.merging(makeRow(), with: event))
    }

    // MARK: - 1. La course conversation:updated → message:new

    func test_messageNewAfterConversationUpdated_forTheSameMessage_restoresAttachmentsAndEffects() throws {
        let sent = Self.t0.addingTimeInterval(60)
        let adopted = try rowAfterConversationUpdated(messageId: "m-new", at: sent)
        XCTAssertTrue(adopted.lastMessageAttachments.isEmpty, "précondition : le store a remis le groupe à neutre")

        let list = try XCTUnwrap(ConversationListLastMessage.applying(
            photoFacet(at: sent), conversationId: "conv-1", to: [adopted]
        ), "le MÊME message complète le groupe au lieu d'être jeté par la garde d'ordre")

        XCTAssertEqual(list[0].lastMessageAttachments.map(\.id), ["att-1"])
        XCTAssertEqual(list[0].lastMessageAttachmentCount, 1)
        XCTAssertTrue(list[0].lastMessageIsViewOnce)
        XCTAssertEqual(list[0].lastMessageSenderName, "Alice")
    }

    func test_olderMessageNew_forAnotherMessage_neverRegressesTheRow() {
        let row = makeRow(lastMessageId: "m-recent", at: Self.t0)
        let stale = photoFacet(id: "m-stale", at: Self.t0.addingTimeInterval(-30))

        XCTAssertNil(ConversationListLastMessage.applying(stale, conversationId: "conv-1", to: [row]))
    }

    func test_newerMessage_movesTheRowToTheTop_whileTheSameMessageKeepsItsPlace() throws {
        let first = makeRow(id: "a", lastMessageId: "m-a", at: Self.t0.addingTimeInterval(10))
        let second = makeRow(id: "conv-1", lastMessageId: "m-1", at: Self.t0)

        let bumped = try XCTUnwrap(ConversationListLastMessage.applying(
            photoFacet(id: "m-2", at: Self.t0.addingTimeInterval(20)), conversationId: "conv-1", to: [first, second]
        ))
        XCTAssertEqual(bumped.map(\.id), ["conv-1", "a"])

        let refreshed = try XCTUnwrap(ConversationListLastMessage.applying(
            photoFacet(id: "m-1", at: Self.t0), conversationId: "conv-1", to: [first, second]
        ))
        XCTAssertEqual(refreshed.map(\.id), ["a", "conv-1"],
                       "compléter un groupe ne remonte pas la ligne au-dessus d'une plus récente")
    }

    // MARK: - Accusé d'envoi : l'alias de l'optimiste

    func test_sendAck_replacesItsOptimisticRow_evenWhenTheServerClockPrecedesTheDevice() throws {
        let deviceTime = Self.t0.addingTimeInterval(5)
        let optimistic = makeRow(lastMessageId: "cid_123", at: deviceTime)
        let ack = LastMessageFacet.sent(id: "srv-1", text: "salut", at: Self.t0, youLabel: "Vous")

        let list = try XCTUnwrap(ConversationListLastMessage.applying(
            ack, conversationId: "conv-1", aliases: ["cid_123"], to: [optimistic]
        ))

        XCTAssertEqual(list[0].lastMessageId, "srv-1")
    }

    func test_sendAck_neverRegressesARowThatANewerMessageAlreadyTook() {
        let newer = makeRow(lastMessageId: "m-from-bob", at: Self.t0.addingTimeInterval(30))
        let ack = LastMessageFacet.sent(id: "srv-1", text: "salut", at: Self.t0, youLabel: "Vous")

        XCTAssertNil(ConversationListLastMessage.applying(
            ack, conversationId: "conv-1", aliases: ["cid_123"], to: [newer]
        ))
    }

    // MARK: - 2. Un seul écrivain du groupe « dernier message »

    func test_viewModelPersist_keepsTheEngineGroup_andTheViewState() throws {
        var engineRow = makeRow(lastMessageId: "m-new", at: Self.t0.addingTimeInterval(60))
        engineRow.applyLastMessage(photoFacet(at: Self.t0.addingTimeInterval(60)))
        var viewRow = makeRow(lastMessageId: "m-new", at: Self.t0.addingTimeInterval(60), preview: "regarde")
        viewRow.userState.isPinned = true

        let persisted = ConversationListLastMessage.persisting([viewRow], over: [engineRow])

        XCTAssertEqual(persisted.count, 1)
        XCTAssertEqual(persisted[0].lastMessageAttachments.map(\.id), ["att-1"],
                       "l'instantané dépouillé du ViewModel n'efface plus l'icône que le moteur a écrite")
        XCTAssertTrue(persisted[0].lastMessageIsViewOnce)
        XCTAssertTrue(persisted[0].userState.isPinned, "l'état propre au ViewModel, lui, est bien persisté")
    }

    func test_viewModelPersist_keepsARowTheCacheDoesNotKnowYet() {
        let fresh = makeRow(id: "new-dm", lastMessageId: "m-9")
        let persisted = ConversationListLastMessage.persisting([fresh], over: [makeRow()])

        XCTAssertEqual(persisted.map(\.id), ["new-dm"])
        XCTAssertEqual(persisted[0].lastMessageId, "m-9")
    }

    func test_viewModelPersist_ordersRowsByTheOwnedTimestamp() {
        let viewA = makeRow(id: "a", at: Self.t0.addingTimeInterval(100))
        let viewB = makeRow(id: "b", at: Self.t0)
        let engineB = makeRow(id: "b", lastMessageId: "m-b", at: Self.t0.addingTimeInterval(200))

        let persisted = ConversationListLastMessage.persisting([viewA, viewB], over: [engineB])

        XCTAssertEqual(persisted.map(\.id), ["b", "a"])
    }

    // MARK: - 3. « Vous » sur tous les chemins

    func test_facetOfMyOwnMessage_saysTheReaderLabel_notMyName() {
        let mine = MeeshyMessage(
            id: "m1", conversationId: "conv-1", content: "coucou",
            senderName: "Jean-Charles", isMe: true
        )

        XCTAssertEqual(LastMessageFacet(message: mine, preview: mine.content, youLabel: "Vous").senderName, "Vous")
    }

    func test_facetOfSomeoneElse_keepsTheirName() {
        let theirs = MeeshyMessage(id: "m1", conversationId: "conv-1", content: "coucou", senderName: "Alice")

        XCTAssertEqual(LastMessageFacet(message: theirs, preview: theirs.content, youLabel: "Vous").senderName, "Alice")
    }

    func test_restRowOfMyOwnMessage_saysTheReaderLabel() throws {
        let payload: [String: Any] = [
            "id": "conv-1",
            "type": "group",
            "createdAt": "2026-09-23T10:00:00Z",
            "lastMessage": [
                "id": "m1",
                "content": "coucou",
                "createdAt": "2026-09-23T10:00:00Z",
                "sender": ["id": "p1", "userId": "u-me", "displayName": "Jean-Charles"],
            ],
        ]
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let api = try decoder.decode(APIConversation.self, from: JSONSerialization.data(withJSONObject: payload))

        let row = api.toConversation(currentUserId: "u-me")

        XCTAssertEqual(row.lastMessageSenderName, ConversationListAuthor.readerLabel)
        XCTAssertEqual(api.toConversation(currentUserId: "u-other").lastMessageSenderName, "Jean-Charles")
    }

    func test_sentFacet_carriesTheNature_notAFrozenLabel() {
        let photo = MeeshyMessageAttachment(id: "att-1")
        let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Café de Flore")

        let facet = LastMessageFacet.sent(
            id: "cid_1", text: "", at: Self.t0, attachments: [photo], location: place, youLabel: "Vous"
        )

        XCTAssertEqual(facet.preview, "", "aucun « 📷 Photo » figé dans la langue de l'expéditeur")
        XCTAssertEqual(facet.attachments.map(\.id), ["att-1"], "la ligne rend le libellé depuis la nature")
        XCTAssertEqual(facet.location?.name, "Café de Flore")
        XCTAssertEqual(facet.senderName, "Vous")
    }

    // MARK: - 4. Supprimer le dernier message revient au précédent

    func test_deletingTheLastMessage_ofANeverOpenedConversation_revertsToThePreviousOne() throws {
        let row = makeRow(lastMessageId: "m-deleted", at: Self.t0.addingTimeInterval(60))
        var server = makeRow(lastMessageId: "m-previous", at: Self.t0, preview: "le précédent")
        server.lastMessageSenderName = "Bob"
        server.lastMessageAttachments = [MeeshyMessageAttachment(id: "att-prev")]
        server.lastMessageAttachmentCount = 1

        let list = try XCTUnwrap(ConversationListLastMessage.revertingDeletion(
            of: "m-deleted", conversationId: "conv-1", server: server, in: [row]
        ))

        XCTAssertEqual(list[0].lastMessageId, "m-previous")
        XCTAssertEqual(list[0].lastMessagePreview, "le précédent")
        XCTAssertEqual(list[0].lastMessageSenderName, "Bob")
        XCTAssertEqual(list[0].lastMessageAttachments.map(\.id), ["att-prev"])
        XCTAssertEqual(list[0].lastMessageAt, Self.t0, "le rang suit le message qu'elle décrit désormais")
    }

    func test_deletingTheLastMessage_whenTheServerCannotBeRead_clearsRatherThanShowingIt() throws {
        let row = makeRow(lastMessageId: "m-deleted")

        let list = try XCTUnwrap(ConversationListLastMessage.revertingDeletion(
            of: "m-deleted", conversationId: "conv-1", server: nil, in: [row]
        ))

        XCTAssertNil(list[0].lastMessageId)
        XCTAssertNil(list[0].lastMessagePreview)
    }

    func test_deletion_afterTheRowMovedOn_changesNothing() {
        let row = makeRow(lastMessageId: "m-newer")

        XCTAssertNil(ConversationListLastMessage.revertingDeletion(
            of: "m-deleted", conversationId: "conv-1", server: makeRow(lastMessageId: "m-x"), in: [row]
        ))
    }
}
