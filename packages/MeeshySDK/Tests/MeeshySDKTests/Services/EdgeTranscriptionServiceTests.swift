import XCTest
import Speech
@testable import MeeshySDK

@MainActor
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

    func test_unsupportedLocale_includesIdentifierInDescription() {
        let error = EdgeTranscriptionError.unsupportedLocale("xx-ZZ")
        XCTAssertEqual(
            error.errorDescription,
            "Locale 'xx-ZZ' is not supported for on-device transcription"
        )
    }

    func test_transcriptionFailed_includesUnderlyingMessage() {
        let error = EdgeTranscriptionError.transcriptionFailed("Network down")
        XCTAssertEqual(error.errorDescription, "Transcription failed: Network down")
    }

    func test_cancelled_hasErrorDescription() {
        let error = EdgeTranscriptionError.cancelled
        XCTAssertEqual(error.errorDescription, "Transcription cancelled")
    }

    func test_errors_areEquatable() {
        XCTAssertEqual(EdgeTranscriptionError.notAuthorized, .notAuthorized)
        XCTAssertEqual(
            EdgeTranscriptionError.unsupportedLocale("fr"),
            .unsupportedLocale("fr")
        )
        XCTAssertNotEqual(
            EdgeTranscriptionError.unsupportedLocale("fr"),
            .unsupportedLocale("en")
        )
        XCTAssertNotEqual(EdgeTranscriptionError.notAuthorized, .cancelled)
    }

    // MARK: - supportedLocales (basic validation)

    func test_supportedLocales_returnsNonEmptyList() {
        let service = EdgeTranscriptionService.shared
        let locales = service.supportedLocales

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
        XCTAssertTrue(service.isLocaleSupported(Locale(identifier: "en-US")))
    }

    func test_isLocaleSupported_inventedLocale_returnsFalse() {
        let service = EdgeTranscriptionService.shared
        XCTAssertFalse(service.isLocaleSupported(Locale(identifier: "xx-ZZ")))
    }

    // MARK: - normalizedLocale (regression coverage for the crash fix)

    func test_normalizedLocale_fullIdentifier_isPassedThrough() {
        let input = Locale(identifier: "en-US")
        let normalized = EdgeTranscriptionService.normalizedLocale(for: input)
        XCTAssertEqual(normalized.identifier, "en-US")
    }

    func test_normalizedLocale_languageOnlyEn_promotedToFullIdentifier() {
        let input = Locale(identifier: "en")
        let normalized = EdgeTranscriptionService.normalizedLocale(for: input)
        XCTAssertEqual(normalized.language.languageCode?.identifier, "en")
        XCTAssertNotNil(normalized.region, "Expected promoted locale to carry a region")
    }

    func test_normalizedLocale_languageOnlyFr_promotedToFullIdentifier() {
        let input = Locale(identifier: "fr")
        let normalized = EdgeTranscriptionService.normalizedLocale(for: input)
        XCTAssertEqual(normalized.language.languageCode?.identifier, "fr")
        XCTAssertNotNil(normalized.region, "Expected promoted locale to carry a region")
    }

    func test_normalizedLocale_languageOnly_resolvesToSupportedRecognizerLocale() {
        // Whatever region is picked, it MUST be a locale SFSpeechRecognizer
        // accepts — otherwise the original crash returns.
        for code in ["fr", "en", "es", "de", "it", "pt", "ja", "zh", "ko", "ar"] {
            let normalized = EdgeTranscriptionService.normalizedLocale(
                for: Locale(identifier: code)
            )
            XCTAssertTrue(
                SFSpeechRecognizer.supportedLocales().contains(normalized),
                "Normalized locale '\(normalized.identifier)' for input '\(code)' is not supported by SFSpeechRecognizer"
            )
        }
    }

    func test_normalizedLocale_unknownLanguage_returnsInputUntouched() {
        let input = Locale(identifier: "xx")
        let normalized = EdgeTranscriptionService.normalizedLocale(for: input)
        // No supported recognizer for "xx" -> keep input so the caller can
        // surface unsupportedLocale().
        XCTAssertEqual(normalized.identifier, "xx")
    }

    // MARK: - availableLocales

    func test_availableLocales_isSubsetOfSupportedLocales() {
        let service = EdgeTranscriptionService.shared
        let supported = Set(service.supportedLocales.map(\.identifier))
        let available = Set(service.availableLocales.map(\.identifier))
        XCTAssertTrue(available.isSubset(of: supported))
    }

    // MARK: - cancel (smoke test — should be safe to call when idle)

    func test_cancel_whenIdle_doesNotCrash() {
        let service = EdgeTranscriptionService.shared
        service.cancel()
        XCTAssertFalse(service.isTranscribing)
    }
}
