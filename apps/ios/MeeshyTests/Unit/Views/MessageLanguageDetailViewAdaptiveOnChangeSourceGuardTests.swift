import XCTest

/// Dette Swift/SwiftUI (backlog `tasks/ios-debt-routine-progress.md`, item nommé lors du run
/// build-break du 2026-08-16 — `debt-message-language-detail-adaptive-onchange`, préparé puis mis
/// de côté sans jamais être implémenté) : `MessageLanguageDetailView.body` pilotait sa
/// resynchronisation via le `.onChange(of:)` brut à un seul paramètre — déprécié depuis iOS 17
/// (`feedback_no_raw_swiftui_onchange.md`, mémoire projet). Le patron déjà établi et testé
/// (`AdaptiveOnChangeSweepTests.swift`, SDK) est `adaptiveOnChange(of:initial:_:)`
/// (`packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveOnChange.swift`), qui expose la forme
/// iOS 17 `(oldValue, newValue)` partout tout en repliant sur iOS 16. Ce fichier app-side n'était
/// couvert par AUCUNE garde — la garde SDK ne liste que des fichiers sous `Sources/MeeshyUI/`.
final class MessageLanguageDetailViewAdaptiveOnChangeSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Isole le corps de `body` plutôt que de grepper le fichier entier — une future occurrence
    /// non liée de `.onChange(of:` ailleurs dans ce fichier ne doit ni faire échouer ni masquer
    /// cette garde précise.
    private func bodyContent(in src: String) throws -> String {
        let marker = "var body: some View {"
        guard let start = src.range(of: marker) else {
            XCTFail("Signature de `body` introuvable — MessageLanguageDetailView.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        guard let end = src.range(of: "private var content: some View {", range: start.upperBound..<src.endIndex) else {
            XCTFail("Fin du corps de `body` introuvable — MessageLanguageDetailView.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        return String(src[start.upperBound..<end.lowerBound])
    }

    func test_body_reactsToPropChanges_viaAdaptiveOnChange_notRawOnChange() throws {
        let stripped = AppSourceGuard.stripComments(try source())
        let body = try bodyContent(in: stripped)

        XCTAssertFalse(
            body.contains(".onChange(of: textTranslations) { _ in"),
            "body ne doit plus utiliser le .onChange(of:) brut à un seul paramètre (déprécié iOS 17) " +
            "pour textTranslations — adaptiveOnChange est le patron établi (AdaptiveOnChangeSweepTests, SDK)."
        )
        XCTAssertTrue(
            body.contains(".adaptiveOnChange(of: textTranslations)"),
            "body doit resynchroniser les traductions texte via adaptiveOnChange."
        )

        XCTAssertFalse(
            body.contains(".onChange(of: translatedAudios) { _ in"),
            "body ne doit plus utiliser le .onChange(of:) brut à un seul paramètre (déprécié iOS 17) " +
            "pour translatedAudios — adaptiveOnChange est le patron établi (AdaptiveOnChangeSweepTests, SDK)."
        )
        XCTAssertTrue(
            body.contains(".adaptiveOnChange(of: translatedAudios)"),
            "body doit resynchroniser les audios traduits via adaptiveOnChange."
        )
    }
}
