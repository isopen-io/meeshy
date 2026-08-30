import XCTest
@testable import Meeshy

/// Les toasts du flux de publication de story affichaient « Story published »
/// et « Failed to publish story » EN DUR dans les 7 langues : les deux clés
/// étaient absentes du catalogue et leur `defaultValue` était en anglais alors
/// que la langue source du catalogue est le français. Le cliquet
/// `FrenchDefaultValueRatchetTests` ne les voyait pas — il ne teste que les
/// `defaultValue` déjà français (leçon
/// `reference_french_ratchet_misses_accentless_keys`).
final class StoryPublishToastLocalizationTests: XCTestCase {

    private static let keys = [
        "story.published",
        "story.publishError",
        "story.upload.queued",
        "story.upload.a11y.stacked",
    ]

    private static let interfaceLanguages = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    func test_storyPublishToastKeys_arePresentInCatalogForAllInterfaceLanguages() throws {
        let strings = try Self.catalogStrings()

        for key in Self.keys {
            guard let localizations = strings[key] else {
                XCTFail("Clé absente du catalogue : \(key)")
                continue
            }
            for language in Self.interfaceLanguages {
                let value = localizations[language]
                XCTAssertNotNil(value, "\(key) n'a pas de traduction \(language)")
                XCTAssertFalse(value?.isEmpty ?? true, "\(key) a une traduction \(language) vide")
            }
        }
    }

    func test_stackedUploadKey_keepsItsFormatMarkerInEveryLanguage() throws {
        let strings = try Self.catalogStrings()
        let key = "story.upload.a11y.stacked"
        guard let localizations = strings[key] else { return XCTFail("Clé absente : \(key)") }

        for language in Self.interfaceLanguages {
            XCTAssertTrue(
                localizations[language]?.contains("%lld") ?? false,
                "\(key) perd son marqueur %lld en \(language) — le compteur ne s'afficherait pas"
            )
        }
    }

    func test_storyPublishToastKeys_useFrenchDefaultValues() throws {
        let source = try Self.strippedSource(of: "Features/Main/ViewModels/StoryViewModel.swift")
        XCTAssertGreaterThan(
            source.count, 400,
            "Source (unité) de StoryViewModel introuvable ou vide — cette garde ne mesurerait rien."
        )

        for (key, expected) in [
            ("story.published", "Story publiée"),
            ("story.publishError", "Échec de la publication de la story"),
        ] {
            guard let range = source.range(of: "\"\(key)\"") else {
                XCTFail("Clé \(key) introuvable dans StoryViewModel.swift")
                continue
            }
            let tail = source[range.upperBound...].prefix(200)
            XCTAssertTrue(
                tail.contains(expected),
                """
                Le `defaultValue` de \(key) doit être FRANÇAIS (« \(expected) ») : la langue \
                source du catalogue est le fr, un défaut anglais s'affiche tel quel partout.
                """
            )
        }
    }

    // MARK: - Helpers

    private static func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Views
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
    }

    private static func catalogStrings() throws -> [String: [String: String]] {
        let url = repoRoot().appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = root["strings"] as? [String: Any] else {
            throw XCTSkip("Catalogue illisible")
        }
        var parsed: [String: [String: String]] = [:]
        for (key, raw) in strings {
            guard let node = raw as? [String: Any],
                  let localizations = node["localizations"] as? [String: Any] else { continue }
            var byLanguage: [String: String] = [:]
            for (language, locRaw) in localizations {
                guard let loc = locRaw as? [String: Any],
                      let unit = loc["stringUnit"] as? [String: Any],
                      let value = unit["value"] as? String else { continue }
                byLanguage[language] = value
            }
            parsed[key] = byLanguage
        }
        return parsed
    }

    /// Commentaires retirés : la prose qui documente le fix cite elle-même les
    /// libellés cherchés.
    ///
    /// `StoryViewModel` s'est scindé en plusieurs fichiers (#4425) : ce
    /// chemin précis passe par l'UNITÉ (`AppSourceGuard.storyViewModelSource`)
    /// plutôt que par une lecture directe, sinon la clé cherchée ci-dessus
    /// deviendrait introuvable le jour où elle migre vers un fichier frère
    /// (`StoryViewModel+Publication.swift`). Tout autre appelant de ce helper
    /// continue de lire son fichier tel quel.
    private static func strippedSource(of relativePath: String) throws -> String {
        let source: String
        if "Meeshy/" + relativePath == AppSourceGuard.storyViewModelPath {
            source = try AppSourceGuard.storyViewModelSource()
        } else {
            let url = repoRoot().appendingPathComponent("Meeshy").appendingPathComponent(relativePath)
            source = try String(contentsOf: url, encoding: .utf8)
        }
        return source
            .components(separatedBy: "\n")
            .map { line -> String in
                guard let range = line.range(of: "//") else { return line }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }
}
