import XCTest
@testable import MeeshySDK

final class EdgeTranscriptionServiceTests: XCTestCase {

    // MARK: - OnDeviceTranscription model tests

    func test_onDeviceTranscription_initSetsAllFields() {
        let segment = OnDeviceTranscriptionSegment(
            text: "hello", timestamp: 0.5, duration: 1.0, confidence: 0.95
        )
        let transcription = OnDeviceTranscription(
            text: "hello world",
            language: "en-US",
            confidence: 0.92,
            segments: [segment],
            speakingRate: 120.0
        )

        XCTAssertEqual(transcription.text, "hello world")
        XCTAssertEqual(transcription.language, "en-US")
        XCTAssertEqual(transcription.confidence, 0.92, accuracy: 0.001)
        XCTAssertEqual(transcription.segments.count, 1)
        XCTAssertEqual(transcription.speakingRate, 120.0)
    }

    func test_onDeviceTranscription_defaultSegmentsEmpty() {
        let transcription = OnDeviceTranscription(
            text: "test", language: "fr-FR", confidence: 0.5
        )

        XCTAssertTrue(transcription.segments.isEmpty)
        XCTAssertNil(transcription.speakingRate)
    }

    // MARK: - OnDeviceTranscriptionSegment model tests

    func test_segment_hasUniqueId() {
        let seg1 = OnDeviceTranscriptionSegment(text: "a", timestamp: 0, duration: 1, confidence: 0.9)
        let seg2 = OnDeviceTranscriptionSegment(text: "a", timestamp: 0, duration: 1, confidence: 0.9)

        XCTAssertNotEqual(seg1.id, seg2.id)
    }

    func test_segment_storesAllValues() {
        let segment = OnDeviceTranscriptionSegment(
            text: "bonjour", timestamp: 1.5, duration: 0.8, confidence: 0.97
        )

        XCTAssertEqual(segment.text, "bonjour")
        XCTAssertEqual(segment.timestamp, 1.5, accuracy: 0.001)
        XCTAssertEqual(segment.duration, 0.8, accuracy: 0.001)
        XCTAssertEqual(segment.confidence, 0.97, accuracy: 0.001)
    }

    // MARK: - EdgeTranscriptionError tests

    func test_notAuthorized_hasErrorDescription() {
        let error = EdgeTranscriptionError.notAuthorized
        XCTAssertEqual(error.errorDescription, "Speech recognition not authorized")
    }

    func test_recognizerUnavailable_hasErrorDescription() {
        let error = EdgeTranscriptionError.recognizerUnavailable
        XCTAssertEqual(error.errorDescription, "Speech recognizer unavailable for this language")
    }

    func test_noResult_hasErrorDescription() {
        let error = EdgeTranscriptionError.noResult
        XCTAssertEqual(error.errorDescription, "No transcription result")
    }

    func test_fileMissing_hasErrorDescription() {
        let error = EdgeTranscriptionError.fileMissing
        XCTAssertEqual(error.errorDescription, "Audio file not found")
    }

    // MARK: - supportedLocales (basic validation)

    func test_supportedLocales_returnsNonEmptyList() {
        let service = EdgeTranscriptionService.shared
        let locales = service.supportedLocales

        // SFSpeechRecognizer should always have some supported locales on any Apple platform
        XCTAssertFalse(locales.isEmpty)
    }

    func test_supportedLocales_areSortedByIdentifier() {
        let service = EdgeTranscriptionService.shared
        let locales = service.supportedLocales
        let identifiers = locales.map(\.identifier)
        XCTAssertEqual(identifiers, identifiers.sorted())
    }

    // MARK: - isLocaleSupported

    func test_isLocaleSupported_enUS_returnsTrue() {
        let service = EdgeTranscriptionService.shared
        // en-US is universally supported on Apple platforms
        XCTAssertTrue(service.isLocaleSupported(Locale(identifier: "en-US")))
    }

    func test_isLocaleSupported_inventedLocale_returnsFalse() {
        let service = EdgeTranscriptionService.shared
        XCTAssertFalse(service.isLocaleSupported(Locale(identifier: "xx-ZZ")))
    }
}
