import XCTest

/// A ViewModel that assigns a **string literal** to the error it publishes ships that
/// exact text to the screen, whatever the device language:
///
/// ```swift
/// self.error = "Code invalide. Verifiez et reessayez."
/// ```
///
/// 225i localized the eight occurrences on the voice-profile surface and guarded that
/// surface by name. Widening the sweep to `errorMessage` — not just `error` — then
/// found **eleven more** across three other ViewModels, including the 2FA screen,
/// where the message a user most needs to read is the one telling them their code was
/// rejected.
///
/// Guarding two files by name would have missed exactly those, so this guard sweeps
/// **every ViewModel** instead. The lesson is in the shape of the assertion, not in
/// the list of files.
@MainActor
final class ViewModelErrorLocalizationTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    /// Assignments of a literal to a published error property, by file name.
    private func viewModelsPublishingLiteralErrors() throws -> [String: [String]] {
        let root = iosRoot.appendingPathComponent("Meeshy")
        guard let walker = FileManager.default.enumerator(atPath: root.path) else { return [:] }

        var offenders: [String: [String]] = [:]
        for case let relativePath as String in walker where relativePath.hasSuffix("ViewModel.swift") {
            let source = try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
            let hits = source.split(separator: "\n").filter { line in
                // `= ""` is a reset to empty, not a user-facing message.
                (line.contains("error = \"") || line.contains("errorMessage = \""))
                    && !line.contains("= \"\"")
            }
            if !hits.isEmpty {
                offenders[(relativePath as NSString).lastPathComponent] =
                    hits.map { $0.trimmingCharacters(in: .whitespaces) }
            }
        }
        return offenders
    }

    func test_noViewModelPublishesALiteralErrorMessage() throws {
        let offenders = try viewModelsPublishingLiteralErrors()
        XCTAssertEqual(
            offenders.keys.sorted(), [],
            "These ViewModels assign a string literal to their published error, so that text reaches " +
            "the screen untranslated. Route it through String(localized:defaultValue:bundle:). " +
            "Offenders: \(offenders)"
        )
    }

    func test_everyErrorKeyIsTranslatedInEveryLocale() throws {
        let supportedLocales: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]
        let keys = [
            "twofactor.error.status", "twofactor.error.setup", "twofactor.error.invalidCode",
            "twofactor.error.disable", "twofactor.error.backupCodes",
            "conversation.options.error.loadPreferences", "conversation.options.error.createCategory",
            "conversation.options.error.deleteConversation", "conversation.options.error.leaveConversation",
            "conversation.options.error.save",
        ]
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let strings = (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["strings"] as? [String: Any] ?? [:]

        for key in keys {
            let entry = strings[key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any] ?? [:]
            XCTAssertEqual(
                Set(localizations.keys), supportedLocales,
                "\(key) is shown when an operation fails; it must exist in every shipped locale."
            )
        }
    }

    func test_twoFactorViewDoesNotFallBackToAFrenchLiteral() throws {
        // `viewModel.error ?? "…"` re-introduces the defect on the fallback path: the
        // ViewModel is localized, but the screen substitutes a hardcoded French string
        // whenever the ViewModel has not published one.
        let source = try String(
            contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/TwoFactorSetupView.swift"),
            encoding: .utf8
        )
        XCTAssertFalse(
            source.contains("?? \"Impossible") || source.contains("?? \"Code invalide"),
            "TwoFactorSetupView falls back to a hardcoded French message; the fallback must be " +
            "localized too, or the fix only covers the path where the ViewModel spoke first."
        )
    }
}
