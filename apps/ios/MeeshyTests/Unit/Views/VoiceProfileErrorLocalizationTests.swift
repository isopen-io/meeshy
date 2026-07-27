import XCTest

/// The voice-profile ViewModels published their error messages as **raw French
/// literals** assigned straight to `@Published var error`, which
/// `VoiceProfileManageView` renders verbatim. Every non-French user therefore read
/// French when anything failed on that screen — and two of those literals were
/// missing their accents on top.
///
/// This suite pins both halves: the error strings resolve through the catalogue in
/// every locale, and no raw French literal creeps back into the ViewModels.
@MainActor
final class VoiceProfileErrorLocalizationTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private let supportedLocales: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    private let errorKeys = [
        "voice.profile.error.load",
        "voice.profile.error.visibility",
        "voice.profile.error.cloning",
        "voice.profile.error.deleteSample",
        "voice.profile.error.deleteProfile",
        "voice.profile.error.uploadSamples",
        "voice.profile.wizard.error.consent",
        "voice.profile.wizard.error.uploadSamples",
    ]

    private let viewModels = [
        "Meeshy/Features/Main/ViewModels/VoiceProfileManageViewModel.swift",
        "Meeshy/Features/Main/ViewModels/VoiceProfileWizardViewModel.swift",
    ]

    private func catalogStrings() throws -> [String: Any] {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let catalog = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return catalog?["strings"] as? [String: Any] ?? [:]
    }

    func test_everyErrorMessageIsTranslatedInEveryLocale() throws {
        let strings = try catalogStrings()
        for key in errorKeys {
            let entry = strings[key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any] ?? [:]
            XCTAssertEqual(
                Set(localizations.keys), supportedLocales,
                "\(key) is shown to the user when a voice-profile operation fails; it must exist in " +
                "every locale the app advertises."
            )
        }
    }

    func test_viewModelsPublishNoRawFrenchLiteral() throws {
        // `self.error = "…"` assigns a literal with no trip through the catalogue —
        // whatever the device language, that exact string reaches the screen.
        for path in viewModels {
            let source = try String(contentsOf: iosRoot.appendingPathComponent(path), encoding: .utf8)
            XCTAssertFalse(
                source.contains("self.error = \""),
                "\(path) assigns a raw string literal to `error`. Route it through " +
                "String(localized:defaultValue:bundle:) so it is translated."
            )
            XCTAssertTrue(
                source.contains("self.error = String(localized:"),
                "\(path) must publish its errors through the catalogue."
            )
        }
    }

    /// Unaccented spellings that are **not** valid French words, so a hit is a real
    /// defect and never a homograph. Deliberately excluded: "Supprimer", "Archive",
    /// "Envoyer", "Modifier" — all correct as written, and matching them would make
    /// this guard cry wolf until someone disables it.
    private let unaccentedFrench = [
        "echantillon", "Echantillon", "visibilite", "Visibilite", "qualite", "Qualite",
        "duree", "Duree", "derniere", "Derniere", "irreversible", "donnees", "conformement",
        "envoye ", "envoye.", "envoye\"", "reessayer", "Reessayer", "echoue", "Echec ", "Echec\"",
    ]

    func test_frenchCatalogueValuesKeepTheirAccents() throws {
        // French is the catalogue's source language (`"sourceLanguage": "fr"`), so an
        // unaccented French value is shipped text, not a pending translation.
        let strings = try catalogStrings()
        var offenders: [String] = []
        for (key, entry) in strings {
            guard let localizations = (entry as? [String: Any])?["localizations"] as? [String: Any],
                  let french = localizations["fr"] as? [String: Any],
                  let value = (french["stringUnit"] as? [String: Any])?["value"] as? String
            else { continue }
            if unaccentedFrench.contains(where: value.contains) {
                offenders.append("\(key) = \(value)")
            }
        }
        XCTAssertEqual(
            offenders.sorted(), [],
            "French is the source language of the catalogue: these values ship as-is and must carry " +
            "their accents."
        )
    }
}
