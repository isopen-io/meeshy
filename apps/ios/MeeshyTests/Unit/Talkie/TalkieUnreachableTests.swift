import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Le talkie d'un proche au téléphone injoignable (#20241) : quand la passerelle me sert que son téléphone ne répond
/// plus depuis plusieurs minutes, le même geste laisse un MESSAGE VOCAL dans notre conversation directe au lieu d'ouvrir
/// un direct qui n'arrivera pas, et « Demander un relevé » disparaît (il ne peut pas aboutir). Sans état servi, rien
/// ne change.
@MainActor
final class TalkieUnreachableTests: XCTestCase {

    private static let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func state(silentFor seconds: TimeInterval) -> PhoneReachabilityState {
        PhoneReachabilityState(userId: "bob", unreachableSince: Self.now.addingTimeInterval(-seconds), cause: .network)
    }

    // MARK: - Le seuil

    func test_lasting_isFalse_withoutAServedState() {
        XCTAssertFalse(PhoneUnreachableLasting.isLasting(nil, now: Self.now))
    }

    func test_lasting_waitsSeveralMinutes_beforeCountingTheSilence() {
        XCTAssertEqual(PhoneUnreachableLasting.minimumSilence, 5 * 60)
        XCTAssertFalse(PhoneUnreachableLasting.isLasting(state(silentFor: 4 * 60), now: Self.now))
        XCTAssertTrue(PhoneUnreachableLasting.isLasting(state(silentFor: 5 * 60), now: Self.now))
        XCTAssertTrue(PhoneUnreachableLasting.isLasting(state(silentFor: 45 * 60), now: Self.now))
    }

    func test_lasting_neverOutlivesTheServedTtl() {
        XCTAssertFalse(PhoneUnreachableLasting.isLasting(state(silentFor: PhoneReachabilityContract.stateTtl + 1), now: Self.now))
    }

    func test_remaining_saysWhenTheSilenceWillCount() {
        XCTAssertEqual(PhoneUnreachableLasting.remaining(state(silentFor: 60), now: Self.now), 4 * 60)
        XCTAssertNil(PhoneUnreachableLasting.remaining(state(silentFor: 10 * 60), now: Self.now))
        XCTAssertNil(PhoneUnreachableLasting.remaining(nil, now: Self.now))
    }

    // MARK: - Ce que le geste fait

    func test_delivery_isLive_untilTheSilenceLasts_thenAVoiceMessage() {
        XCTAssertEqual(TalkieDelivery.resolve(unreachable: nil, now: Self.now), .live)
        XCTAssertEqual(TalkieDelivery.resolve(unreachable: state(silentFor: 60), now: Self.now), .live)
        XCTAssertEqual(TalkieDelivery.resolve(unreachable: state(silentFor: 20 * 60), now: Self.now), .voiceMessage)
    }

    func test_cardLine_atRest_saysToLeaveAVoiceMessage_whenTheTalkieWouldNotArrive() {
        XCTAssertEqual(TalkieCardLine.resolve(phase: .idle, waking: false, aftermath: nil, delivery: .voiceMessage), .leaveVoice)
        XCTAssertEqual(TalkieCardLine.resolve(phase: .idle, waking: false, aftermath: nil, delivery: .live), .hold)
        XCTAssertEqual(TalkieCardLine.resolve(phase: .recordingCopy(toUserId: "bob"), waking: false, aftermath: nil,
                                              delivery: .voiceMessage), .recordingCopy)
    }

    // MARK: - « Demander un relevé »

    func test_batteryPull_disappears_whenThePhoneIsKnownUnreachable() {
        XCTAssertTrue(ProfileBatteryPullOffer.offers(canPull: true, unreachable: nil, now: Self.now))
        XCTAssertTrue(ProfileBatteryPullOffer.offers(canPull: true, unreachable: state(silentFor: 60), now: Self.now))
        XCTAssertFalse(ProfileBatteryPullOffer.offers(canPull: true, unreachable: state(silentFor: 30 * 60), now: Self.now))
        XCTAssertFalse(ProfileBatteryPullOffer.offers(canPull: false, unreachable: nil, now: Self.now))
    }

    // MARK: - La conversation directe

    func test_pickDirect_choosesOnlyTheDirectConversation() {
        let candidates = [
            TalkieCopyCandidate(id: "family", type: "group", rankAt: Self.now),
            TalkieCopyCandidate(id: "direct", type: "direct", rankAt: Self.now.addingTimeInterval(-600)),
        ]
        XCTAssertEqual(TalkieCopyDestination.pickDirect(among: candidates), "direct")
        XCTAssertNil(TalkieCopyDestination.pickDirect(among: [TalkieCopyCandidate(id: "e2ee", type: "direct",
                                                                                  encryptionMode: "e2ee", rankAt: nil)]))
    }

    func test_directSend_opensTheDirect_whenNoneIsShared() async {
        final class Log: @unchecked Sendable {
            var enqueued: [String] = []
            var opened: [String] = []
        }
        let log = Log()
        let sut = TalkieVoiceCopySender(
            shared: { _ in [TalkieCopyCandidate(id: "family", type: "group", rankAt: Date())] },
            openDirect: { userId in log.opened.append(userId); return "direct-new" },
            enqueue: { _, id, _, _ in log.enqueued.append(id) },
            writeFile: { _, _ in 1.5 }
        )

        let sent = await sut.sendDirect([Data([1, 2, 3])], toUserId: "bob")

        XCTAssertTrue(sent)
        XCTAssertEqual(log.opened, ["bob"])
        XCTAssertEqual(log.enqueued, ["direct-new"])
    }

    // MARK: - L'émetteur

    @MainActor
    private final class DirectCopier: TalkieVoiceCopying {
        var direct: [(frames: [Data], toUserId: String)] = []
        var other = 0

        func send(_ frames: [Data], toUserId: String, conversationId: String?) async -> Bool {
            other += 1
            return true
        }

        func sendDirect(_ frames: [Data], toUserId: String) async -> Bool {
            direct.append((frames, toUserId))
            return true
        }
    }

    private func settle() async {
        for _ in 0..<30 { await Task.yield() }
    }

    func test_aVoiceMessagePress_neverOpensATalkie_recordsWhileHeld_andLeavesItInTheDirect() async {
        let emitter = TalkieSenderTests.FakeEmitter()
        emitter.isConnected = false
        let capture = TalkieSenderTests.FakeCapture()
        let copier = DirectCopier()
        let sut = TalkieSender(emitter: emitter, capture: capture, copier: copier,
                               endedEvents: Empty().eraseToAnyPublisher(), schedule: { _, _ in {} })

        sut.press(toUserId: "bob", delivery: .voiceMessage)
        await settle()
        XCTAssertEqual(sut.phase, .recordingCopy(toUserId: "bob"))
        capture.speak(frames: 4)
        await sut.release()
        await settle()

        XCTAssertTrue(emitter.startCalls.isEmpty, "le direct n'arriverait pas : aucun talkie:start")
        XCTAssertEqual(copier.direct.map(\.toUserId), ["bob"])
        XCTAssertEqual(copier.direct.first?.frames.reduce(0) { $0 + $1.count }, 40)
        XCTAssertEqual(copier.other, 0)
        XCTAssertEqual(sut.lastSettled?.outcome, .voice)
        XCTAssertEqual(sut.phase, .idle)
    }

    func test_aVoiceMessageQuickTap_sendsNothing_andSaysNothing() async {
        let capture = TalkieSenderTests.FakeCapture()
        let copier = DirectCopier()
        let sut = TalkieSender(emitter: TalkieSenderTests.FakeEmitter(), capture: capture, copier: copier,
                               endedEvents: Empty().eraseToAnyPublisher(), schedule: { _, _ in {} })

        sut.press(toUserId: "bob", delivery: .voiceMessage)
        await sut.release()
        await settle()

        XCTAssertTrue(copier.direct.isEmpty)
        XCTAssertNil(sut.notice)
        XCTAssertEqual(sut.phase, .idle)
    }

    func test_aVoiceMessageWithARefusedMicrophone_saysTheMicrophone() async {
        let capture = TalkieSenderTests.FakeCapture()
        capture.allow = false
        let copier = DirectCopier()
        let sut = TalkieSender(emitter: TalkieSenderTests.FakeEmitter(), capture: capture, copier: copier,
                               endedEvents: Empty().eraseToAnyPublisher(), schedule: { _, _ in {} })

        sut.press(toUserId: "bob", delivery: .voiceMessage)
        await settle()

        XCTAssertEqual(sut.notice, .micDenied)
        XCTAssertTrue(copier.direct.isEmpty)
        XCTAssertEqual(sut.phase, .idle)
    }
}
