import XCTest
@testable import MeeshySDK

/// Recette iOS de la liste des conversations du 2026-09-23 (#7549) : ce que la
/// ligne doit dire, quel que soit le chemin par lequel l'événement arrive.
///
/// - #7612 : mon message envoyé depuis un autre client se lit « Vous », même
///   quand `conversation:updated` nomme l'expéditeur par son id de PARTICIPANT ;
/// - #7615 / #7616 : la dernière réaction et l'appel en cours écrits par le
///   moteur survivent à la persistance du ViewModel ;
/// - #7614 : le décompte d'un éphémère ne réveille la ligne qu'aux instants où
///   son libellé change.
final class ConversationListRecetteTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_790_000_000)

    private func wireDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = WireDate.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
            }
            return date
        }
        return decoder
    }

    private func row() -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .group, lastMessageAt: t0,
            lastMessagePreview: "avant", lastMessageId: "m-0"
        )
        conversation.lastMessageSenderName = "Alice"
        return conversation
    }

    private func event(_ body: [String: Any]) throws -> ConversationUpdatedEvent {
        let payload = body.merging(["conversationId": "conv-1", "updatedAt": "2026-09-23T14:22:00.000Z"]) { given, _ in given }
        return try wireDecoder().decode(ConversationUpdatedEvent.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    private func merged(_ body: [String: Any]) throws -> MeeshyConversation {
        let storeEvent = ConversationStoreSocketBridge.mapConversationUpdated(try event(body), readerId: "u-me")
        return try XCTUnwrap(ConversationStore.merging(row(), with: storeEvent))
    }

    // MARK: - #7612 — « Vous », même nommé par un id de participant

    func test_merging_myMessageNamedByParticipantId_saysTheReaderLabel() throws {
        let conversation = try merged([
            "updatedBy": ["id": "u-me"],
            "senderId": "p-me",
            "lastMessageId": "m-new",
            "lastMessageAt": WireDate.string(from: t0.addingTimeInterval(60)),
            "lastMessagePreview": "Bonjour à tous",
            "lastMessageSenderName": "Demo",
        ])

        XCTAssertEqual(conversation.lastMessageSenderName, ConversationListAuthor.readerLabel)
    }

    func test_merging_someoneElsesMessage_keepsTheServedName() throws {
        let conversation = try merged([
            "updatedBy": ["id": "u-bob"],
            "senderId": "p-bob",
            "lastMessageId": "m-new",
            "lastMessageAt": WireDate.string(from: t0.addingTimeInterval(60)),
            "lastMessagePreview": "Salut",
            "lastMessageSenderName": "Bob",
        ])

        XCTAssertEqual(conversation.lastMessageSenderName, "Bob")
    }

    func test_merging_recalculatedPreviewTriggeredByMe_keepsTheAuthorOfTheRemainingMessage() throws {
        let conversation = try merged([
            "updatedBy": ["id": "u-me"],
            "senderId": "p-bob",
            "previewRecalculated": true,
            "lastMessageId": "m-older",
            "lastMessageAt": WireDate.string(from: t0.addingTimeInterval(-60)),
            "lastMessagePreview": "Salut",
            "lastMessageSenderName": "Bob",
        ])

        XCTAssertEqual(conversation.lastMessageSenderName, "Bob",
                       "supprimer le dernier message ne fait pas de moi l'auteur du précédent")
    }

    func test_merging_activityTriggeredByMe_neverRenamesTheAuthor() throws {
        let conversation = try merged([
            "updatedBy": ["id": "u-me"],
            "activeCall": ["id": "call-1", "kind": "audio", "participantCount": 1,
                           "startedAt": WireDate.string(from: t0.addingTimeInterval(30))],
        ])

        XCTAssertEqual(conversation.lastMessageSenderName, "Alice")
    }

    func test_messageSenderUserId_isTheActorOnlyForAMessageDrivenEvent() throws {
        let messageDriven = try event(["updatedBy": ["id": "u-me"], "senderId": "p-me", "lastMessageId": "m-new"])
        let recalculated = try event(["updatedBy": ["id": "u-me"], "lastMessageId": "m-new", "previewRecalculated": true])
        let metadata = try event(["updatedBy": ["id": "u-me"], "title": "Nouveau nom"])

        XCTAssertEqual(messageDriven.messageSenderUserId, "u-me")
        XCTAssertNil(recalculated.messageSenderUserId)
        XCTAssertNil(metadata.messageSenderUserId)
    }

    // MARK: - #7952 — la traduction du MÊME message ne reprend pas « Vous »

    /// Mesuré sur staging le 2026-09-25 : après le `conversation:updated` de
    /// l'envoi (`updatedBy` = mon id UTILISATEUR ⇒ « Vous »), chaque traduction
    /// qui aboutit ré-émet le MÊME message en `previewRecalculated`, avec
    /// `updatedBy` et `senderId` = mon id de PARTICIPANT et
    /// `lastMessageSenderName` = mon nom. Rien n'y prouve « moi », et le nom
    /// servi remplaçait « Vous » — pour toujours, la relecture `/sync` ne
    /// retouchant pas le dernier message d'une ligne dont l'identité n'a pas bougé.
    private func myMessageRow() -> MeeshyConversation {
        var conversation = row()
        conversation.lastMessageId = "m-mine"
        conversation.lastMessageSenderName = ConversationListAuthor.readerLabel
        return conversation
    }

    private let translationOfMyMessage: [String: Any] = [
        "updatedBy": ["id": "p-me"],
        "senderId": "p-me",
        "previewRecalculated": true,
        "lastMessageId": "m-mine",
        "lastMessagePreview": "Bonjour à tous",
        "lastMessageTranslations": ["en": "Hello everyone"],
        "lastMessageOriginalLanguage": "fr",
        "lastMessageSenderName": "Demo",
    ]

    func test_merging_translationOfMyOwnMessage_keepsTheReaderLabel() throws {
        var body = translationOfMyMessage
        body["lastMessageAt"] = WireDate.string(from: t0)
        let storeEvent = ConversationStoreSocketBridge.mapConversationUpdated(try event(body), readerId: "u-me")

        let conversation = try XCTUnwrap(ConversationStore.merging(myMessageRow(), with: storeEvent))

        XCTAssertEqual(conversation.lastMessageSenderName, ConversationListAuthor.readerLabel)
        XCTAssertEqual(conversation.lastMessageTranslations, ["en": "Hello everyone"],
                       "le reste du payload s'applique : seul l'auteur est tenu")
    }

    func test_resolveForARow_translationOfMyOwnMessage_affirmsNothing() throws {
        let incoming = try event(translationOfMyMessage)

        let resolution = ConversationListAuthor.resolve(
            incoming, readerId: "u-me", row: myMessageRow(), youLabel: ConversationListAuthor.readerLabel
        )

        XCTAssertEqual(resolution, .unchanged)
    }

    func test_resolveForARow_anotherMessage_isNotHeldByTheReaderLabel() throws {
        var body = translationOfMyMessage
        body["lastMessageId"] = "m-bob"
        body["lastMessageSenderName"] = "Bob"
        body["updatedBy"] = ["id": "p-bob"]
        body["senderId"] = "p-bob"
        let incoming = try event(body)

        let resolution = ConversationListAuthor.resolve(
            incoming, readerId: "u-me", row: myMessageRow(), youLabel: ConversationListAuthor.readerLabel
        )

        XCTAssertEqual(resolution, .display("Bob"))
    }

    func test_resolveForARow_myMessageNamedByParticipantId_saysYou() throws {
        let incoming = try event([
            "updatedBy": ["id": "u-me"], "senderId": "p-me", "lastMessageId": "m-new", "lastMessageSenderName": "Demo",
        ])

        let resolution = ConversationListAuthor.resolve(incoming, readerId: "u-me", row: row(), youLabel: "Vous")

        XCTAssertEqual(resolution, .display("Vous"))
    }

    // MARK: - #7615 / #7616 — l'activité survit à la persistance du ViewModel

    private var call: ConversationActiveCall {
        ConversationActiveCall(id: "call-1", kind: "audio", participantCount: 1, startedAt: t0.addingTimeInterval(30))
    }

    private var reaction: ConversationLastReaction {
        ConversationLastReaction(
            emoji: "👍", reactorId: "p-b", reactorUserId: "u-b", reactorName: "Recette Ios", messageId: "m-0",
            targetSenderId: "p-me", targetSenderUserId: "u-me", excerpt: "avant", excerptOriginalLanguage: "fr",
            excerptTranslations: nil, excerptProtection: nil, createdAt: t0.addingTimeInterval(120)
        )
    }

    func test_persisting_keepsTheActiveCallTheEngineWrote_overAStaleViewRow() {
        var engineRow = row()
        engineRow.activeCall = call
        let viewRow = row()

        let persisted = ConversationListLastMessage.persisting([viewRow], over: [engineRow])

        XCTAssertEqual(persisted.first?.activeCall, call)
    }

    func test_persisting_keepsTheLastReactionTheEngineWrote_overAStaleViewRow() {
        var engineRow = row()
        engineRow.lastReaction = reaction
        engineRow.lastReactionTargetsReader = true
        let viewRow = row()

        let persisted = ConversationListLastMessage.persisting([viewRow], over: [engineRow])

        XCTAssertEqual(persisted.first?.lastReaction, reaction)
        XCTAssertEqual(persisted.first?.lastReactionTargetsReader, true)
    }

    func test_persisting_anEndedCallInTheCache_isNotResurrectedByTheViewRow() {
        let engineRow = row()
        var viewRow = row()
        viewRow.activeCall = call

        let persisted = ConversationListLastMessage.persisting([viewRow], over: [engineRow])

        XCTAssertNil(persisted.first?.activeCall)
    }

    // MARK: - #7614 — le décompte ne réveille la ligne que quand il change

    func test_nextChange_farFromTheDeadline_wakesAtTheNextMinuteBoundary() {
        let deadline = t0.addingTimeInterval(4 * 60 + 30)

        XCTAssertEqual(ConversationPreviewCountdown.nextChange(after: t0, deadline: deadline),
                       deadline.addingTimeInterval(-4 * 60))
    }

    func test_nextChange_justBeforeTheLastMinute_wakesAtTheThreshold() {
        let deadline = t0.addingTimeInterval(90)

        XCTAssertEqual(ConversationPreviewCountdown.nextChange(after: t0, deadline: deadline),
                       deadline.addingTimeInterval(-60))
    }

    func test_nextChange_inTheLastMinute_wakesOnlyAtTheDeadline() {
        let deadline = t0.addingTimeInterval(51)

        XCTAssertEqual(ConversationPreviewCountdown.nextChange(after: t0, deadline: deadline), deadline)
    }

    func test_nextChange_afterTheDeadline_neverWakesAgain() {
        XCTAssertNil(ConversationPreviewCountdown.nextChange(after: t0, deadline: t0))
        XCTAssertNil(ConversationPreviewCountdown.nextChange(after: t0, deadline: t0.addingTimeInterval(-5)))
    }

    func test_showsSeconds_onlyInTheLastMinute() {
        XCTAssertTrue(ConversationPreviewCountdown.showsSeconds(at: t0, deadline: t0.addingTimeInterval(60)))
        XCTAssertTrue(ConversationPreviewCountdown.showsSeconds(at: t0, deadline: t0.addingTimeInterval(1)))
        XCTAssertFalse(ConversationPreviewCountdown.showsSeconds(at: t0, deadline: t0.addingTimeInterval(61)))
        XCTAssertFalse(ConversationPreviewCountdown.showsSeconds(at: t0, deadline: t0))
    }
}
