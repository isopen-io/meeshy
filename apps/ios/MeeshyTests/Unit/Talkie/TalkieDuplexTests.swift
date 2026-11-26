import AVFoundation
import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// #20579 — parler et recevoir en même temps : quand Awa me parle pendant que je lui parle, sa voix s'ouvre, sonne et se
/// voit chez moi ; répondre depuis le bandeau ne la fait pas taire ; le micro ne l'éteint pas en prenant la session, et
/// ne la coupe pas en la rendant.
@MainActor
final class TalkieDuplexTests: XCTestCase {

    private let awa = "awa"
    private let me = "me"

    private func speaker(_ id: String = "t1") -> TalkieSpeaker {
        TalkieSpeaker(talkieId: id, fromUserId: awa, name: "Awa", openedAt: Date(), maxDuration: 15)
    }

    // MARK: - La réception ne dépend pas de ce que j'émets

    func test_anIncomingVoice_opensAndPlays_nothingInReceptionWaitsForMyOwnVoice() {
        let sink = FakeTalkieSink()
        let viewer = me
        let center = TalkieCenter(sink: sink, people: FakeCirclePeople([]), viewerId: { viewer },
                                  incomingEvents: Empty().eraseToAnyPublisher(),
                                  chunkEvents: Empty().eraseToAnyPublisher(),
                                  endedEvents: Empty().eraseToAnyPublisher())
        center.open(TalkieIncoming(talkieId: "t1", fromUserId: awa, startedAt: "x", maxDurationMs: 15_000))
        center.receive(TalkieChunk(talkieId: "t1", fromUserId: awa, seq: 0, data: Data([1])))

        XCTAssertEqual(center.active.map(\.talkieId), ["t1"])
        XCTAssertEqual(sink.played.map(\.talkieId), ["t1"])
        XCTAssertEqual(sink.silenced, [])
    }

    // MARK: - Répondre depuis le bandeau

    func test_holdingTalk_repliesToTheVoiceThatSounds_andTheBannerStaysWhileTheReplyLeaves() {
        let live = speaker()
        XCTAssertEqual(TalkieBannerLaw.replyingTo(pressed: true, live: live, current: nil, sending: false), live)
        XCTAssertEqual(TalkieBannerLaw.replyingTo(pressed: false, live: nil, current: live, sending: true), live)
        XCTAssertNil(TalkieBannerLaw.replyingTo(pressed: false, live: nil, current: live, sending: false))
    }

    func test_whileIReply_theBannerShowsHerVoiceStillLive_withCouperAndParler() {
        let live = speaker()
        let shown = TalkieBannerLaw.speaker(active: live, replyingTo: live)
        XCTAssertEqual(shown, live)
        XCTAssertEqual(TalkieBannerLaw.actions(speakerIsLive: true, offered: true), [.mute, .talk])
    }

    /// Le bandeau ne fait taire la voix reçue que par « Couper » : répondre ne l'appelle plus (#20579).
    func test_theBanner_mutesTheIncomingVoiceOnlyFromCouper() throws {
        let source = try String(contentsOf: Self.repoFile("apps/ios/Meeshy/Features/Talkie/TalkieIndicator.swift"), encoding: .utf8)
        XCTAssertEqual(source.components(separatedBy: "center.mute(").count - 1, 1,
                       "seul onMute (« Couper ») fait taire la voix reçue")
        XCTAssertTrue(source.contains("onMute: { center.mute(speaker.talkieId) }"))
    }

    // MARK: - La session audio partagée par le micro et la voix reçue

    func test_theMicStopping_alongsideAVoiceThatSounds_keepsAPlaybackSession() {
        XCTAssertTrue(TalkieMicSessionLaw.alongsideIncoming([TalkieVoiceKey(userId: awa, direction: .incoming)]))
        XCTAssertFalse(TalkieMicSessionLaw.alongsideIncoming([TalkieVoiceKey(userId: awa, direction: .outgoing)]))
        XCTAssertFalse(TalkieMicSessionLaw.alongsideIncoming([]))
    }

    /// Le mode du micro dépend de la SORTIE, jamais de l'ordre des voix : une voix qui arrive après l'ouverture du micro
    /// trouve la même session que celle qui sonnait avant.
    func test_theMicSession_isChosenByTheOutput_notByWhichVoiceCameFirst() {
        XCTAssertTrue(TalkieMicSessionLaw.alongsidePlayback(outputs: [.headphones]))
        XCTAssertTrue(TalkieMicSessionLaw.alongsidePlayback(outputs: [.bluetoothHFP]))
        XCTAssertFalse(TalkieMicSessionLaw.alongsidePlayback(outputs: [.builtInSpeaker]))
        XCTAssertFalse(TalkieMicSessionLaw.alongsidePlayback(outputs: [.builtInReceiver]))
    }

    /// Sur le haut-parleur, le micro entendrait la voix reçue et la renverrait : elle se tait tant qu'il est ouvert.
    func test_anIncomingVoice_isSilencedWhileMyMicIsOpenOnTheSpeaker_only() {
        XCTAssertFalse(TalkieMicSessionLaw.incomingAudible(micOpen: true, outputs: [.builtInSpeaker]))
        XCTAssertTrue(TalkieMicSessionLaw.incomingAudible(micOpen: false, outputs: [.builtInSpeaker]))
        XCTAssertTrue(TalkieMicSessionLaw.incomingAudible(micOpen: true, outputs: [.headphones]))
        XCTAssertTrue(TalkieMicSessionLaw.incomingAudible(micOpen: true, outputs: [.bluetoothA2DP]))
    }

    func test_myMicIsOpen_whileMyOwnVoiceLeaves() {
        XCTAssertTrue(TalkieMicSessionLaw.micOpen([TalkieVoiceKey(userId: awa, direction: .outgoing)]))
        XCTAssertFalse(TalkieMicSessionLaw.micOpen([TalkieVoiceKey(userId: awa, direction: .incoming)]))
    }

    private static func repoFile(_ path: String) -> URL {
        var url = URL(fileURLWithPath: #filePath)
        while url.pathComponents.count > 1, !FileManager.default.fileExists(atPath: url.appendingPathComponent("apps/ios").path) {
            url.deleteLastPathComponent()
        }
        return url.appendingPathComponent(path)
    }
}
