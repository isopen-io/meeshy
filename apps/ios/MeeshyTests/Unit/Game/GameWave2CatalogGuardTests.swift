import XCTest

/// Les phrases de la vague 2 (`game2.*`, portées du catalogue web) : sept langues, traduites et non recopiées (#9481).
/// Les clés `game.*` ont leur garde (`GameSourceGuardTests`) ; celles-ci vivent sous un autre préfixe et lui échappaient.
final class GameWave2CatalogGuardTests: XCTestCase {

    private let locales = ["fr", "en", "es", "de", "it", "pt-BR", "ar"]

    /// Les seules clés dont l'anglais est légitimement identique au français (noms de ligue, « Prestige », « Rare »…).
    private let sameInEnglish: Set<String> = [
        "game2.duration.minutes", "game2.duration.hours", "game2.banner.separator", "game2.banner.points",
        "game2.profile.treasury", "game2.guide.moment.prestige.short", "game2.rarity.rare", "game2.prestige.title",
        "game2.trophy.plate.prestige", "game2.trophy.plate.league-month", "game2.league.name.jade",
        "game2.league.name.quartz", "game2.door.prestige",
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
    /// trou, une qui en gagne un plante le formatage. L'arabe dit « une » sans chiffre (« نجمة واحدة ») : sa forme du singulier est exemptée.
    func test_everyLanguageKeepsTheSameNumberOfPlaceholders() throws {
        let pattern = try NSRegularExpression(pattern: "%(?:\\d+\\$)?(?:@|lld|d|ld)")
        func count(_ text: String) -> Int { pattern.numberOfMatches(in: text, range: NSRange(text.startIndex..., in: text)) }
        for (key, perLocale) in try entries() {
            let expected = count(perLocale["fr"] ?? "")
            for locale in locales where !(locale == "ar" && key.hasSuffix(".one")) {
                XCTAssertEqual(count(perLocale[locale] ?? ""), expected, "\(key) : \(locale) n'a pas les mêmes substitutions que le français")
            }
        }
    }
}
