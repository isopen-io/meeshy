import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// La copie vocale d'un talkie qui n'a pas pu passer (#17141) : elle part dans la conversation la plus RÉCENTE avec le
/// destinataire, jamais dans une conversation chiffrée ni là où je n'écris pas ; sans conversation, le direct s'ouvre.
@MainActor
final class TalkieVoiceCopyTests: XCTestCase {

    private func at(_ seconds: TimeInterval) -> Date { Date(timeIntervalSince1970: 1_800_000_000 + seconds) }

    func test_pick_choosesTheMostRecentConversation_notNecessarilyTheDirect() {
        let candidates = [
            TalkieCopyCandidate(id: "direct", type: "direct", rankAt: at(10)),
            TalkieCopyCandidate(id: "family", type: "group", rankAt: at(50)),
            TalkieCopyCandidate(id: "old", type: "group", rankAt: at(1)),
        ]
        XCTAssertEqual(TalkieCopyDestination.pick(among: candidates), "family")
    }

    func test_pick_neverChoosesAnEncryptedPublicReadOnlyOrLeftConversation() {
        let candidates = [
            TalkieCopyCandidate(id: "e2ee", type: "direct", encryptionMode: "e2ee", rankAt: at(90)),
            TalkieCopyCandidate(id: "global", type: "global", rankAt: at(80)),
            TalkieCopyCandidate(id: "left", type: "group", isMember: false, rankAt: at(70)),
            TalkieCopyCandidate(id: "closed", type: "group", isActive: false, rankAt: at(65)),
            TalkieCopyCandidate(id: "announce", type: "group", isAnnouncementChannel: true, rankAt: at(60)),
            TalkieCopyCandidate(id: "minor", type: "group", writeRestricted: true, rankAt: at(55)),
            TalkieCopyCandidate(id: "ok", type: "direct", encryptionMode: "server", rankAt: at(5)),
        ]
        XCTAssertEqual(TalkieCopyDestination.pick(among: candidates), "ok")
    }

    func test_pick_withNothingUsable_returnsNil() {
        XCTAssertNil(TalkieCopyDestination.pick(among: [TalkieCopyCandidate(id: "e2ee", type: "direct", encryptionMode: "e2ee", rankAt: nil)]))
    }

    private final class Log: @unchecked Sendable {
        var enqueued: [(URL, String)] = []
        var opened: [String] = []
        var clientMessageIds: [String] = []
        var names: [String] = []
    }

    func test_send_enqueuesTheFileIntoTheMostRecentConversation() async {
        let log = Log()
        let sut = TalkieVoiceCopySender(
            shared: { _ in [TalkieCopyCandidate(id: "family", type: "group", rankAt: Date())] },
            openDirect: { userId in log.opened.append(userId); return "direct" },
            enqueue: { url, id, cid, name in log.enqueued.append((url, id)); log.clientMessageIds.append(cid); log.names.append(name) },
            writeFile: { _, _ in 1.5 }
        )

        let sent = await sut.send([Data([1, 2, 3])], toUserId: "bob")

        XCTAssertTrue(sent)
        XCTAssertEqual(log.enqueued.map(\.1), ["family"])
        XCTAssertEqual(log.enqueued.first?.0.pathExtension, "m4a")
        XCTAssertTrue(log.opened.isEmpty)
    }

    func test_send_withoutSharedConversation_opensTheDirect() async {
        let log = Log()
        let sut = TalkieVoiceCopySender(
            shared: { _ in throw URLError(.notConnectedToInternet) },
            openDirect: { userId in log.opened.append(userId); return "direct" },
            enqueue: { url, id, cid, name in log.enqueued.append((url, id)); log.clientMessageIds.append(cid); log.names.append(name) },
            writeFile: { _, _ in 1.5 }
        )

        _ = await sut.send([Data([1])], toUserId: "bob")

        XCTAssertEqual(log.opened, ["bob"])
        XCTAssertEqual(log.enqueued.map(\.1), ["direct"])
    }

    func test_send_intoTheConversationTheGatewayNamed_skipsTheLookup() async {
        let log = Log()
        let sut = TalkieVoiceCopySender(
            shared: { _ in XCTFail("la passerelle a déjà choisi"); return [] },
            openDirect: { userId in log.opened.append(userId); return "direct" },
            enqueue: { url, id, cid, name in log.enqueued.append((url, id)); log.clientMessageIds.append(cid); log.names.append(name) },
            writeFile: { _, _ in 1.5 }
        )

        _ = await sut.send([Data([1])], toUserId: "bob", conversationId: "named")

        XCTAssertEqual(log.enqueued.map(\.1), ["named"])
        XCTAssertTrue(log.opened.isEmpty)
    }

    func test_send_withNoAudio_sendsNothing() async {
        let log = Log()
        let sut = TalkieVoiceCopySender(
            shared: { _ in [TalkieCopyCandidate(id: "c", type: "direct", rankAt: nil)] },
            openDirect: { _ in "direct" },
            enqueue: { url, id, cid, name in log.enqueued.append((url, id)); log.clientMessageIds.append(cid); log.names.append(name) },
            writeFile: { _, _ in nil }
        )

        let emptySent = await sut.send([], toUserId: "bob")
        let unreadableSent = await sut.send([Data([0])], toUserId: "bob")

        XCTAssertFalse(emptySent)
        XCTAssertFalse(unreadableSent)
        XCTAssertTrue(log.enqueued.isEmpty)
    }

    func test_file_withUnreadableFrames_writesNothing() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("talkie-copy-test-\(UUID().uuidString).m4a")
        XCTAssertNil(TalkieVoiceCopyFile.write([Data([0, 1, 2])], to: url))
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    // MARK: - #17308 : la copie porte un nom qui a du sens

    func test_name_saysTalkieThenTheLocalDayAndMinute() {
        let paris = TimeZone(identifier: "Europe/Paris")!
        let moment = ISO8601DateFormatter().date(from: "2026-11-09T19:37:42Z")!

        XCTAssertEqual(TalkieVoiceCopyName.of(moment, timeZone: paris), "talkie_2026-11-09_2037.m4a")
    }

    func test_name_padsSingleDigitMonthDayHourAndMinute() {
        let utc = TimeZone(identifier: "UTC")!
        let moment = ISO8601DateFormatter().date(from: "2027-03-04T05:06:00Z")!

        XCTAssertEqual(TalkieVoiceCopyName.of(moment, timeZone: utc), "talkie_2027-03-04_0506.m4a")
    }

    func test_send_handsTheQueueTheNameOfTheMomentItWasSpoken() async {
        let log = Log()
        let moment = ISO8601DateFormatter().date(from: "2026-11-09T19:37:42Z")!
        let sut = TalkieVoiceCopySender(
            shared: { _ in [TalkieCopyCandidate(id: "direct", type: "direct", rankAt: Date())] },
            openDirect: { _ in "direct" },
            enqueue: { url, id, cid, name in log.enqueued.append((url, id)); log.clientMessageIds.append(cid); log.names.append(name) },
            writeFile: { _, _ in 1.5 },
            now: { moment }
        )

        _ = await sut.send([Data([1])], toUserId: "bob")

        XCTAssertEqual(log.names, [TalkieVoiceCopyName.of(moment)])
    }

    // MARK: - #17255 : la copie part une fois, et son abandon se voit

    private func makeSender(log: Log, exhausted: AnyPublisher<String, Never> = Empty().eraseToAnyPublisher()) -> TalkieVoiceCopySender {
        TalkieVoiceCopySender(
            shared: { _ in [TalkieCopyCandidate(id: "direct", type: "direct", rankAt: Date())] },
            openDirect: { _ in "direct" },
            enqueue: { url, id, cid, name in log.enqueued.append((url, id)); log.clientMessageIds.append(cid); log.names.append(name) },
            writeFile: { _, _ in 1.5 },
            exhausted: exhausted
        )
    }

    /// La passerelle refuse tout `message:send-with-attachments` dont le cid n'est pas `cid_<uuid v4 minuscule>` : la
    /// file retéléversait alors la voix à chaque essai sans jamais créer le message (dix pièces orphelines en une minute).
    func test_send_handsTheQueueAClientMessageIdTheGatewayAccepts() async {
        let log = Log()
        let sut = makeSender(log: log)

        _ = await sut.send([Data([1])], toUserId: "bob")

        XCTAssertEqual(log.clientMessageIds.count, 1)
        XCTAssertTrue(log.clientMessageIds.allSatisfy(ClientMessageId.isValid), "\(log.clientMessageIds)")
    }

    func test_send_twoCopies_neverShareAClientMessageId() async {
        let log = Log()
        let sut = makeSender(log: log)

        _ = await sut.send([Data([1])], toUserId: "bob")
        _ = await sut.send([Data([2])], toUserId: "bob")

        XCTAssertEqual(Set(log.clientMessageIds).count, 2)
    }

    func test_copyAbandonedByTheQueue_isAnnounced_andOnlyIts() async {
        let log = Log()
        let exhausted = PassthroughSubject<String, Never>()
        let sut = makeSender(log: log, exhausted: exhausted.eraseToAnyPublisher())
        let announced = expectation(description: "l'abandon de la copie se dit")
        var failures = 0
        let watch = sut.failures.sink { failures += 1; announced.fulfill() }

        _ = await sut.send([Data([1])], toUserId: "bob")
        exhausted.send("cid_00000000-0000-4000-8000-000000000000")
        exhausted.send(log.clientMessageIds[0])
        exhausted.send(log.clientMessageIds[0])

        await fulfillment(of: [announced], timeout: 2)
        try? await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(failures, 1)
        watch.cancel()
    }
}
