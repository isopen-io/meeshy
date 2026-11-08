import XCTest
import MeeshySDK
@testable import Meeshy

/// #16665 — une capture d'écran se voit et se garde (`docs/product/appels-vue-finale.md`
/// loi 13) : la capsule R1 chez les autres, une ligne datée au journal chez
/// tous, une seule par personne et par sorte en 5 s, et les bornes de
/// l'enregistrement consenti de l'appel.
@MainActor
final class CallCaptureLedgerTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000)

    private func signal(
        userId: String = "karim",
        name: String = "Karim",
        kind: CallTranscriptCaptureKind = .screenshot,
        isActive: Bool = true,
        isLocal: Bool = false,
        after seconds: TimeInterval = 0
    ) -> CallCaptureSignal {
        CallCaptureSignal(userId: userId, displayName: name, kind: kind, isActive: isActive, isLocal: isLocal, at: t0.addingTimeInterval(seconds))
    }

    private func segment(_ text: String, after seconds: TimeInterval) -> Meeshy.CallTranscriptionSegment {
        Meeshy.CallTranscriptionSegment(
            id: UUID(), text: text, speakerId: "awa", startTime: 0, endTime: 1, isFinal: true, confidence: 1,
            language: "en", translatedText: nil, translatedLanguage: nil, capturedAt: t0.addingTimeInterval(seconds)
        )
    }

    // MARK: - Registre

    func test_applying_remoteScreenshot_writesAMarkAndFlashesTheCapsule() {
        let sut = CallCaptureLedger().applying(signal(), id: "c1")

        XCTAssertEqual(sut.marks.map(\.kind), [.screenshot])
        XCTAssertEqual(sut.marks.first?.displayName, "Karim")
        XCTAssertEqual(sut.alert, CallCaptureAlert(id: "c1", userId: "karim", displayName: "Karim", isTransient: true))
    }

    func test_applying_sameCaptureWithinFiveSeconds_isWrittenOnce() {
        let sut = CallCaptureLedger()
            .applying(signal(), id: "c1")
            .applying(signal(after: 4.9), id: "c2")

        XCTAssertEqual(sut.marks.map(\.id), ["c1"])
    }

    func test_applying_sameCaptureAfterFiveSeconds_isWrittenAgain() {
        let sut = CallCaptureLedger()
            .applying(signal(), id: "c1")
            .applying(signal(after: 5), id: "c2")

        XCTAssertEqual(sut.marks.map(\.id), ["c1", "c2"])
    }

    func test_applying_anotherPersonOrKind_isNotADuplicate() {
        let sut = CallCaptureLedger()
            .applying(signal(), id: "c1")
            .applying(signal(userId: "awa", name: "Awa", after: 1), id: "c2")
            .applying(signal(kind: .recording, after: 2), id: "c3")

        XCTAssertEqual(sut.marks.map(\.id), ["c1", "c2", "c3"])
    }

    func test_screenRecording_keepsTheCapsuleWhileItLasts_andItsEndWritesNoLine() {
        let recording = CallCaptureLedger().applying(signal(kind: .recording), id: "r1")
        XCTAssertEqual(recording.alert?.isTransient, false)

        let stopped = recording.applying(signal(kind: .recording, isActive: false, after: 30), id: "r2")

        XCTAssertNil(stopped.alert)
        XCTAssertEqual(stopped.marks.map(\.id), ["r1"])
    }

    func test_screenRecording_restartedWithinFiveSeconds_showsTheCapsuleAgain_withOneMark() {
        let sut = CallCaptureLedger()
            .applying(signal(kind: .recording), id: "r1")
            .applying(signal(kind: .recording, isActive: false, after: 1), id: "r2")
            .applying(signal(kind: .recording, after: 3), id: "r3")

        XCTAssertNotNil(sut.alert)
        XCTAssertEqual(sut.marks.map(\.id), ["r1"])
    }

    func test_screenshotEnd_relayedForOlderClients_keepsTheRecordingCapsule() {
        let sut = CallCaptureLedger()
            .applying(signal(kind: .recording), id: "r1")
            .applying(signal(kind: .screenshot, isActive: false, after: 6), id: "x")

        XCTAssertEqual(sut.alert?.id, "r1")
    }

    func test_peerLeftWhileRecording_removesTheCapsule_withoutALine() {
        let sut = CallCaptureLedger()
            .applying(signal(kind: .recording), id: "r1")
            .applying(.participantLeft(userId: "karim", at: t0.addingTimeInterval(20)), id: "l1")

        XCTAssertNil(sut.alert)
        XCTAssertEqual(sut.marks.map(\.id), ["r1"])
    }

    func test_myOwnCapture_entersTheJournal_neverTheCapsule() {
        let sut = CallCaptureLedger().applying(signal(userId: "me", name: "Moi", isLocal: true), id: "m1")

        XCTAssertEqual(sut.marks.map(\.userId), ["me"])
        XCTAssertNil(sut.alert)
    }

    func test_callRecordingBounds_enterTheJournal_withoutCapsule() {
        let sut = CallCaptureLedger()
            .applying(signal(name: "", kind: .callRecordingStarted), id: "s1")
            .applying(signal(name: "", kind: .callRecordingStopped, after: 60), id: "s2")

        XCTAssertEqual(sut.marks.map(\.kind), [.callRecordingStarted, .callRecordingStopped])
        XCTAssertNil(sut.alert)
    }

    func test_dismissingFlash_onlyRemovesThatScreenshot() {
        let sut = CallCaptureLedger()
            .applying(signal(kind: .recording), id: "r1")
            .applying(signal(userId: "awa", name: "Awa", after: 1), id: "c1")

        XCTAssertEqual(sut.alert?.id, "c1")
        XCTAssertEqual(sut.dismissingFlash("other").alert?.id, "c1")
        XCTAssertEqual(sut.dismissingFlash("c1").alert?.id, "r1", "the screen recording capsule comes back")
    }

    // MARK: - Journal fidèle

    func test_timeline_insertsCapturesAtTheirTime_speechFirstOnATie() {
        let hello = segment("Hello", after: 0)
        let thursday = segment("Thursday?", after: 10)
        let shot = CallTranscriptCapture(id: "c1", userId: "karim", displayName: "Karim", kind: .screenshot, capturedAt: t0.addingTimeInterval(10))
        let early = CallTranscriptCapture(id: "c0", userId: "karim", displayName: "Karim", kind: .recording, capturedAt: t0.addingTimeInterval(-1))
        let late = CallTranscriptCapture(id: "c2", userId: "awa", displayName: "Awa", kind: .screenshot, capturedAt: t0.addingTimeInterval(99))

        let items = CallJournalTimeline.merged([hello, thursday], time: \.capturedAt, captures: [late, shot, early])

        XCTAssertEqual(items.map(\.id), ["c0", hello.id.uuidString, thursday.id.uuidString, "c1", "c2"])
    }

    // MARK: - Ligne

    func test_captureLine_namesInAuthorColour_sentenceNeverColoured() {
        let capture = CallTranscriptCapture(id: UUID().uuidString, userId: "karim", displayName: "Karim", kind: .screenshot, capturedAt: t0)

        let line = CallCaptionLine.capture(capture, displayName: "Karim", phrase: "a capturé l’écran", timeLabel: "12:40")

        XCTAssertTrue(line.isEvent)
        XCTAssertEqual(line.speakerName, "Karim")
        XCTAssertEqual(line.speakerColorHex, CallSpeakerColor.hex(for: "karim"))
        XCTAssertNil(line.textColorHex)
        XCTAssertFalse(line.canRevealOriginal)
        XCTAssertEqual(line.announcement, "Karim, a capturé l’écran, 12:40")
    }

    func test_callRecordingLine_namesNobody() {
        let capture = CallTranscriptCapture(id: UUID().uuidString, userId: "awa", displayName: "Awa", kind: .callRecordingStarted, capturedAt: t0)

        let line = CallCaptionLine.capture(capture, displayName: "Awa", phrase: "L’enregistrement de l’appel a commencé", timeLabel: "01:00")

        XCTAssertEqual(line.speakerName, "")
        XCTAssertEqual(line.announcement, "L’enregistrement de l’appel a commencé, 01:00")
    }

    // MARK: - Fil

    func test_remoteSignal_absentKindReadsAsRecording() {
        let alert = CallScreenCaptureAlertData(callId: "call", participantId: "p2", userId: "u2", isCapturing: true)

        let sut = CallCaptureSignal.remote(alert, displayName: "Awa", at: t0)

        XCTAssertEqual(sut.kind, .recording)
        XCTAssertEqual(sut.userId, "u2")
        XCTAssertFalse(sut.isLocal)
    }

    func test_callRecordingSignal_onlyTheMomentsSomethingWasRecorded() {
        XCTAssertNil(CallCaptureSignal.callRecording(.requested(CallRecordingRequestedEvent(callId: "c", recordingId: "r", requesterId: "u", requiredUserIds: [])), at: t0))
        XCTAssertNil(CallCaptureSignal.callRecording(.stopped(CallRecordingStoppedEvent(callId: "c", recordingId: "r", reason: "refused", byUserId: nil, wasRecording: false)), at: t0))
        XCTAssertEqual(CallCaptureSignal.callRecording(.started(CallRecordingStartedEvent(callId: "c", recordingId: "r", recorderId: "u")), at: t0)?.kind, .callRecordingStarted)
        XCTAssertEqual(CallCaptureSignal.callRecording(.stopped(CallRecordingStoppedEvent(callId: "c", recordingId: "r", reason: "stopped", byUserId: "u", wasRecording: true)), at: t0)?.kind, .callRecordingStopped)
    }

    func test_remoteTranscriptMapping_dropsUnknownKinds_andNamesMe() throws {
        let json = Data("""
        [
            {"id": "a", "participantId": "p1", "userId": "me", "displayName": "Server name", "kind": "screenshot", "offsetMs": 0, "at": "2026-11-07T12:00:00Z"},
            {"id": "b", "participantId": "p2", "userId": null, "displayName": null, "kind": "recording", "offsetMs": 1000, "at": "2026-11-07T12:00:01Z"},
            {"id": "c", "participantId": "p3", "userId": "u3", "displayName": "Léa", "kind": "hologram", "offsetMs": 2000, "at": "2026-11-07T12:00:02Z"}
        ]
        """.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let wire = try decoder.decode([APICallTranscriptCapture].self, from: json)

        let captures = CallTranscriptCaptureMapping.captures(wire, localUserId: "me", localName: "Moi")

        XCTAssertEqual(captures.map(\.id), ["a", "b"])
        XCTAssertEqual(captures.map(\.displayName), ["Moi", ""])
        XCTAssertEqual(captures.last?.userId, "p2")
    }

    func test_remoteTranscriptMapping_unrequestedRecordingStop_mapsWithoutAuthor() throws {
        let json = Data("""
        [{"id": "s", "participantId": null, "userId": null, "displayName": null, "kind": "call-recording-stopped", "offsetMs": 0, "at": "2026-11-07T12:00:00Z"}]
        """.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let wire = try decoder.decode([APICallTranscriptCapture].self, from: json)

        let captures = CallTranscriptCaptureMapping.captures(wire, localUserId: "me", localName: "Moi")

        XCTAssertEqual(captures.map(\.kind), [.callRecordingStopped])
        XCTAssertEqual(captures.first?.userId, "")
    }

    func test_captureAlertClearance_pushesTheSelfTileBelowTheCapsule() {
        XCTAssertEqual(CallCaptureAlertClearance.top(isAlertShown: false), 0)
        XCTAssertEqual(CallCaptureAlertClearance.top(isAlertShown: true), 52)
    }

    // MARK: - Collaborateur

    func test_journal_recordsThenResetsAtTheEndOfTheCall() {
        let sut = CallCaptureJournal(makeId: { "x1" })

        sut.record(signal())
        XCTAssertEqual(sut.marks.map(\.id), ["x1"])
        XCTAssertEqual(sut.alert?.id, "x1")

        sut.dismissFlash("x1")
        XCTAssertNil(sut.alert)

        sut.reset()
        XCTAssertTrue(sut.marks.isEmpty)
    }

    func test_names_rosterFirst_thenTheDuoPeer() {
        let empty = GroupCallRoster(localUserId: "me")

        XCTAssertEqual(CallCaptureNames.displayName(for: "u2", roster: empty, fallback: "Awa"), "Awa")
        XCTAssertEqual(CallCaptureNames.displayName(for: "u2", roster: empty, fallback: nil), "")
    }
}
