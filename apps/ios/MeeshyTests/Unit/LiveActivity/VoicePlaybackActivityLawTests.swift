import XCTest
@testable import Meeshy

/// **Un vocal en lecture se suit et se pilote depuis l'îlot dynamique** (#9783).
@MainActor
final class VoicePlaybackActivityLawTests: XCTestCase {

    private let wording = VoicePlaybackActivityLaw.Wording(
        voiceMessage: "Message vocal",
        protectedMessage: "Message protégé"
    )

    private let t0 = Date(timeIntervalSince1970: 10_000)

    private func track(
        _ id: String = "att1",
        sender: String = "Alice Martin",
        isProtected: Bool = false,
        language: String? = "fr",
        translated: Bool = true
    ) -> VoicePlaybackActivityLaw.Track {
        VoicePlaybackActivityLaw.Track(
            attachmentId: id,
            messageId: "msg-\(id)",
            conversationId: "conv1",
            conversationName: "Famille",
            senderName: sender,
            accentHex: "6366F1",
            isProtected: isProtected,
            trackLanguage: language,
            isTranslatedTrack: translated,
            durationHint: 60
        )
    }

    private func input(
        _ track: VoicePlaybackActivityLaw.Track? = nil,
        playing: Bool = true,
        position: TimeInterval = 0,
        duration: TimeInterval = 60,
        rate: Double = 1,
        upNext: Int = 0,
        at offset: TimeInterval = 0
    ) -> VoicePlaybackActivityLaw.Input {
        VoicePlaybackActivityLaw.Input(
            track: track,
            isPlaying: playing,
            position: position,
            duration: duration,
            rate: rate,
            upNextCount: upNext,
            now: t0.addingTimeInterval(offset)
        )
    }

    private func step(_ running: VoicePlaybackSnapshot?, _ input: VoicePlaybackActivityLaw.Input) -> VoicePlaybackActivityLaw.Step {
        VoicePlaybackActivityLaw.step(running: running, input: input, wording: wording)
    }

    func test_step_nothingPlaying_doesNothing() {
        let result = step(nil, input(nil))
        XCTAssertNil(result.running)
        XCTAssertEqual(result.action, .none)
    }

    func test_step_playbackStarts_opensWithSenderConversationAndTrackLanguage() {
        let result = step(nil, input(track(), upNext: 2))
        guard case .start(let snapshot) = result.action else { return XCTFail("attendu .start") }
        XCTAssertEqual(snapshot.title, "Alice Martin")
        XCTAssertEqual(snapshot.subtitle, "Famille")
        XCTAssertEqual(snapshot.initials, "AM")
        XCTAssertEqual(snapshot.trackLanguage, "FR")
        XCTAssertTrue(snapshot.isTranslatedTrack)
        XCTAssertEqual(snapshot.upNextCount, 2)
        XCTAssertEqual(snapshot.anchor, t0)
    }

    func test_step_regularProgress_doesNotWakeTheActivity() {
        let opened = step(nil, input(track(), position: 0))
        let later = step(opened.running, input(track(), position: 10, at: 10))
        XCTAssertEqual(later.action, .none, "la vue projette la progression, aucune mise à jour par tic")
        XCTAssertEqual(later.running?.anchor, t0, "l'ancre affichée reste celle de l'activité")
    }

    func test_step_seekForward_updatesTheActivity() {
        let opened = step(nil, input(track(), position: 0))
        let jumped = step(opened.running, input(track(), position: 25, at: 10))
        guard case .update(let snapshot) = jumped.action else { return XCTFail("attendu .update") }
        XCTAssertEqual(snapshot.position, 25)
        XCTAssertEqual(snapshot.anchor, t0.addingTimeInterval(10))
    }

    func test_step_pause_updatesTheActivity() {
        let opened = step(nil, input(track(), position: 0))
        let paused = step(opened.running, input(track(), playing: false, position: 5, at: 5))
        guard case .update(let snapshot) = paused.action else { return XCTFail("attendu .update") }
        XCTAssertFalse(snapshot.isPlaying)
        XCTAssertEqual(snapshot.position, 5)
    }

    func test_step_pausedPosition_isNotProjectedForward() {
        let paused = step(nil, input(track(), playing: false, position: 5))
        XCTAssertEqual(step(paused.running, input(track(), playing: false, position: 5, at: 30)).action, .none)
    }

    func test_step_nextVoiceMessageInTheQueue_updatesTheActivity() {
        let opened = step(nil, input(track("att1"), upNext: 1))
        let next = step(opened.running, input(track("att2", sender: "Bob"), upNext: 0, at: 60))
        guard case .update(let snapshot) = next.action else { return XCTFail("attendu .update") }
        XCTAssertEqual(snapshot.messageId, "msg-att2")
        XCTAssertEqual(snapshot.title, "Bob")
        XCTAssertEqual(snapshot.upNextCount, 0)
    }

    func test_step_languageSwitch_updatesTheTrackLanguage() {
        let opened = step(nil, input(track(language: "fr", translated: true)))
        let original = step(opened.running, input(track(language: "en", translated: false), at: 1))
        guard case .update(let snapshot) = original.action else { return XCTFail("attendu .update") }
        XCTAssertEqual(snapshot.trackLanguage, "EN")
        XCTAssertFalse(snapshot.isTranslatedTrack)
    }

    func test_step_playbackStops_closesWithTheLastKnownPosition() {
        let opened = step(nil, input(track(), position: 0))
        let stopped = step(opened.running, input(nil, at: 12))
        XCTAssertNil(stopped.running)
        guard case .end(let final) = stopped.action else { return XCTFail("attendu .end") }
        XCTAssertFalse(final.isPlaying)
        XCTAssertEqual(final.position, 12, accuracy: 0.001)
    }

    func test_snapshot_protectedMessage_saysNeutralWordsOnly() {
        let snapshot = VoicePlaybackActivityLaw.snapshot(for: input(track(isProtected: true)), wording: wording)
        XCTAssertEqual(snapshot?.subtitle, "Message protégé")
        XCTAssertNotEqual(snapshot?.subtitle, "Famille")
    }

    func test_snapshot_unknownSender_fallsBackToVoiceMessage() {
        let snapshot = VoicePlaybackActivityLaw.snapshot(for: input(track(sender: " ")), wording: wording)
        XCTAssertEqual(snapshot?.title, "Message vocal")
        XCTAssertEqual(snapshot?.initials, "")
    }

    func test_snapshot_unloadedDuration_usesTheMessageDuration() {
        let snapshot = VoicePlaybackActivityLaw.snapshot(for: input(track(), duration: 0), wording: wording)
        XCTAssertEqual(snapshot?.duration, 60)
    }

    func test_projectedPosition_followsThePlaybackRate() throws {
        let opened = step(nil, input(track(), position: 10, rate: 2))
        let snapshot = try XCTUnwrap(opened.running)
        XCTAssertEqual(VoicePlaybackActivityLaw.projectedPosition(of: snapshot, at: t0.addingTimeInterval(5)), 20, accuracy: 0.001)
        XCTAssertEqual(VoicePlaybackActivityLaw.projectedPosition(of: snapshot, at: t0.addingTimeInterval(100)), 60, accuracy: 0.001)
    }

    func test_seekFraction_skipsFifteenSecondsWithinTheTrack() {
        XCTAssertEqual(VoicePlaybackActivityLaw.seekFraction(position: 30, duration: 60, offset: 15), 0.75)
        XCTAssertEqual(VoicePlaybackActivityLaw.seekFraction(position: 5, duration: 60, offset: -15), 0)
        XCTAssertEqual(VoicePlaybackActivityLaw.seekFraction(position: 55, duration: 60, offset: 15), 1)
        XCTAssertNil(VoicePlaybackActivityLaw.seekFraction(position: 0, duration: 0, offset: 15))
    }

    func test_playbackInterval_projectsTheBarFromItsAnchor() throws {
        let snapshot = try XCTUnwrap(step(nil, input(track(), position: 20, duration: 60, rate: 2)).running)
        XCTAssertEqual(snapshot.playbackInterval.lowerBound, t0.addingTimeInterval(-10))
        XCTAssertEqual(snapshot.playbackInterval.upperBound, t0.addingTimeInterval(20))
        XCTAssertEqual(snapshot.fraction, 20.0 / 60.0, accuracy: 0.0001)
    }
}
