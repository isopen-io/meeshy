import XCTest
@testable import Meeshy

@MainActor
final class CallTranscriptionServiceTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> CallTranscriptionService {
        CallTranscriptionService()
    }

    private func makeSegment(
        text: String = "hello",
        speakerId: String = "user1",
        startTime: TimeInterval = 0,
        endTime: TimeInterval = 1,
        isFinal: Bool = false,
        confidence: Double = 0.9,
        language: String = "en"
    ) -> TranscriptionSegment {
        TranscriptionSegment(
            id: UUID(),
            text: text,
            speakerId: speakerId,
            startTime: startTime,
            endTime: endTime,
            isFinal: isFinal,
            confidence: confidence,
            language: language
        )
    }

    // MARK: - Initial State

    func test_init_isNotTranscribing() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isTranscribing)
    }

    func test_init_segmentsIsEmpty() {
        let sut = makeSUT()
        XCTAssertTrue(sut.segments.isEmpty)
    }

    func test_init_permissionIsNotDetermined() {
        let sut = makeSUT()
        XCTAssertEqual(sut.permission, .notDetermined)
    }

    func test_init_lastErrorIsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.lastError)
    }

    func test_init_roleIsUndecided() {
        let sut = makeSUT()
        XCTAssertEqual(sut.role, .undecided)
    }

    func test_init_localCapabilityIsNone() {
        let sut = makeSUT()
        XCTAssertEqual(sut.localCapability, .none)
    }

    // MARK: - Role Negotiation

    func test_resolveRole_bothNone_staysUndecided() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .none, remoteCapability: .none, isInitiator: true)
        XCTAssertEqual(sut.role, .undecided)
    }

    func test_resolveRole_localOnly_becomesLeader() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .standard, remoteCapability: .none, isInitiator: false)
        XCTAssertEqual(sut.role, .leader)
    }

    func test_resolveRole_remoteOnly_becomesFollower() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .none, remoteCapability: .standard, isInitiator: true)
        XCTAssertEqual(sut.role, .follower)
    }

    func test_resolveRole_localHigher_becomesLeader() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .advanced, remoteCapability: .basic, isInitiator: false)
        XCTAssertEqual(sut.role, .leader)
    }

    func test_resolveRole_remoteHigher_becomesFollower() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .basic, remoteCapability: .advanced, isInitiator: true)
        XCTAssertEqual(sut.role, .follower)
    }

    func test_resolveRole_tie_initiatorBecomesLeader() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .standard, remoteCapability: .standard, isInitiator: true)
        XCTAssertEqual(sut.role, .leader)
    }

    func test_resolveRole_tie_nonInitiatorBecomesFollower() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .standard, remoteCapability: .standard, isInitiator: false)
        XCTAssertEqual(sut.role, .follower)
    }

    // MARK: - Follower Receive

    func test_receiveRemoteSegment_asFollower_addsSegment() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .none, remoteCapability: .standard, isInitiator: true)

        let segment = makeSegment(text: "remote text", startTime: 1.0)
        sut.receiveRemoteSegment(segment)

        XCTAssertEqual(sut.segments.count, 1)
        XCTAssertEqual(sut.segments.first?.text, "remote text")
    }

    func test_receiveRemoteSegment_asLeader_ignoresSegment() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .standard, remoteCapability: .none, isInitiator: true)

        let segment = makeSegment()
        sut.receiveRemoteSegment(segment)

        XCTAssertTrue(sut.segments.isEmpty)
    }

    // MARK: - Pre-role Buffer (undecided)

    func test_receiveRemoteSegment_asUndecided_doesNotAddToSegments() {
        let sut = makeSUT()
        // role defaults to .undecided

        sut.receiveRemoteSegment(makeSegment(text: "early"))

        XCTAssertTrue(
            sut.segments.isEmpty,
            "Segments must not appear before role is resolved — the overlay would " +
            "display content attributed to the wrong speaker or in the wrong state."
        )
    }

    func test_receiveRemoteSegment_asUndecided_thenFollower_replaysBuffer() {
        let sut = makeSUT()

        let s1 = makeSegment(text: "first", startTime: 0)
        let s2 = makeSegment(text: "second", startTime: 1)
        sut.receiveRemoteSegment(s1)
        sut.receiveRemoteSegment(s2)

        // Role resolves to follower after segments arrived
        sut.resolveRole(localCapability: .none, remoteCapability: .standard, isInitiator: true)

        XCTAssertEqual(sut.segments.count, 2, "Buffered segments must be replayed when role resolves to follower")
        XCTAssertEqual(sut.segments[0].text, "first")
        XCTAssertEqual(sut.segments[1].text, "second")
    }

    func test_receiveRemoteSegment_asUndecided_thenLeader_discardsBuffer() {
        let sut = makeSUT()

        sut.receiveRemoteSegment(makeSegment(text: "buffered"))

        sut.resolveRole(localCapability: .standard, remoteCapability: .none, isInitiator: true)

        XCTAssertTrue(
            sut.segments.isEmpty,
            "Buffered segments from undecided phase must be discarded when role resolves to leader."
        )
    }

    func test_receiveRemoteSegment_asUndecided_bufferCapAtTen() {
        let sut = makeSUT()

        for i in 0..<15 {
            sut.receiveRemoteSegment(makeSegment(text: "seg \(i)", startTime: Double(i)))
        }

        sut.resolveRole(localCapability: .none, remoteCapability: .standard, isInitiator: true)

        XCTAssertEqual(
            sut.segments.count, 10,
            "Buffer cap of 10 must prevent unbounded accumulation when DataChannel " +
            "segments arrive long before capability exchange completes."
        )
    }

    func test_receiveRemoteSegment_asUndecided_afterResolvedToFollower_addedDirectly() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .none, remoteCapability: .standard, isInitiator: true)

        sut.receiveRemoteSegment(makeSegment(text: "post-resolve"))

        XCTAssertEqual(sut.segments.count, 1)
        XCTAssertEqual(sut.segments.first?.text, "post-resolve")
    }

    func test_resetForCallEnd_clearsPendingBuffer() {
        let sut = makeSUT()
        // Buffer two segments in undecided state
        sut.receiveRemoteSegment(makeSegment(text: "a"))
        sut.receiveRemoteSegment(makeSegment(text: "b"))

        sut.resetForCallEnd()

        // After reset, resolving to follower should NOT replay stale segments
        sut.resolveRole(localCapability: .none, remoteCapability: .standard, isInitiator: true)
        XCTAssertTrue(
            sut.segments.isEmpty,
            "resetForCallEnd must purge the pending buffer so stale segments from a " +
            "previous call never appear in the next call."
        )
    }

    // MARK: - Displayed Segments

    func test_displayedSegments_limitsToMaxDisplayed() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .none, remoteCapability: .standard, isInitiator: true)

        for i in 0..<10 {
            let segment = makeSegment(text: "seg \(i)", startTime: Double(i))
            sut.receiveRemoteSegment(segment)
        }

        XCTAssertEqual(sut.displayedSegments.count, 5)
    }

    // MARK: - Permission Guard (startTranscribing)

    func test_startTranscribing_whenPermissionNotDetermined_doesNotStart() {
        let sut = makeSUT()
        // permission defaults to .notDetermined — no requestPermission() called

        sut.startTranscribing(
            localLanguage: "en",
            remoteLanguage: "fr",
            localUserId: "local",
            remoteUserId: "remote"
        )

        XCTAssertFalse(sut.isTranscribing, "Must not start transcription when permission is notDetermined")
        XCTAssertEqual(sut.lastError, .permissionDenied, "Must set permissionDenied error when not authorized")
    }

    func test_startTranscribing_whenPermissionNotDetermined_doesNotSetIsTranscribingTrue() {
        let sut = makeSUT()

        sut.startTranscribing(
            localLanguage: "en",
            remoteLanguage: "fr",
            localUserId: "local",
            remoteUserId: "remote"
        )

        XCTAssertFalse(sut.isTranscribing)
    }

    func test_startTranscribing_calledTwiceWhileNotAuthorized_lastErrorRemainsPermissionDenied() {
        let sut = makeSUT()

        sut.startTranscribing(localLanguage: "en", remoteLanguage: "fr", localUserId: "l", remoteUserId: "r")
        sut.startTranscribing(localLanguage: "en", remoteLanguage: "fr", localUserId: "l", remoteUserId: "r")

        XCTAssertEqual(sut.lastError, .permissionDenied)
    }

    // MARK: - Stop Transcribing

    func test_stopTranscribing_clearsSegmentsAndState() {
        let sut = makeSUT()
        sut.resolveRole(localCapability: .none, remoteCapability: .standard, isInitiator: true)
        sut.receiveRemoteSegment(makeSegment())

        sut.stopTranscribing()

        XCTAssertFalse(sut.isTranscribing)
        XCTAssertTrue(sut.segments.isEmpty)
        XCTAssertNil(sut.lastError)
    }

    // MARK: - Stale Recognizer Callback After Teardown

    func test_applyRecognitionResult_whenNotTranscribing_doesNotRepopulateSegments() {
        // Regression guard: the on-device recognizer callback runs off-MainActor
        // and hops back via Task.detached, so a result can still be in flight
        // when stopTranscribing()/resetForCallEnd() has already cleared state for
        // a call that just ended. `isTranscribing` defaults to false (as it does
        // here, and as it remains in every test in this file since none drive a
        // real SFSpeechRecognizer session), so this exercises exactly that stale-
        // callback path.
        let sut = makeSUT()
        XCTAssertFalse(sut.isTranscribing)

        sut.applyRecognitionResult(
            segments: [makeSegment(text: "stale from previous call")],
            speakerId: "user1",
            isFinal: true,
            boundaryText: "stale from previous call"
        )

        XCTAssertTrue(
            sut.segments.isEmpty,
            "A recognizer callback that resolves after teardown (isTranscribing == false) " +
            "must not repopulate the transcript with data from an ended call."
        )
    }
}

// MARK: - TranscriptionSegment Data Model Tests

@MainActor
final class TranscriptionSegmentTests: XCTestCase {

    func test_segment_storesAllProperties() {
        let id = UUID()
        let segment = TranscriptionSegment(
            id: id,
            text: "hello world",
            speakerId: "user123",
            startTime: 1.5,
            endTime: 3.0,
            isFinal: true,
            confidence: 0.95,
            language: "en",
            translatedText: "bonjour le monde",
            translatedLanguage: "fr"
        )

        XCTAssertEqual(segment.id, id)
        XCTAssertEqual(segment.text, "hello world")
        XCTAssertEqual(segment.speakerId, "user123")
        XCTAssertEqual(segment.startTime, 1.5)
        XCTAssertEqual(segment.endTime, 3.0)
        XCTAssertTrue(segment.isFinal)
        XCTAssertEqual(segment.confidence, 0.95)
        XCTAssertEqual(segment.language, "en")
        XCTAssertEqual(segment.translatedText, "bonjour le monde")
        XCTAssertEqual(segment.translatedLanguage, "fr")
    }

    func test_segment_translationFieldsDefaultToNil() {
        let segment = TranscriptionSegment(
            id: UUID(),
            text: "test",
            speakerId: "s1",
            startTime: 0,
            endTime: 1,
            isFinal: false,
            confidence: 0.8,
            language: "en"
        )

        XCTAssertNil(segment.translatedText)
        XCTAssertNil(segment.translatedLanguage)
    }

    func test_segment_equatable() {
        let id = UUID()
        let a = TranscriptionSegment(id: id, text: "hi", speakerId: "u1", startTime: 0, endTime: 1, isFinal: true, confidence: 1, language: "en")
        let b = TranscriptionSegment(id: id, text: "hi", speakerId: "u1", startTime: 0, endTime: 1, isFinal: true, confidence: 1, language: "en")
        XCTAssertEqual(a, b)
    }
}

// MARK: - TranscriptionCapabilityLevel Tests

@MainActor
final class TranscriptionCapabilityLevelTests: XCTestCase {

    func test_ordering_noneIsLessThanBasic() {
        XCTAssertLessThan(TranscriptionCapabilityLevel.none, .basic)
    }

    func test_ordering_basicIsLessThanStandard() {
        XCTAssertLessThan(TranscriptionCapabilityLevel.basic, .standard)
    }

    func test_ordering_standardIsLessThanAdvanced() {
        XCTAssertLessThan(TranscriptionCapabilityLevel.standard, .advanced)
    }

    func test_rawValues() {
        XCTAssertEqual(TranscriptionCapabilityLevel.none.rawValue, "none")
        XCTAssertEqual(TranscriptionCapabilityLevel.basic.rawValue, "basic")
        XCTAssertEqual(TranscriptionCapabilityLevel.standard.rawValue, "standard")
        XCTAssertEqual(TranscriptionCapabilityLevel.advanced.rawValue, "advanced")
    }
}

// MARK: - TranscriptionPermission Tests

@MainActor
final class TranscriptionPermissionTests: XCTestCase {

    func test_equatable() {
        XCTAssertEqual(TranscriptionPermission.authorized, .authorized)
        XCTAssertNotEqual(TranscriptionPermission.authorized, .denied)
    }
}

// MARK: - TranscriptionError Tests

@MainActor
final class TranscriptionErrorTests: XCTestCase {

    func test_permissionDenied_hasDescription() {
        let error = TranscriptionError.permissionDenied
        XCTAssertEqual(error.errorDescription, "Speech recognition permission denied")
    }

    func test_recognizerUnavailable_includesLanguage() {
        let error = TranscriptionError.recognizerUnavailable(language: "fr")
        XCTAssertTrue(error.errorDescription?.contains("fr") ?? false)
    }

    func test_onDeviceNotSupported_includesLanguage() {
        let error = TranscriptionError.onDeviceNotSupported(language: "zh")
        XCTAssertTrue(error.errorDescription?.contains("zh") ?? false)
    }
}
