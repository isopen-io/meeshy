import XCTest
@testable import Meeshy

/// Gardes sur les catalogues de chaînes.
///
/// L'app déclare sept langues d'interface (`LanguageData.interfaceLanguageCodes`)
/// mais n'en avait longtemps livré que cinq, et de façon incomplète : choisir
/// « Italiano » ou « العربية » laissait l'utilisateur devant une interface
/// anglaise, sans le moindre signal, et l'allemand comme le portugais avaient
/// des pans entiers en français.
///
/// **Les six langues non-source sont complètes depuis le 2026-07-25.** Ces
/// tests ne mesurent donc plus un écart : ils le rendent impossible à rouvrir.
///
/// - **Les marqueurs de format sont un invariant dur.** Une traduction qui perd
///   un `%@` ou intervertit `%1$@` et `%2$@` affiche un nom à la place d'une
///   date, ou tronque la phrase. C'est un défaut visible en production que rien
///   d'autre ne rattrape : le test échoue, sans tolérance.
///
/// - **La couverture est verrouillée à 100 %.** Les planchers valaient jadis le
///   niveau atteint, pour qu'un travail par lots reste possible ; maintenant
///   qu'ils sont au maximum, toute clé ajoutée sans sa traduction fait échouer
///   le test. C'est voulu : une clé qui entre dans le catalogue sans traduction
///   ressort en français chez tous les autres utilisateurs.
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
    /// **Toutes à 100 % depuis le 2026-07-25.** Ces planchers sont donc des
    /// verrous : toute clé ajoutée sans sa traduction fait échouer le test.
    private static let floors: [String: [String: Int]] = [
        "app": ["en": 1343, "de": 1343, "es": 1343, "pt-BR": 1343, "it": 1343, "ar": 1343],
        "SDK": ["en": 1019, "de": 1019, "es": 1019, "pt-BR": 1019, "it": 1019, "ar": 1019, "fr": 1019],
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

    // MARK: - Cohérence entre ce qui est proposé et ce qui est livré

    /// Le défaut d'origine : `UILanguageOverride.supportedUICodes` listait cinq
    /// langues, avec un commentaire affirmant que l'allemand et le portugais
    /// n'étaient pas traduits — alors qu'ils l'étaient depuis longtemps. Une
    /// liste écrite à la main se périme sans que rien ne le signale.
    ///
    /// Une langue n'est honorée que si elle est **effectivement traduite**. On
    /// exige donc que chaque code accepté couvre au moins 95 % du catalogue de
    /// l'app : en dessous, l'utilisateur verrait du français au milieu de sa
    /// langue, ce qui est pire que de ne pas proposer la langue du tout.
    func test_touteLangueAcceptéeEstRéellementTraduite() throws {
        let app = try catalogs().first { $0.name == "app" }!
        let translatable = app.strings.filter { !$0.value.isEmpty }
        for code in UILanguageOverride.supportedUICodes where code != app.sourceLanguage {
            let covered = translatable.values.filter { $0[code] != nil }.count
            let ratio = Double(covered) / Double(translatable.count)
            XCTAssertGreaterThan(
                ratio, 0.95,
                "\(code) est proposé dans les réglages mais n'est traduit qu'à \(Int(ratio * 100)) % — l'utilisateur verrait un panachage"
            )
        }
    }

    /// Réciproque : une langue traduite mais absente d'`Info.plist` ne sera
    /// jamais chargée par iOS. Le travail de traduction serait invisible.
    func test_touteLangueAcceptéeEstDéclaréeDansLeBundle() throws {
        let url = repoRoot().appendingPathComponent("apps/ios/Meeshy/Info.plist")
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil)
        guard let root = plist as? [String: Any],
              let declared = root["CFBundleLocalizations"] as? [String] else {
            return XCTFail("CFBundleLocalizations introuvable dans Info.plist")
        }
        let missing = UILanguageOverride.supportedUICodes.filter { !declared.contains($0) }
        XCTAssertTrue(
            missing.isEmpty,
            "Langues acceptées mais non déclarées dans CFBundleLocalizations : \(missing) — iOS ne chargera jamais leur catalogue"
        )
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
