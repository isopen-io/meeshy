import XCTest

/// Les phrases de la vague 2 (`game2.*`, portées du catalogue web) : sept langues, traduites et non recopiées (#9481).
/// Les clés `game.*` ont leur garde (`GameSourceGuardTests`) ; celles-ci vivent sous un autre préfixe et lui échappaient.
final class GameWave2CatalogGuardTests: XCTestCase {

    private let locales = ["fr", "en", "es", "de", "it", "pt-BR", "ar"]

    /// Les seules clés dont l'anglais est légitimement identique au français (noms de ligue, « Prestige », « Rare »…).
    private let sameInEnglish: Set<String> = [
        "game2.duration.minutes", "game2.duration.hours", "game2.banner.separator", "game2.banner.points",
        "game2.guide.moment.prestige.short", "game2.rarity.rare", "game2.prestige.title",
        "game2.trophy.plate.prestige", "game2.trophy.plate.league-month", "game2.league.name.jade",
        "game2.league.name.quartz", "game2.door.prestige",
        // « S1 » : l'abréviation de la saison s'écrit pareil en anglais (#10846).
        "game2.banner.season.short",
        // « Alliance » : le nom du concept s'écrit pareil en anglais, comme sur le web (glossaire, #11179).
        "game2.duo.title",
    ]

    private func entries() throws -> [String: [String: String]] {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = json["strings"] as? [String: Any] else { return [:] }
        var table: [String: [String: String]] = [:]
        for (key, value) in strings where key.hasPrefix("game2.") {
            guard let localizations = (value as? [String: Any])?["localizations"] as? [String: Any] else { continue }
            table[key] = localizations.reduce(into: [:]) { acc, pair in
                if let unit = (pair.value as? [String: Any])?["stringUnit"] as? [String: Any], let text = unit["value"] as? String {
                    acc[pair.key] = text
                }
            }
        }
        return table
    }

    func test_everyWave2KeyIsTranslatedInTheSevenLanguages() throws {
        let table = try entries()
        XCTAssertGreaterThan(table.count, 250, "la vague 2 a plus de deux cent cinquante clés")
        for (key, perLocale) in table {
            for locale in locales {
                XCTAssertFalse((perLocale[locale] ?? "").isEmpty, "\(key) : pas de \(locale)")
            }
        }
    }

    func test_theEnglishIsTranslated_notCopiedFromTheFrench() throws {
        for (key, perLocale) in try entries() where !sameInEnglish.contains(key) {
            XCTAssertNotEqual(perLocale["en"], perLocale["fr"], "\(key) : l'anglais est le français recopié")
        }
    }

    /// Chaque substitution du français revient dans les six autres langues : une phrase qui perd son `%1$@` affiche un
    /// trou, une qui en gagne un plante le formatage.
    func test_everyLanguageKeepsTheSameNumberOfPlaceholders() throws {
        let pattern = try NSRegularExpression(pattern: "%(?:\\d+\\$)?(?:@|lld|d|ld)")
        func count(_ text: String) -> Int { pattern.numberOfMatches(in: text, range: NSRange(text.startIndex..., in: text)) }
        for (key, perLocale) in try entries() {
            let expected = count(perLocale["fr"] ?? "")
            for locale in locales {
                XCTAssertEqual(count(perLocale[locale] ?? ""), expected, "\(key) : \(locale) n'a pas les mêmes substitutions que le français")
            }
        }
    }

    /// La fiche d'un profil ne porte plus de carte de jeu (#10093, #10380) : le niveau et le rang vivent sur la bannière,
    /// la bande de la carte de contact garde le niveau, le rang, le trésor et trois coupes — comme le web (#10097). Les
    /// phrases de la carte retirée (« Mon jeu », « Vitrine de … », Gloire, Flamme, médailles, mois d'obtention) quittent
    /// l'app ET le catalogue ; chaque clé `game2.profile.*` et `game2.showcase.awarded_month*` restante est lue par une source.
    func test_theRetiredProfileCardPhrases_leaveTheAppAndTheCatalogue() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let enumerator = FileManager.default.enumerator(at: root.appendingPathComponent("Meeshy"), includingPropertiesForKeys: nil)
        var corpus = ""
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            corpus += (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        }
        XCTAssertFalse(corpus.isEmpty, "les sources de l'app sont introuvables")
        let table = try entries()
        let retired = [
            "game2.profile.title", "game2.profile.glory", "game2.profile.treasury", "game2.profile.flame",
            "game2.profile.medals", "game2.profile.see_progress", "game2.profile.see_showcase", "game2.profile.visitor_title",
            "game2.profile.no_trophy", "game2.profile.visitor_game_title",
            "game2.showcase.awarded_month", "game2.showcase.awarded_month_count",
        ]
        for key in retired {
            XCTAssertNil(table[key], "\(key) : la carte qui la lisait a quitté la fiche — la retirer du catalogue")
            XCTAssertFalse(corpus.contains("\"\(key)\""), "\(key) : la carte qui la lisait a quitté la fiche — la retirer de l'app")
        }
        let watched = table.keys.filter { $0.hasPrefix("game2.profile.") || $0.hasPrefix("game2.showcase.awarded_month") }
        XCTAssertFalse(watched.isEmpty, "la bande garde ses phrases (game2.profile.showcase, level, visitor_treasury)")
        for key in watched.sorted() {
            XCTAssertTrue(corpus.contains("\"\(key)\""), "\(key) : aucune source ne la lit — la retirer du catalogue")
        }
    }
}
