import XCTest
@testable import Meeshy

/// Gardes sur les catalogues de chaînes.
///
/// L'app déclare sept langues d'interface (`LanguageData.interfaceLanguageCodes`)
/// mais n'en a longtemps livré que cinq : choisir « Italiano » ou « العربية »
/// laissait l'utilisateur devant une interface anglaise, sans le moindre signal.
/// Ces tests mesurent l'écart au lieu de le laisser dériver en silence.
///
/// Deux natures de garde ici :
///
/// - **Les marqueurs de format sont un invariant dur.** Une traduction qui perd
///   un `%@` ou intervertit `%1$@` et `%2$@` affiche un nom à la place d'une
///   date, ou tronque la phrase. C'est un défaut visible en production que rien
///   d'autre ne rattrape : le test échoue, sans tolérance.
///
/// - **La couverture est un plancher, pas une cible.** Traduire ~2 500 clés se
///   fait par lots ; exiger 100 % ferait échouer le test dès le premier commit
///   utile. On épingle donc le niveau atteint : il ne peut que monter. Quand une
///   langue atteint 100 %, son plancher devient 100 % et la régression devient
///   impossible.
final class LocalizationCatalogGuardTests: XCTestCase {

    // MARK: - Catalogues

    private struct Catalog {
        let name: String
        let sourceLanguage: String
        let strings: [String: [String: String]]  // clé → (langue → valeur)
    }

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
    }

    private func load(_ relativePath: String, name: String) throws -> Catalog {
        let url = repoRoot().appendingPathComponent(relativePath)
        let data = try Data(contentsOf: url)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = root["strings"] as? [String: Any] else {
            throw XCTSkip("Catalogue illisible : \(relativePath)")
        }
        let source = root["sourceLanguage"] as? String ?? "fr"

        var parsed: [String: [String: String]] = [:]
        for (key, raw) in strings {
            guard let node = raw as? [String: Any] else { continue }
            if node["shouldTranslate"] as? Bool == false { continue }
            var byLang: [String: String] = [:]
            for (lang, locRaw) in (node["localizations"] as? [String: Any]) ?? [:] {
                guard let loc = locRaw as? [String: Any] else { continue }
                if let unit = loc["stringUnit"] as? [String: Any],
                   let value = unit["value"] as? String {
                    byLang[lang] = value
                } else if loc["variations"] != nil {
                    // Les formes plurielles portent plusieurs valeurs : on note
                    // leur présence sans tenter d'en comparer les marqueurs.
                    byLang[lang] = "<VARIATIONS>"
                }
            }
            parsed[key] = byLang
        }
        return Catalog(name: name, sourceLanguage: source, strings: parsed)
    }

    private func catalogs() throws -> [Catalog] {
        [
            try load("apps/ios/Meeshy/Localizable.xcstrings", name: "app"),
            try load("packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings", name: "SDK"),
        ]
    }

    // MARK: - Marqueurs de format

    /// `%@`, `%lld`, `%1$@`… avec leur éventuel index de position.
    private func formatSpecifiers(_ text: String) -> [String] {
        var found: [String] = []
        var index = text.startIndex
        while let percent = text[index...].firstIndex(of: "%") {
            var cursor = text.index(after: percent)
            if cursor < text.endIndex, text[cursor] == "%" {
                index = text.index(after: cursor)  // « %% » est un pourcentage littéral
                continue
            }
            var token = "%"
            while cursor < text.endIndex, text[cursor].isNumber || text[cursor] == "$" {
                token.append(text[cursor])
                cursor = text.index(after: cursor)
            }
            while cursor < text.endIndex, "lh".contains(text[cursor]) {
                token.append(text[cursor])
                cursor = text.index(after: cursor)
            }
            if cursor < text.endIndex, "@dsfiu".contains(text[cursor]) {
                token.append(text[cursor])
                found.append(token)
                cursor = text.index(after: cursor)
            }
            index = cursor
        }
        return found.sorted()
    }

    func test_chaqueTraductionGardeLesMarqueursDeSaSource() throws {
        var offenders: [String] = []
        for catalog in try catalogs() {
            for (key, byLang) in catalog.strings {
                let source = byLang[catalog.sourceLanguage] ?? byLang["en"] ?? key
                guard source != "<VARIATIONS>" else { continue }
                let expected = formatSpecifiers(source)
                for (lang, value) in byLang
                where lang != catalog.sourceLanguage && value != "<VARIATIONS>" {
                    let got = formatSpecifiers(value)
                    if got != expected {
                        offenders.append("[\(catalog.name)/\(lang)] \(key) : attendu \(expected), trouvé \(got)")
                    }
                }
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            """
            Marqueurs de format divergents — la valeur substituée s'affichera au \
            mauvais endroit, ou pas du tout :
            \(offenders.prefix(25).joined(separator: "\n"))
            """
        )
    }

    /// Une traduction vide s'affiche comme un libellé absent : bouton muet,
    /// titre disparu. Rien ne le signale au moment de la saisie.
    ///
    /// Une clé dont la SOURCE est déjà vide est en revanche cohérente — le
    /// catalogue en contient une, extraite d'une chaîne vide du code. Rendre du
    /// vide par du vide n'est pas un défaut ; c'est le seul rendu correct.
    func test_aucuneSourceNonVideNEstTraduiteParDuVide() throws {
        var offenders: [String] = []
        for catalog in try catalogs() {
            for (key, byLang) in catalog.strings {
                let source = byLang[catalog.sourceLanguage] ?? byLang["en"] ?? key
                guard !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
                for (lang, value) in byLang
                where value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    offenders.append("[\(catalog.name)/\(lang)] \(key)")
                }
            }
        }
        XCTAssertTrue(offenders.isEmpty, "Traductions vides :\n\(offenders.prefix(25).joined(separator: "\n"))")
    }

    // MARK: - Couverture

    /// Plancher atteint, par catalogue et par langue. **Ne jamais baisser une
    /// valeur** : la faire descendre pour « faire passer le test » reviendrait à
    /// entériner une régression que ce test existe précisément pour attraper.
    private static let floors: [String: [String: Int]] = [
        "app": ["en": 1268, "de": 1256, "es": 1256, "pt-BR": 1256, "it": 675, "ar": 675],
        "SDK": ["en": 883, "de": 773, "es": 773, "pt-BR": 614, "it": 0, "ar": 0],
    ]

    func test_laCouvertureNeRégressePas() throws {
        for catalog in try catalogs() {
            guard let floors = Self.floors[catalog.name] else { continue }
            for (lang, floor) in floors {
                let covered = catalog.strings.values.filter { $0[lang] != nil }.count
                XCTAssertGreaterThanOrEqual(
                    covered, floor,
                    "[\(catalog.name)/\(lang)] couverture tombée à \(covered), plancher \(floor)"
                )
            }
        }
    }

    /// Le balayage doit voir de vrais catalogues : un chemin cassé rendrait
    /// tous les tests ci-dessus verts pour n'avoir rien lu.
    func test_lesCataloguesSontBienChargés() throws {
        let loaded = try catalogs()
        XCTAssertEqual(loaded.count, 2)
        for catalog in loaded {
            XCTAssertGreaterThan(catalog.strings.count, 1000, "Catalogue \(catalog.name) quasi vide")
        }
    }

    /// L'analyse des marqueurs doit reconnaître ce qu'elle prétend vérifier.
    func test_lAnalyseDesMarqueursReconnaîtLesFormesUtilisées() {
        XCTAssertEqual(formatSpecifiers("Bonjour %@"), ["%@"])
        XCTAssertEqual(formatSpecifiers("%lld messages"), ["%lld"])
        XCTAssertEqual(formatSpecifiers("Page %1$lld sur %2$lld"), ["%1$lld", "%2$lld"])
        XCTAssertEqual(formatSpecifiers("%1$@ : %2$@"), ["%1$@", "%2$@"])
        XCTAssertEqual(formatSpecifiers("Export… %lld%%"), ["%lld"], "« %% » est un pourcentage, pas un marqueur")
        XCTAssertEqual(formatSpecifiers("Aucun marqueur ici"), [])
        XCTAssertEqual(formatSpecifiers("100 % de réussite"), [], "Un « % » isolé n'est pas un marqueur")
    }
}
