import XCTest
@testable import Meeshy

/// Pinning tests for `ComposerLanguageResolver` — the pure decision behind
/// the `UniversalComposerBar`'s real-time language detection.
///
/// Spec (May 2026) — Prisme Linguistique :
/// - Detection runs from word 1, re-evaluating at each keystroke.
/// - The composer switches to the detected language **only** when
///   `NLLanguageRecognizer` reports ≥ 86 % confidence.
/// - Below 86 %, the composer stays on the default (« fr »).
/// - A manual override (user picked a language) always wins, regardless
///   of confidence.
/// - At 10 words (`TextAnalyzer.wordCountThreshold`) detection stops —
///   the last accepted language is final for this message.
@MainActor
final class ComposerLanguageResolverTests: XCTestCase {

    // MARK: - Manual override always wins

    func test_resolve_overridePresent_returnsOverride() {
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: "en",
            detected: "de",
            confidence: 0.99,
            force: false
        )
        XCTAssertEqual(next, "en", "Override wins over detection")
    }

    func test_resolve_overrideEqualsCurrent_returnsNil() {
        let next = ComposerLanguageResolver.resolve(
            current: "en",
            override: "en",
            detected: "fr",
            confidence: 0.99,
            force: false
        )
        XCTAssertNil(next)
    }

    // MARK: - Detected propagates ONLY at ≥ 86 % confidence

    func test_resolve_detectedAtConfidenceFloor_propagates() {
        // Exactly at 0.86 — accepted (`< floor` is the rejection condition).
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: nil,
            detected: "en",
            confidence: ComposerLanguageResolver.confidenceFloor,
            force: false
        )
        XCTAssertEqual(next, "en")
    }

    func test_resolve_detectedAboveFloor_propagates() {
        // 0.95 confidence : firm signal → switch the pill.
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: nil,
            detected: "en",
            confidence: 0.95,
            force: false
        )
        XCTAssertEqual(next, "en")
    }

    func test_resolve_detectedJustBelowFloor_returnsNil() {
        // 0.85 < 0.86 floor → stay on French (default).
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: nil,
            detected: "en",
            confidence: 0.85,
            force: false
        )
        XCTAssertNil(next, "0.85 is below the 86 % spec floor — pill must stay FR")
    }

    func test_resolve_detectedLowConfidence_returnsNil() {
        // 0.5 confidence : nope, stay on default.
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: nil,
            detected: "en",
            confidence: 0.5,
            force: false
        )
        XCTAssertNil(next)
    }

    // MARK: - Force bypasses the confidence floor (manual override path)

    func test_resolve_forceWithLowConfidence_propagates() {
        // User explicitly picked a language : trust the caller, apply
        // regardless of confidence.
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: nil,
            detected: "en",
            confidence: 0.1,
            force: true
        )
        XCTAssertEqual(next, "en")
    }

    func test_resolve_detectedEqualsCurrent_returnsNil() {
        // Already on the right language — nothing to do, no spurious callback.
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: nil,
            detected: "fr",
            confidence: 0.9,
            force: false
        )
        XCTAssertNil(next)
    }

    // MARK: - Nil detected

    func test_resolve_noDetectedNoOverride_returnsNil() {
        // Empty text or analyzer reset : no candidate to apply.
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: nil,
            detected: nil,
            confidence: 0,
            force: false
        )
        XCTAssertNil(next)
    }

    func test_resolve_noDetectedButForce_returnsNil() {
        // Force can't materialize a language out of thin air.
        let next = ComposerLanguageResolver.resolve(
            current: "fr",
            override: nil,
            detected: nil,
            confidence: 0,
            force: true
        )
        XCTAssertNil(next)
    }

    // MARK: - Spec constants

    func test_confidenceFloor_isExactly86Percent() {
        // Pinning the spec value : if someone changes this, the test fails
        // and forces them to read the comment + the spec.
        XCTAssertEqual(ComposerLanguageResolver.confidenceFloor, 0.86)
    }

    func test_defaultComposerLanguage_isFrench() {
        // Prisme Linguistique spec : start in French. `Locale.current` is
        // intentionally ignored (it's the UI language, not the content one).
        XCTAssertEqual(DefaultComposerLanguage.resolve(), "fr")
    }
}
