import XCTest
import GRDB
@testable import MeeshySDK

/// **HORS LIGNE, UNE RÉPONSE MEURT SUR L'APPAREIL AVEC CE QU'ELLE CITE** (#10433,
/// suite de #8686 ; règle serveur #8630, `quoteCascade.ts`) — la part iOS, sur
/// les MÊMES cas que `apps/web/src/lib/view/quote-cascade.test.ts`.
///
/// Le fil retirait l'éphémère échu à son échéance locale, mais ses réponses
/// restaient — jusqu'au `message:expired` que la passerelle n'envoie qu'en
/// ligne, ou jusqu'au rechargement. Et une réponse à VUE UNIQUE non éphémère
/// n'avait AUCUNE échéance lisible : elle survivait à la mort de la flamme-œil
/// qu'elle cite.
final class QuoteCascadeTests: XCTestCase {

    private static let t0 = Date(timeIntervalSince1970: 1_791_885_600)
    private static let minute: TimeInterval = 60
    private static let afterRead: MessageEffectFlags = [.ephemeral, .ephemeralAfterRead]

    // MARK: - Fabriques

    private struct FixedLedger: EphemeralReceiptRecording {
        var receptions: [String: Date] = [:]
        var destructions: [String: Date] = [:]
        func firstReception(of messageId: String) -> Date? { receptions[messageId] }
        func noteReception(of messageId: String, at date: Date) -> Date { receptions[messageId] ?? date }
        func destruction(of messageId: String) -> Date? { destructions[messageId] }
        func noteDestruction(of messageId: String, at date: Date) {}
    }

    private static func message(
        id: String, deletedAt: Date? = nil, replyToId: String? = nil, expiresAt: Date? = nil,
        flags: MessageEffectFlags = [], duration: Int? = nil, replyTo: ReplyReference? = nil, isMe: Bool = false
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: id, conversationId: "c-a", senderId: isMe ? "u-viewer" : "u-other", content: "Code 4521",
            deletedAt: deletedAt, replyToId: replyToId ?? replyTo?.messageId, expiresAt: expiresAt,
            effects: MessageEffects(flags: flags, ephemeralDuration: duration),
            replyTo: replyTo, isMe: isMe
        )
    }

    private static func ephemeral(id: String = "m-eph", isMe: Bool = false) -> MeeshyMessage {
        message(id: id, flags: [.ephemeral], duration: 60, isMe: isMe)
    }

    private static func flameEye(id: String = "m-flamme", isMe: Bool = false) -> MeeshyMessage {
        message(id: id, flags: afterRead, isMe: isMe)
    }

    private static func quote(of id: String, nature: ContentExitLaw.Nature? = nil, expiresAt: Date? = nil) -> ReplyReference {
        var reference = ReplyReference(messageId: id, authorName: "Bob", previewText: "Code 4521")
        reference.quotedExitNature = nature
        reference.quotedExpiresAt = expiresAt
        return reference
    }

    private static func reply(
        to quoted: String, id: String = "m-reply", quote: ReplyReference? = nil, flags: MessageEffectFlags = []
    ) -> MeeshyMessage {
        message(id: id, replyToId: quoted, flags: flags, replyTo: quote ?? Self.quote(of: quoted))
    }

    /// L'échéance d'une rangée pour ce lecteur, citations comprises.
    private static func deadline(of target: MeeshyMessage, in thread: [MeeshyMessage], ledger: FixedLedger, now: Date) -> Date? {
        let rows = Dictionary(thread.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return QuoteCascade.deadline(of: QuoteCascade.link(for: target, ledger: ledger, now: now)) { id in
            rows[id].map { QuoteCascade.link(for: $0, ledger: ledger, now: now) }
        }
    }

    private static func living(_ thread: [MeeshyMessage], ledger: FixedLedger, now: Date) -> [String] {
        thread.filter { row in deadline(of: row, in: thread, ledger: ledger, now: now).map { $0 > now } ?? true }.map(\.id)
    }

    // MARK: - Le fil retire une réponse quand ce qu'elle cite meurt chez ce lecteur, sans réseau

    func test_aLocallyElapsedEphemeral_takesItsReply_atTheSameDeadline() {
        let ledger = FixedLedger(receptions: ["m-eph": Self.t0])
        let thread = [Self.ephemeral(), Self.reply(to: "m-eph")]

        XCTAssertEqual(Self.living(thread, ledger: ledger, now: Self.t0 + Self.minute - 1), ["m-eph", "m-reply"])
        XCTAssertEqual(Self.living(thread, ledger: ledger, now: Self.t0 + Self.minute), [])
        XCTAssertEqual(Self.deadline(of: thread[1], in: thread, ledger: ledger, now: Self.t0), Self.t0 + Self.minute)
    }

    func test_deathDescendsTheChain_theReplyToTheReplyGoesToo() {
        let ledger = FixedLedger(receptions: ["m-eph": Self.t0])
        let thread = [Self.ephemeral(), Self.reply(to: "m-eph"), Self.reply(to: "m-reply", id: "m-reply-2")]

        XCTAssertEqual(Self.living(thread, ledger: ledger, now: Self.t0 + Self.minute), [])
    }

    func test_anEphemeralOutOfTheThread_stillTakesItsReply_throughTheEmbeddedQuote() {
        let burned = FixedLedger(destructions: ["m-eph": Self.t0 + Self.minute])
        let byDestruction = [Self.reply(to: "m-eph", quote: Self.quote(of: "m-eph", nature: .timedFlame))]
        let served = [Self.reply(to: "m-eph", quote: Self.quote(of: "m-eph", expiresAt: Self.t0 + Self.minute))]

        XCTAssertEqual(Self.living(byDestruction, ledger: burned, now: Self.t0 + Self.minute), [])
        XCTAssertEqual(Self.living(served, ledger: FixedLedger(), now: Self.t0 + Self.minute), [])
        XCTAssertEqual(Self.living(served, ledger: FixedLedger(), now: Self.t0 + Self.minute - 1), ["m-reply"])
    }

    func test_aFlameEyeConsumedOnLeaving_takesItsReply_withoutMessageExpired() {
        let sealed = Self.quote(of: "m-flamme").tombstoned(at: Self.t0, expired: true)
        let thread = [Self.reply(to: "m-flamme", quote: sealed)]

        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0), [])
    }

    func test_theReplyNeverLeavesBeforeWhatItQuotes() {
        let sealed = Self.quote(of: "m-eph").tombstoned(at: Self.t0, expired: true)
        let thread = [Self.reply(to: "m-eph", quote: sealed)]
        let inherited = Self.deadline(of: thread[0], in: thread, ledger: FixedLedger(), now: Self.t0)

        XCTAssertEqual(inherited, Self.t0)
        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0 - 1), ["m-reply"])
        XCTAssertTrue(QuoteCascade.isInheritedServable(inheritedExpiresAt: inherited, now: Self.t0 + 59 * Self.minute))
        XCTAssertFalse(QuoteCascade.isInheritedServable(inheritedExpiresAt: inherited, now: Self.t0 + 60 * Self.minute))
    }

    func test_theThreadWakesAtTheDeathOfAQuoteWhoseMessageIsNotLoaded() {
        let ledger = FixedLedger(destructions: ["m-eph": Self.t0 + Self.minute])
        let thread = [Self.reply(to: "m-eph", quote: Self.quote(of: "m-eph", nature: .timedFlame))]

        XCTAssertEqual(QuoteCascade.MessageThread(thread, ledger: ledger, now: Self.t0 + 2 * Self.minute)
            .inheritedDeath(of: thread[0]), Self.t0 + Self.minute)
    }

    func test_theWalkStopsAtEightLinks_likeTheGateway() {
        let ledger = FixedLedger(receptions: ["m-0": Self.t0])
        let chain = [Self.ephemeral(id: "m-0")] + (1...9).map { Self.reply(to: "m-\($0 - 1)", id: "m-\($0)") }
        let thread = QuoteCascade.MessageThread(chain, ledger: ledger, now: Self.t0)

        XCTAssertEqual(thread.inheritedDeath(of: chain[8]), Self.t0 + Self.minute)
        XCTAssertNil(thread.inheritedDeath(of: chain[9]))
    }

    // MARK: - Ce qui ne meurt pas ne fait rien mourir

    func test_aDeletedQuote_notExpired_letsTheReplyLive() {
        let deleted = Self.quote(of: "m-plain").tombstoned(at: Self.t0)
        let thread = [Self.reply(to: "m-plain", quote: deleted)]

        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0 + 10 * Self.minute), ["m-reply"])
    }

    func test_aFlameEyeNotYetConsumed_letsTheReplyLive() {
        let thread = [Self.flameEye(), Self.reply(to: "m-flamme", quote: Self.quote(of: "m-flamme", nature: .afterReadFlame))]

        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0 + 10 * Self.minute), ["m-flamme", "m-reply"])
    }

    func test_theSenderOfAFlameEye_keepsTheReply_nothingIsServedToThem() {
        let thread = [Self.flameEye(isMe: true), Self.reply(to: "m-flamme")]

        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0 + 10 * Self.minute), ["m-flamme", "m-reply"])
    }

    func test_anEphemeralNotYetReceived_takesNothing() {
        let thread = [Self.ephemeral(), Self.reply(to: "m-eph")]

        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0 + 10 * Self.minute), ["m-eph", "m-reply"])
    }

    func test_aStoryReply_takesNothing() {
        var story = ReplyReference(messageId: "s-1", authorName: "Story", previewText: "", isStoryReply: true)
        story.quotedExpiresAt = Self.t0
        let thread = [Self.message(id: "m-reply", replyTo: story)]

        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0 + Self.minute), ["m-reply"])
    }

    // MARK: - Une réponse à VUE UNIQUE, non éphémère, à une flamme-œil morte est retirée

    func test_aViewOnceReply_toADeadFlameEye_dies() {
        let sealed = Self.quote(of: "m-flamme").tombstoned(at: Self.t0, expired: true)
        let thread = [Self.reply(to: "m-flamme", quote: sealed, flags: [.viewOnce])]

        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0), [])
    }

    func test_aViewOnceReply_toALivingMessage_stays() {
        let thread = [Self.reply(to: "m-flamme", quote: Self.quote(of: "m-flamme", nature: .afterReadFlame), flags: [.viewOnce])]

        XCTAssertEqual(Self.living(thread, ledger: FixedLedger(), now: Self.t0 + 10 * Self.minute), ["m-reply"])
    }

    // MARK: - Les lignes GRDB lisent la même loi

    func test_records_aReplyToADestroyedEphemeral_inheritsItsDeath() throws {
        let ledger = FixedLedger(destructions: ["m-eph": Self.t0])
        let records = [
            Self.record(id: "m-eph", flags: [.ephemeral], duration: 60),
            try Self.record(id: "m-reply", replyingTo: Self.quote(of: "m-eph")),
            Self.record(id: "m-autre"),
        ]
        let thread = QuoteCascade.RecordThread(records, ledger: ledger, now: Self.t0 + 1)

        XCTAssertEqual(thread.inheritedDeath(of: records[1]), Self.t0)
        XCTAssertNil(thread.inheritedDeath(of: records[2]))
    }

    func test_records_aSealedQuote_killsTheReply_whenTheQuotedRowIsGone() throws {
        let sealed = Self.quote(of: "m-flamme").tombstoned(at: Self.t0, expired: true)
        let records = [try Self.record(id: "m-reply", replyingTo: sealed)]

        XCTAssertEqual(QuoteCascade.RecordThread(records, ledger: FixedLedger(), now: Self.t0).inheritedDeath(of: records[0]), Self.t0)
    }

    // MARK: - La base ne garde pas la réponse d'un mort

    func test_purge_takesTheRepliesOfTheDead_transitively_andKeepsTheRest() async throws {
        let (actor, queue) = try Self.makeActor()
        try await actor.insertOptimistic(Self.record(id: "m-eph", flags: [.ephemeral], duration: 60))
        try await actor.insertOptimistic(try Self.record(id: "m-reply", replyingTo: Self.quote(of: "m-eph")))
        try await actor.insertOptimistic(try Self.record(id: "m-reply-2", replyingTo: Self.quote(of: "m-reply")))
        try await actor.insertOptimistic(Self.record(id: "m-autre"))

        let purged = try await actor.purgeQuoteCascade(fromDead: ["m-eph"], ledger: FixedLedger(), now: Self.t0)

        XCTAssertEqual(Set(purged), ["m-reply", "m-reply-2"])
        XCTAssertEqual(try Self.ids(in: queue), ["m-autre", "m-eph"])
    }

    func test_messageExpired_ofTheQuotedFlameEye_purgesAViewOnceReply_evenWhenTheFlameIsNotStored() async throws {
        let (actor, queue) = try Self.makeActor()
        try await actor.insertOptimistic(try Self.record(id: "m-reply", replyingTo: Self.quote(of: "m-flamme"), flags: [.viewOnce]))

        try await actor.markDeleted(localId: "m-flamme", deletedAt: Self.t0, expired: true)
        try await actor.purgeQuoteCascade(fromDead: ["m-flamme"], ledger: FixedLedger(), now: Self.t0)

        XCTAssertEqual(try Self.ids(in: queue), [])
    }

    func test_messageExpired_ofAViewOnceReplyWhoseQuoteIsDead_purgesIt_insteadOfSealingIt() async throws {
        let (actor, queue) = try Self.makeActor()
        let sealed = Self.quote(of: "m-flamme").tombstoned(at: Self.t0, expired: true)
        try await actor.insertOptimistic(try Self.record(id: "m-reply", replyingTo: sealed, flags: [.viewOnce]))

        try await actor.markDeleted(localId: "m-reply", deletedAt: Self.t0, expired: true)
        try await actor.purgeQuoteCascade(fromDead: ["m-reply"], ledger: FixedLedger(), now: Self.t0)

        XCTAssertEqual(try Self.ids(in: queue), [])
    }

    func test_messageExpired_ofAViewOnceReplyWhoseQuoteLives_keepsTheRow() async throws {
        let (actor, queue) = try Self.makeActor()
        try await actor.insertOptimistic(try Self.record(id: "m-reply", replyingTo: Self.quote(of: "m-flamme", nature: .afterReadFlame), flags: [.viewOnce]))

        try await actor.markDeleted(localId: "m-reply", deletedAt: Self.t0, expired: true)
        try await actor.purgeQuoteCascade(fromDead: ["m-reply"], ledger: FixedLedger(), now: Self.t0)

        XCTAssertEqual(try Self.ids(in: queue), ["m-reply"])
    }

    // MARK: - Base

    private static func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "u-viewer"), queue)
    }

    private static func record(id: String, flags: MessageEffectFlags = [], duration: Int? = nil) -> MessageRecord {
        var record = MessageRecordFactory.make(localId: id, conversationId: "c-a", senderId: "u-other", state: .sent)
        record.serverId = id
        record.effectFlags = flags.rawValue
        record.ephemeralDuration = duration
        return record
    }

    private static func record(id: String, replyingTo quote: ReplyReference, flags: MessageEffectFlags = []) throws -> MessageRecord {
        var row = record(id: id, flags: flags)
        row.replyToId = quote.messageId
        row.replyToJson = try JSONEncoder().encode(quote)
        return row
    }

    private static func ids(in queue: DatabaseQueue) throws -> [String] {
        try queue.read { db in try MessageRecord.fetchAll(db).map(\.localId).sorted() }
    }
}
