import XCTest

/// French is the app's **source language** (`Localizable.xcstrings` declares
/// `"sourceLanguage": "fr"`), so an unaccented French string is not a pending
/// translation — it is shipped, visible text. The whole voice-profile surface was
/// written without accents ("Qualite", "Duree totale", "Echec", "pret a l'emploi"),
/// which reads as broken typography to every French user of the screen.
///
/// This suite pins the corrected strings in both places they live — the catalogue
/// (what users actually read) and the `defaultValue` literals in the source (what
/// ships if an entry is ever dropped, and what the next developer copies).
@MainActor
final class VoiceProfileFrenchTypographyTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    /// Voice-profile keys and their expected French, accents included.
    private let expectedFrench: [String: String] = [
        "voice.makePublic.description": "Un échantillon de votre voix sera visible sur votre profil public",
        "voice.profile.addSamples": "Ajouter des échantillons",
        "voice.profile.create": "Créer un profil vocal",
        "voice.profile.createdAt": "Créé le",
        "voice.profile.deleteAlert.message": "Cette action est irréversible. Toutes vos données vocales seront supprimées conformément au RGPD.",
        "voice.profile.empty.description": "Créez un profil vocal pour que vos messages traduits conservent votre voix naturelle.",
        "voice.profile.lastUsed": "Dernière utilisation",
        "voice.profile.quality": "Qualité",
        "voice.profile.samples": "Échantillons",
        "voice.profile.status.expired.description": "Veuillez enregistrer de nouveaux échantillons",
        "voice.profile.status.expired.label": "Expiré",
        "voice.profile.status.failed.description": "L'analyse a échoué, veuillez réessayer",
        "voice.profile.status.failed.label": "Échec",
        "voice.profile.status.processing.description": "L'IA analyse vos échantillons vocaux",
        "voice.profile.status.ready.description": "Votre profil vocal est prêt à l'emploi",
        "voice.profile.totalDuration": "Durée totale",
        "voice.profile.voiceSamples": "Échantillons vocaux",
    ]

    private func catalogStrings() throws -> [String: Any] {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let catalog = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return catalog?["strings"] as? [String: Any] ?? [:]
    }

    func test_catalogueShipsAccentedFrench() throws {
        let strings = try catalogStrings()
        for (key, expected) in expectedFrench.sorted(by: { $0.key < $1.key }) {
            let entry = strings[key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any]
            let french = localizations?["fr"] as? [String: Any]
            let value = (french?["stringUnit"] as? [String: Any])?["value"] as? String
            XCTAssertEqual(
                value, expected,
                "\(key) is user-visible French in the app's source language — it must carry its accents."
            )
        }
    }

    func test_sourceDefaultsMatchTheCatalogue() throws {
        // A `defaultValue` that disagrees with the catalogue is a second, silent copy
        // of the string: it ships whenever the entry is missing, and it is what the
        // next developer duplicates into a new call site.
        let sources = ["Meeshy/Features/Main/Views/VoiceProfileManageView.swift",
                       "Meeshy/Features/Main/Views/VoiceProfileWizardView.swift"]
            .map { iosRoot.appendingPathComponent($0) }

        for url in sources {
            let source = try String(contentsOf: url, encoding: .utf8)
            for (key, expected) in expectedFrench where source.contains("\"\(key)\"") {
                XCTAssertTrue(
                    source.contains("String(localized: \"\(key)\", defaultValue: \"\(expected)\""),
                    "\(url.lastPathComponent) declares \(key) with a defaultValue that no longer matches " +
                    "the catalogue's French."
                )
            }
        }
    }

    func test_addSamplesSheet_titlesItsNavigationBar() throws {
        // The sheet already shows a navigation bar for its Close button; its title
        // belongs in that bar, not in a Text inside the content.
        let source = try String(
            contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/VoiceProfileManageView.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(
            source.contains(".navigationTitle(String(localized: \"voice.profile.addSamples\""),
            "The add-samples sheet must title its navigation bar so the title carries the header trait " +
            "and scales like every other sheet's."
        )
        XCTAssertFalse(
            source.contains("Text(String(localized: \"voice.profile.addSamples\""),
            "The hand-rolled title Text must be gone — two titles would be announced twice by VoiceOver."
        )
    }
}
