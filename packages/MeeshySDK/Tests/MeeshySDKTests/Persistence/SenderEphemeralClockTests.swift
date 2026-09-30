import XCTest
import GRDB
@testable import MeeshySDK

/// **L'expéditeur d'un éphémère ne décompte qu'une fois que quelqu'un a reçu** (#8905).
///
/// Directive 2026-09-22 : un éphémère ne décompte qu'à la RÉCEPTION. Pour
/// l'expéditeur, la loi partagée (`packages/shared/utils/ephemeral-countdown.ts`)
/// donne `max D(u)` — la plus tardive des échéances de ses destinataires — et la
/// passerelle la sert : `null` tant que personne n'a reçu, puis
/// `message:countdown-started`. La ligne optimiste portait `envoi + durée` : la
/// bulle décomptait dès l'envoi et mourait AVANT celle d'un destinataire qui
/// avait reçu tard.
///
/// Chaîne PRODUIT : acteur de persistance réel, décodeur de production,
/// projection réelle. Aucun témoin ne lit l'horloge murale.
final class SenderEphemeralClockTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    private static let conversationId = "6ab16c0b67c87be0efa9a50e"
    private static let serverId = "6ab37099918d1dc34001a94d"
    private static let localId = "cid_8905"
    private static let sender = "6a9e11d7c2b84f0193ac55e1"
    private static let sentAt = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    override func tearDown() async throws {
        actor = nil
        dbQueue = nil
    }

    /// La ligne optimiste telle que l'envoi la grave : la DURÉE, aucune échéance.
    private static func optimisticRow(intent: MessageProtectionIntent) -> MessageRecord {
        MessageRecord(
            localId: localId, serverId: serverId,
            conversationId: conversationId, senderId: sender,
            content: "disparaît", originalLanguage: "fr",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: intent.lifecycleFlags.rawValue,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: sentAt, sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: sentAt,
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0,
            ephemeralDuration: intent.ephemeralDurationSeconds
        )
    }

    private func senderView() throws -> MeeshyMessage {
        let rows = try actor.messages(for: Self.conversationId, limit: 10)
        let row = try XCTUnwrap(rows.first, "la ligne doit exister en base")
        return row.toMessage(currentUserId: Self.sender)
    }

    private func state(at now: Date) throws -> EphemeralDeadline.State {
        try senderView().protection(ledger: SenderLedger(), now: now).ephemeralState
    }

    /// Tant que personne n'a reçu : la DURÉE, sans décompte — même dix minutes
    /// après l'envoi d'un message d'une minute.
    func test_sentEphemeral_awaitsReceptionUntilServed() async throws {
        try await actor.insertOptimistic(Self.optimisticRow(intent: MessageProtectionIntent(ephemeralDurationSeconds: 60)))

        XCTAssertEqual(try state(at: Self.sentAt.addingTimeInterval(600)), .awaitingReception(duration: 60),
                       "aucune réception ⇒ aucune échéance : l'envoi n'est pas une réception")
    }

    /// `message:countdown-started` : l'échéance SERVIE se grave en base et pilote
    /// seule le décompte — y compris quand elle RECULE (un second destinataire
    /// reçoit plus tard, `max D(u)` grandit).
    func test_servedDeadline_isPersistedAndFollowsTheLatestRecipient() async throws {
        try await actor.insertOptimistic(Self.optimisticRow(intent: MessageProtectionIntent(ephemeralDurationSeconds: 60)))

        let first = Self.sentAt.addingTimeInterval(300)
        let later = Self.sentAt.addingTimeInterval(900)
        let wrote = try await actor.applyServedEphemeralDeadline(messageId: Self.serverId, expiresAt: first)
        XCTAssertTrue(wrote)
        try await actor.applyServedEphemeralDeadline(messageId: Self.serverId, expiresAt: later)

        XCTAssertEqual(try senderView().expiresAt, later,
                       "l'échéance servie REMPLACE : `max D(u)` ne fait que reculer")
        XCTAssertEqual(try state(at: Self.sentAt.addingTimeInterval(400)), .running(deadline: later))
    }

    /// Une échéance identique n'écrit rien — aucune cascade de rafraîchissement.
    func test_sameServedDeadline_writesNothing() async throws {
        try await actor.insertOptimistic(Self.optimisticRow(intent: MessageProtectionIntent(ephemeralDurationSeconds: 60)))
        let deadline = Self.sentAt.addingTimeInterval(300)
        try await actor.applyServedEphemeralDeadline(messageId: Self.localId, expiresAt: deadline)

        let again = try await actor.applyServedEphemeralDeadline(messageId: Self.localId, expiresAt: deadline)
        XCTAssertFalse(again)
    }

    /// L'écho `message:new` (sans échéance, contrat #7451 point 4) ne ramène
    /// aucune horloge client et n'efface pas l'échéance servie.
    func test_socketEcho_keepsTheServedDeadline() async throws {
        try await actor.insertOptimistic(Self.optimisticRow(intent: MessageProtectionIntent(ephemeralDurationSeconds: 60)))
        let served = Self.sentAt.addingTimeInterval(300)
        try await actor.applyServedEphemeralDeadline(messageId: Self.serverId, expiresAt: served)

        let echo = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data("""
        {"id":"\(Self.serverId)","conversationId":"\(Self.conversationId)","senderId":"\(Self.sender)",
         "content":"disparaît","messageType":"text","messageSource":"user",
         "effectFlags":1,"ephemeralDuration":60,"isEncrypted":false,
         "createdAt":"2027-01-15T08:00:00.000Z","updatedAt":"2027-01-15T08:00:00.000Z"}
        """.utf8))
        try await actor.upsertFromAPIMessages([echo])

        XCTAssertEqual(try senderView().expiresAt, served)
    }

    /// La ligne de liste de MON envoi porte la DURÉE, jamais une échéance.
    func test_sentFacet_carriesTheDurationNotADeadline() {
        let facet = LastMessageFacet.sent(id: Self.localId, text: "disparaît", at: Self.sentAt, ephemeralDuration: 60)
        XCTAssertNil(facet.expiresAt)
        XCTAssertEqual(facet.nature?.ephemeralDuration, 60)
    }
}

/// L'expéditeur n'a ni réception ni mort gravée.
private struct SenderLedger: EphemeralReceiptRecording {
    func firstReception(of messageId: String) -> Date? { nil }
    @discardableResult
    func noteReception(of messageId: String, at date: Date) -> Date { date }
    func destruction(of messageId: String) -> Date? { nil }
    func noteDestruction(of messageId: String, at date: Date) {}
}
