import XCTest
@testable import MeeshyUI

@MainActor
final class TextAnalyzerTests: XCTestCase {

    private func makeSUT() -> TextAnalyzer {
        TextAnalyzer()
    }

    // MARK: - Initial State

    func test_init_defaultState() {
        let sut = makeSUT()
        XCTAssertNil(sut.language)
        XCTAssertEqual(sut.languageConfidence, 0)
        XCTAssertFalse(sut.isLanguageLocked)
        XCTAssertNil(sut.languageOverride)
        XCTAssertNil(sut.displayLanguage)
    }

    // MARK: - Reset

    func test_reset_clearsAllState() {
        let sut = makeSUT()
        sut.language = DetectedLanguage.supported.first
        sut.languageConfidence = 0.9
        sut.isLanguageLocked = true
        sut.languageOverride = DetectedLanguage.supported.last

        sut.reset()

        XCTAssertNil(sut.language)
        XCTAssertEqual(sut.languageConfidence, 0)
        XCTAssertFalse(sut.isLanguageLocked)
        XCTAssertNil(sut.languageOverride)
    }

    // MARK: - Analyze Empty Text

    func test_analyze_emptyText_resetsLanguage() {
        let sut = makeSUT()
        sut.language = DetectedLanguage.supported.first
        sut.languageConfidence = 0.5

        sut.analyze(text: "")

        XCTAssertNil(sut.language)
        XCTAssertEqual(sut.languageConfidence, 0)
    }

    func test_analyze_emptyText_clearsLock_whenNoOverride() {
        // Spec (mai 2026) : vider le champ libère le verrou de détection
        // SI aucun override manuel n'est en place. Sans ça, après un
        // message envoyé + verrou à 10 mots, la prochaine frappe partirait
        // avec `isLanguageLocked = true` et la détection serait morte.
        let sut = makeSUT()
        let french = DetectedLanguage.supported.first!
        sut.language = french
        sut.languageConfidence = 0.9
        sut.isLanguageLocked = true

        sut.analyze(text: "")

        XCTAssertNil(sut.language)
        XCTAssertEqual(sut.languageConfidence, 0)
        XCTAssertFalse(sut.isLanguageLocked)
    }

    func test_analyze_emptyText_preservesOverride() {
        // Override manuel = choix utilisateur explicite. On le garde même
        // quand le champ se vide, sinon le pill afficherait la langue
        // choisie mais on enverrait la valeur par défaut.
        let sut = makeSUT()
        let english = DetectedLanguage.find(code: "en")!
        sut.languageOverride = english
        sut.language = english
        sut.languageConfidence = 0.95
        sut.isLanguageLocked = true

        sut.analyze(text: "")

        XCTAssertEqual(sut.languageOverride?.code, "en")
        XCTAssertEqual(sut.language?.code, "en")
        XCTAssertTrue(sut.isLanguageLocked)
    }

    // MARK: - Lock To Language

    func test_lockToLanguage_setsAllProperties() {
        let sut = makeSUT()
        let english = DetectedLanguage.find(code: "en")!

        sut.lockToLanguage(english)

        XCTAssertEqual(sut.language?.code, "en")
        XCTAssertEqual(sut.languageOverride?.code, "en")
        XCTAssertEqual(sut.languageConfidence, 1.0)
        XCTAssertTrue(sut.isLanguageLocked)
    }

    // MARK: - Set Language Override

    func test_setLanguageOverride_locksDetection() {
        let sut = makeSUT()
        let spanish = DetectedLanguage.find(code: "es")!

        sut.setLanguageOverride(spanish)

        XCTAssertTrue(sut.isLanguageLocked)
        XCTAssertEqual(sut.languageOverride?.code, "es")
    }

    func test_setLanguageOverride_nil_doesNotLock() {
        let sut = makeSUT()

        sut.setLanguageOverride(nil)

        XCTAssertFalse(sut.isLanguageLocked)
        XCTAssertNil(sut.languageOverride)
    }

    // MARK: - Display Language

    func test_displayLanguage_prefersOverride() {
        let sut = makeSUT()
        let french = DetectedLanguage.find(code: "fr")!
        let english = DetectedLanguage.find(code: "en")!

        sut.language = french
        sut.languageOverride = english

        XCTAssertEqual(sut.displayLanguage?.code, "en")
    }

    func test_displayLanguage_fallsBackToDetected() {
        let sut = makeSUT()
        let french = DetectedLanguage.find(code: "fr")!

        sut.language = french

        XCTAssertEqual(sut.displayLanguage?.code, "fr")
    }

    // MARK: - MainActor isolation (P3 hardening)

    /// `analyze` schedules a debounced `Timer` whose callback bridges back onto
    /// the main actor via `MainActor.assumeIsolated` — a call that traps if it
    /// ever fires off-main. `TextAnalyzer` is now `@MainActor`-isolated (no
    /// longer `@unchecked Sendable`), so the compiler guarantees every caller
    /// — and therefore every Timer this method schedules — is already on the
    /// main thread. This test exercises the call from the (guaranteed-main)
    /// test context and asserts it returns immediately without trapping.
    func test_analyze_calledFromMainActor_returnsImmediatelyWithoutTrapping() {
        let sut = makeSUT()

        sut.analyze(text: "Bonjour le monde, comment allez-vous ?")

        // The Timer-driven update is debounced — synchronously after the call
        // the previous state must still hold, proving `analyze` itself never
        // blocks on (or crashes inside) the MainActor bridge.
        XCTAssertEqual(sut.sentiment, .neutral)
        XCTAssertNil(sut.language)
    }

    // MARK: - DetectedLanguage.find

    func test_findLanguage_byCode() {
        XCTAssertEqual(DetectedLanguage.find(code: "fr")?.name, "Fran\u{00E7}ais")
        XCTAssertEqual(DetectedLanguage.find(code: "en")?.name, "English")
        XCTAssertNil(DetectedLanguage.find(code: "xx"))
    }

    func test_findLanguage_byId() {
        XCTAssertEqual(DetectedLanguage.find(code: "zh-Hans")?.flag, "\u{1F1E8}\u{1F1F3}")
    }
}
