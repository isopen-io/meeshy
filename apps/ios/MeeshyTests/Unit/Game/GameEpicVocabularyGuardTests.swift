import XCTest

/// **LE JEU RACONTE, IL NE COMPTE PLUS** (épopée § 3.1 et § 4, #11179) — la garde de vocabulaire de l'app, jumelle de
/// la garde web (`apps/web/src/lib/game/epic-vocabulary.test.ts`). Elle lit le MÊME lexique,
/// `packages/shared/design/game-epic-vocabulary/<langue>.json` (format : `docs/product/epopee/glossaire/README.md`) :
/// une langue entre sous la garde en posant son fichier, rien n'est recopié ici.
///
/// Pour chaque langue : aucune valeur du jeu de `Localizable.xcstrings` (`game.*`, `game2.*`, `progression.*`,
/// `achievement.*`, `onboarding.recap.*`, formes plurielles comprises) ne porte un motif banni, substitutions `%@`
/// mises de côté ; chaque clé de nom que l'app porte dit son nom canonique au caractère près. `game2.X` est la jumelle
/// de la clé web `game.X` : la portée d'un motif et les noms la lisent sous ce nom-là. Et chaque `defaultValue` du jeu
/// dit le français du catalogue, la langue source.
///
/// Les sept langues sont sous la garde, sans exception. Que les clés communes au web disent, dans chaque langue, le
/// texte du web au caractère près, c'est le témoin de parité `apps/web/src/lib/game/ios-catalog-parity.test.ts`.
final class GameEpicVocabularyGuardTests: XCTestCase {

    // MARK: - Les langues

    /// Les sept langues du jeu, par leur code d'interface (le nom du fichier de lexique).
    private static let languages = ["fr", "en", "es", "de", "it", "pt", "ar"]

    /// Le catalogue iOS nomme le portugais `pt-BR` ; le lexique, comme le web, `pt`.
    private static func catalogLocale(of language: String) -> String {
        language == "pt" ? "pt-BR" : language
    }

    private static let gamePrefixes = ["game.", "game2.", "progression.", "achievement.", "onboarding.recap."]

    /// `game2.X` est la jumelle de la clé web `game.X`.
    private static func sharedKey(_ key: String) -> String {
        key.hasPrefix("game2.") ? "game." + key.dropFirst("game2.".count) : key
    }

    // MARK: - Le lexique partagé

    private struct BannedRule: Decodable {
        let pattern: String
        let flags: String
        let instead: String
        let keys: [String]?
        let except: [String]?

        private enum CodingKeys: String, CodingKey { case pattern, flags, instead, keys, except }

        init(pattern: String, flags: String, instead: String, keys: [String]? = nil, except: [String]? = nil) {
            self.pattern = pattern
            self.flags = flags
            self.instead = instead
            self.keys = keys
            self.except = except
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            pattern = try container.decode(String.self, forKey: .pattern)
            flags = try container.decode(String.self, forKey: .flags)
            instead = try container.decode(String.self, forKey: .instead)
            if let single = try? container.decode(String.self, forKey: .keys) {
                keys = [single]
            } else {
                keys = try container.decodeIfPresent([String].self, forKey: .keys)
            }
            except = try container.decodeIfPresent([String].self, forKey: .except)
        }

        func governs(_ key: String) -> Bool {
            let shared = GameEpicVocabularyGuardTests.sharedKey(key)
            let inScope = keys.map { prefixes in prefixes.contains { shared.hasPrefix($0) } } ?? true
            return inScope && !(except ?? []).contains { shared.hasPrefix($0) }
        }

        /// Le motif du lexique, tel quel : ICU comprend `\p{L}`, les regards de longueur fixe, et le `u` y est implicite.
        func expression() throws -> NSRegularExpression {
            var options: NSRegularExpression.Options = []
            if flags.contains("i") { options.insert(.caseInsensitive) }
            if flags.contains("m") { options.insert(.anchorsMatchLines) }
            if flags.contains("s") { options.insert(.dotMatchesLineSeparators) }
            return try NSRegularExpression(pattern: pattern, options: options)
        }
    }

    private struct Vocabulary: Decodable {
        let language: String
        let banned: [BannedRule]
        let names: [String: String]
    }

    private struct Violation: Equatable, CustomStringConvertible {
        let key: String
        let value: String
        let instead: String
        var description: String { "\(key) : « \(value) » → \(instead)" }
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Game
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine du dépôt
    }

    private static var iosRoot: URL { repositoryRoot.appendingPathComponent("apps/ios") }

    private func vocabularies() throws -> [String: Vocabulary] {
        let folder = Self.repositoryRoot.appendingPathComponent("packages/shared/design/game-epic-vocabulary")
        let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
        var byLanguage: [String: Vocabulary] = [:]
        for file in files {
            let vocabulary = try JSONDecoder().decode(Vocabulary.self, from: Data(contentsOf: file))
            XCTAssertEqual(file.deletingPathExtension().lastPathComponent, vocabulary.language,
                           "\(file.lastPathComponent) porte la langue « \(vocabulary.language) »")
            byLanguage[vocabulary.language] = vocabulary
        }
        return byLanguage
    }

    // MARK: - Le catalogue de l'app

    /// Les valeurs du jeu d'une langue : `clé → [valeurs]` (une clé plurielle a une valeur par forme).
    private func gameValues(locale: String) throws -> [String: [String]] {
        let data = try Data(contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let strings = try XCTUnwrap((try JSONSerialization.jsonObject(with: data) as? [String: Any])?["strings"] as? [String: Any])
        var table: [String: [String]] = [:]
        for (key, entry) in strings where Self.gamePrefixes.contains(where: { key.hasPrefix($0) }) {
            guard let localization = ((entry as? [String: Any])?["localizations"] as? [String: Any])?[locale] as? [String: Any] else {
                continue
            }
            if let value = (localization["stringUnit"] as? [String: Any])?["value"] as? String {
                table[key] = [value]
            } else if let forms = (localization["variations"] as? [String: Any])?["plural"] as? [String: Any] {
                table[key] = forms.values.compactMap { (($0 as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String }
            }
        }
        return table
    }

    // MARK: - La loi de la garde

    private static let substitution = try! NSRegularExpression(pattern: "%(?:\\d+\\$)?(?:@|lld|ld|d)")

    private static func withoutSubstitutions(_ value: String) -> String {
        substitution.stringByReplacingMatches(in: value, range: NSRange(value.startIndex..., in: value), withTemplate: " ")
    }

    /// Les mots bannis que porte un catalogue : une ligne par (clé, motif) fautif.
    private static func bannedWords(_ vocabulary: Vocabulary, in table: [String: [String]]) throws -> [Violation] {
        try vocabulary.banned.flatMap { rule -> [Violation] in
            let expression = try rule.expression()
            return table.keys.sorted().filter(rule.governs).flatMap { key in
                (table[key] ?? []).filter { value in
                    let text = withoutSubstitutions(value)
                    return expression.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
                }.map { Violation(key: key, value: $0, instead: rule.instead) }
            }
        }
    }

    /// Les clés de nom que l'app porte et qui ne disent pas leur nom canonique.
    private static func misnamed(_ vocabulary: Vocabulary, in table: [String: [String]]) -> [String] {
        table.keys.sorted().compactMap { key in
            guard let name = vocabulary.names[sharedKey(key)], let value = table[key]?.first, value != name else { return nil }
            return "\(key) : « \(value) » au lieu de « \(name) »"
        }
    }

    // MARK: - Le témoin de la garde elle-même

    /// La garde voit un mot banni, et ne le voit pas dans une substitution ; sa portée lit `game2.X` comme `game.X`.
    func test_theGuard_seesABannedWord_butNotASubstitution() throws {
        let vocabulary = Vocabulary(language: "fr", banned: [
            BannedRule(pattern: "(?<![\\p{L}\\p{N}])dettes?(?![\\p{L}\\p{N}])", flags: "iu", instead: "l’Ombre"),
            BannedRule(pattern: "(?<![\\p{L}\\p{N}])rangs?(?![\\p{L}\\p{N}])", flags: "iu", instead: "place", keys: ["game.league."]),
        ], names: ["game.league.name.jade": "Jade"])
        let caught = try Self.bannedWords(vocabulary, in: [
            "game.sparks.trap": ["Ta dette : %1$@"],
            "game.flame.trap": ["Ta plus longue Flamme : %@"],
            "game2.league.trap": ["Rang %@ cette semaine"],
            "game.rank.trap": ["Ton rang grandit"],
            "game.flame.debt.trap": ["%@ étincelles"],
        ])
        XCTAssertEqual(caught.map(\.key), ["game.sparks.trap", "game2.league.trap"])
        XCTAssertEqual(Self.misnamed(vocabulary, in: ["game2.league.name.jade": ["Jadé"]]), ["game2.league.name.jade : « Jadé » au lieu de « Jade »"])
    }

    // MARK: - Le lexique

    func test_theFrenchSource_isPosed_andEveryRuleCompiles() throws {
        let vocabularies = try vocabularies()
        XCTAssertNotNil(vocabularies["fr"], "le lexique français, la source, manque")
        for vocabulary in vocabularies.values {
            for rule in vocabulary.banned {
                XCTAssertNoThrow(try rule.expression(), "\(vocabulary.language) : le motif « \(rule.pattern) » ne se compile pas en ICU")
                XCTAssertTrue(rule.flags.allSatisfy { "imsu".contains($0) }, "\(vocabulary.language) : drapeau inconnu dans « \(rule.flags) »")
            }
        }
    }

    func test_everyLanguageOfTheGame_hasItsLexicon() throws {
        let vocabularies = try vocabularies()
        for language in Self.languages {
            XCTAssertNotNil(vocabularies[language], "\(language).json manque dans packages/shared/design/game-epic-vocabulary")
        }
    }

    // MARK: - Le catalogue de l'app

    func test_noGameValue_carriesABannedWord_inAnyLanguage() throws {
        let vocabularies = try vocabularies()
        for language in Self.languages {
            let table = try gameValues(locale: Self.catalogLocale(of: language))
            XCTAssertGreaterThan(table.count, 1_000, "\(language) : le balayage ne voit presque rien du jeu")
            guard let vocabulary = vocabularies[language] else {
                XCTFail("\(language) : pas de lexique, pas de garde")
                continue
            }
            let violations = try Self.bannedWords(vocabulary, in: table)
            XCTAssertTrue(violations.isEmpty, "\(language) : \(violations.count) mots bannis\n" + violations.map(\.description).joined(separator: "\n"))
        }
    }

    func test_everyNameKey_saysItsCanonicalName_inAnyLanguage() throws {
        let vocabularies = try vocabularies()
        for language in Self.languages {
            let table = try gameValues(locale: Self.catalogLocale(of: language))
            guard let vocabulary = vocabularies[language] else {
                XCTFail("\(language) : pas de lexique, pas de garde")
                continue
            }
            let misnamed = Self.misnamed(vocabulary, in: table)
            XCTAssertTrue(misnamed.isEmpty, "\(language) : noms qui divergent\n" + misnamed.joined(separator: "\n"))
        }
    }

    // MARK: - Les defaultValue du jeu

    /// Une `defaultValue` du jeu : sa clé, son texte (les interpolations remplacées par `§`) et son nombre d'interpolations.
    private struct DefaultValue {
        let file: String
        let key: String
        let text: String
        let interpolations: Int
    }

    /// Lit le littéral qui commence à `start` (juste après le `"` ouvrant) : son texte, interpolations remplacées par
    /// `§`, leur nombre, et l'indice de son `"` fermant.
    private static func readLiteral(_ characters: [Character], from start: Int) -> (text: String, interpolations: Int, end: Int)? {
        var text = ""
        var interpolations = 0
        var index = start
        while index < characters.count {
            let character = characters[index]
            if character == "\"" { return (text, interpolations, index) }
            if character == "\n" { return nil }
            guard character == "\\", index + 1 < characters.count else {
                text.append(character)
                index += 1
                continue
            }
            switch characters[index + 1] {
            case "(":
                guard let end = skipInterpolation(characters, from: index + 2) else { return nil }
                text.append("§")
                interpolations += 1
                index = end
            case "u":
                guard let close = characters[index...].firstIndex(of: "}"),
                      let scalar = UInt32(String(characters[(index + 3)..<close]), radix: 16).flatMap(Unicode.Scalar.init) else { return nil }
                text.append(Character(scalar))
                index = close + 1
            case "n":
                text.append("\n")
                index += 2
            case "t":
                text.append("\t")
                index += 2
            default:
                text.append(characters[index + 1])
                index += 2
            }
        }
        return nil
    }

    /// L'indice qui suit la parenthèse fermante d'une interpolation, chaînes imbriquées comprises.
    private static func skipInterpolation(_ characters: [Character], from start: Int) -> Int? {
        var depth = 1
        var index = start
        while index < characters.count {
            switch characters[index] {
            case "(":
                depth += 1
            case ")":
                depth -= 1
                if depth == 0 { return index + 1 }
            case "\"":
                guard let nested = readLiteral(characters, from: index + 1) else { return nil }
                index = nested.end
            default:
                break
            }
            index += 1
        }
        return nil
    }

    private func gameDefaultValues() throws -> [DefaultValue] {
        let pattern = "localized:\\s*\"((?:" + Self.gamePrefixes.map(NSRegularExpression.escapedPattern(for:)).joined(separator: "|")
            + ")[^\"\\\\]*)\"\\s*,\\s*defaultValue:\\s*\"(?!\"\")"
        let call = try NSRegularExpression(pattern: pattern)
        let base = Self.iosRoot.appendingPathComponent("Meeshy")
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil))
        var found: [DefaultValue] = []
        while let url = walker.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let source = try String(contentsOf: url, encoding: .utf8)
            guard source.contains("defaultValue:") else { continue }
            let characters = Array(source)
            let utf16Offsets = Self.characterOffsets(of: source)
            for match in call.matches(in: source, range: NSRange(source.startIndex..., in: source)) {
                guard let keyRange = Range(match.range(at: 1), in: source),
                      let start = utf16Offsets[match.range.upperBound],
                      let literal = Self.readLiteral(characters, from: start) else { continue }
                found.append(DefaultValue(file: url.lastPathComponent, key: String(source[keyRange]),
                                          text: literal.text, interpolations: literal.interpolations))
            }
        }
        return found
    }

    /// La position, en caractères, de chaque position UTF-16 qui commence un caractère.
    private static func characterOffsets(of source: String) -> [Int: Int] {
        var offsets: [Int: Int] = [:]
        var utf16 = 0
        for (index, character) in source.enumerated() {
            offsets[utf16] = index
            utf16 += character.utf16.count
        }
        offsets[utf16] = source.count
        return offsets
    }

    /// Le texte français d'une clé, substitutions remplacées par `§` (la forme « other » pour une clé plurielle).
    private static func normalizedFrench(_ value: String) -> String {
        let escaped = value.replacingOccurrences(of: "%%", with: "\u{0}")
        return substitution.stringByReplacingMatches(in: escaped, range: NSRange(escaped.startIndex..., in: escaped), withTemplate: "§")
            .replacingOccurrences(of: "\u{0}", with: "%")
    }

    /// Les clés dont le français DÉPLACE ses substitutions (`%2$@ … %1$@`) : un littéral Swift ne peut pas dire cet
    /// ordre sans changer celui des arguments, donc sa `defaultValue` garde l'ordre des arguments.
    private static func reordersItsArguments(_ value: String) -> Bool {
        let positions = substitution.matches(in: value, range: NSRange(value.startIndex..., in: value)).compactMap { match -> Int? in
            guard let range = Range(match.range, in: value) else { return nil }
            return Int(value[range].dropFirst().prefix { $0.isNumber })
        }
        return positions != positions.sorted() || Set(positions).count != positions.count
    }

    /// Les `defaultValue` connues pour ne pas dire leur clé, chacune suivie par son issue.
    private static let knownMismatches: [String: String] = [
        // La barre du niveau passe un libellé sans le niveau visé, que la clé attend (« Vers le niveau %lld »).
        "progression.a11y.bar.level": "#11246",
    ]

    func test_everyGameDefaultValue_carriesNoBannedWord() throws {
        let french = try XCTUnwrap(try vocabularies()["fr"])
        let defaults = try gameDefaultValues()
        XCTAssertGreaterThan(defaults.count, 1_000, "le balayage des sources ne voit presque rien du jeu")
        let table = Dictionary(grouping: defaults, by: { "\($0.key) [\($0.file)]" }).mapValues { $0.map(\.text) }
        let violations = try Self.bannedWords(french, in: table.mapValues { $0.map { $0.replacingOccurrences(of: "§", with: " ") } })
        XCTAssertTrue(violations.isEmpty, "\(violations.count) defaultValue portent un mot banni\n" + violations.map(\.description).joined(separator: "\n"))
    }

    func test_everyGameDefaultValue_saysTheFrenchOfTheCatalogue() throws {
        let catalogue = try gameValues(locale: "fr")
        let pluralForms = try pluralOtherForms()
        var drifts: [String] = []
        for value in try gameDefaultValues() where Self.knownMismatches[value.key] == nil {
            guard let french = pluralForms[value.key] ?? catalogue[value.key]?.first else {
                drifts.append("\(value.key) [\(value.file)] : absente du catalogue")
                continue
            }
            guard !Self.reordersItsArguments(french) else { continue }
            let expected = Self.normalizedFrench(french)
            let actual = Self.normalizedFrench(value.text)
            if actual != expected { drifts.append("\(value.key) [\(value.file)] : « \(value.text) » au lieu de « \(french) »") }
        }
        XCTAssertTrue(drifts.isEmpty, "\(drifts.count) defaultValue ne disent pas le français du catalogue\n" + drifts.joined(separator: "\n"))
    }

    /// La forme « other » des clés plurielles du jeu, en français : c'est elle que la `defaultValue` écrit.
    private func pluralOtherForms() throws -> [String: String] {
        let data = try Data(contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let strings = try XCTUnwrap((try JSONSerialization.jsonObject(with: data) as? [String: Any])?["strings"] as? [String: Any])
        var forms: [String: String] = [:]
        for (key, entry) in strings where Self.gamePrefixes.contains(where: { key.hasPrefix($0) }) {
            let french = ((entry as? [String: Any])?["localizations"] as? [String: Any])?["fr"] as? [String: Any]
            let other = (((french?["variations"] as? [String: Any])?["plural"] as? [String: Any])?["other"] as? [String: Any])?["stringUnit"]
            if let value = (other as? [String: Any])?["value"] as? String { forms[key] = value }
        }
        return forms
    }
}
