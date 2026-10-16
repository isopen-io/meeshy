import XCTest
@testable import Meeshy

/// Les compteurs d'étincelles portent les FORMES PLURIELLES de chaque langue (variations `plural` du catalogue) : un
/// nombre pré-formaté (`%@`) choisi en Swift entre « one » et « other » ne pouvait pas dire l'arabe — pluriel de 3 à 10
/// (« شرارات »), singulier accusatif de 11 à 99 (« شرارةً »), singulier de 100 et au-delà (« شرارة »).
final class GameSparksPluralTests: XCTestCase {

    private func catalog() throws -> [String: Any] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        return try XCTUnwrap(root?["strings"] as? [String: Any])
    }

    private func plural(_ key: String, _ locale: String) throws -> [String: String] {
        let entry = try XCTUnwrap(try catalog()[key] as? [String: Any], key)
        let locs = try XCTUnwrap(entry["localizations"] as? [String: Any])
        let loc = try XCTUnwrap(locs[locale] as? [String: Any], "\(key) [\(locale)]")
        let forms = try XCTUnwrap((loc["variations"] as? [String: Any])?["plural"] as? [String: Any], "\(key) [\(locale)] : pas de variations plurielles")
        return forms.compactMapValues { (($0 as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String }
    }

    func test_theSparkCounters_areTruePlurals_inEveryLanguage() throws {
        for key in ["game.sparks.count", "game.sparks.convertible.count"] {
            for locale in ["fr", "en", "es", "de", "it", "pt-BR"] {
                let forms = try plural(key, locale)
                XCTAssertNotNil(forms["one"], "\(key) [\(locale)]")
                XCTAssertNotNil(forms["other"], "\(key) [\(locale)]")
                XCTAssertNotEqual(forms["one"], forms["other"], "\(key) [\(locale)] : le singulier diffère du pluriel")
            }
        }
    }

    func test_arabic_hasItsSixForms_withTheSingularAfterEleven() throws {
        for key in ["game.sparks.count", "game.sparks.convertible.count", "onboarding.points.pill", "onboarding.points.a11y",
                    "onboarding.reward.announce", "onboarding.global.reward", "onboarding.story.reward"] {
            let forms = try plural(key, "ar")
            XCTAssertEqual(Set(forms.keys), ["zero", "one", "two", "few", "many", "other"], key)
            XCTAssertTrue(forms["few"]?.contains("شرارات") ?? false, "\(key) : 3 à 10, le pluriel")
            XCTAssertTrue(forms["many"]?.contains("شرارةً") ?? false, "\(key) : 11 à 99, le singulier accusatif")
            XCTAssertFalse(forms["other"]?.contains("شرارات") ?? true, "\(key) : 100 et au-delà, le singulier")
        }
    }

    func test_theCopy_readsThePluralKeys() throws {
        let copy = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Game/GameCopy.swift"))
        XCTAssertTrue(copy.contains("\"game.sparks.count\""))
        XCTAssertTrue(copy.contains("\"game.sparks.convertible.count\""))
        XCTAssertFalse(copy.contains("\"game.points.one\""))
    }
}
