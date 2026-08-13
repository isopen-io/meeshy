import Foundation
import XCTest

/// Confrontation mécanique des chaînes localisables de la cible `MeeshyWidgets`
/// avec la ressource qui les rend localisables.
///
/// La cible déclarait cinq langues dans `CFBundleLocalizations` et appelait
/// `String(localized:defaultValue:)` sur quinze sites — l'API correcte, avec
/// des clés propres. Elle n'embarquait AUCUN `Localizable.xcstrings`. Les
/// quinze appels retombaient donc sur leur défaut anglais pour la totalité des
/// utilisateurs, y compris les sept langues que l'app traduit par ailleurs.
///
/// C'est la forme la plus discrète de la leçon 234 : un audit qui demande « les
/// chaînes du widget sont-elles localisées ? » grep `String(localized:`, en
/// trouve quinze, et répond oui. La réponse juste n'est pas un exemple, c'est
/// un DÉNOMBREMENT — et il ne se lit qu'en comparant les appels à la ressource
/// qui les sert. Cette garde tient ce dénombrement à jour toute seule :
///
/// 1. tout site d'appel a une entrée dans le catalogue ;
/// 2. le catalogue n'a pas d'entrée orpheline (une clé renommée dans le code
///    laisserait sinon une traduction morte payée pour rien) ;
/// 3. chaque entrée couvre TOUTES les langues déclarées par `Info.plist` — une
///    langue annoncée sans traduction est une promesse non tenue, exactement
///    le défaut d'origine à l'échelle d'une seule chaîne.
final class WidgetLocalizationCatalogGuardTests: XCTestCase {

    // MARK: - Emplacements

    private var widgetsDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Services
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("MeeshyWidgets", isDirectory: true)
    }

    private var catalogURL: URL {
        widgetsDirectory.appendingPathComponent("Localizable.xcstrings")
    }

    private var infoPlistURL: URL {
        widgetsDirectory.appendingPathComponent("Info.plist")
    }

    // MARK: - Balayage

    /// Clés effectivement demandées par le code de la cible.
    ///
    /// Le motif est volontairement AGNOSTIQUE DU CONSTRUCTEUR : il repère le
    /// couple `"clé", defaultValue:`, sans nommer `String(localized:)` ni
    /// `LocalizedStringResource(...)`. Une garde qui énumère les formes
    /// connues cesse de voir la première forme nouvelle — et cesse de le dire,
    /// puisqu'une clé non extraite disparaît des DEUX ensembles comparés.
    ///
    /// Il tolère les retours à la ligne entre les arguments : plusieurs appels
    /// sont écrits sur trois lignes, et un motif mono-ligne les manquerait
    /// silencieusement.
    private func declaredKeys() throws -> Set<String> {
        let files = try FileManager.default
            .contentsOfDirectory(at: widgetsDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }

        XCTAssertFalse(files.isEmpty, "aucune source Swift trouvée sous MeeshyWidgets — balayage vide")

        let pattern = #""([A-Za-z][A-Za-z0-9.]*)"\s*,\s*defaultValue:"#
        let regex = try NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators])

        var keys = Set<String>()
        for file in files {
            let source = try String(contentsOf: file, encoding: .utf8)
            let range = NSRange(source.startIndex..<source.endIndex, in: source)
            for match in regex.matches(in: source, range: range) {
                guard let keyRange = Range(match.range(at: 1), in: source) else { continue }
                keys.insert(String(source[keyRange]))
            }
        }
        return keys
    }

    private func catalog() throws -> [String: [String: Any]] {
        let data = try Data(contentsOf: catalogURL)
        let root = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: data) as? [String: Any],
            "Localizable.xcstrings illisible"
        )
        return try XCTUnwrap(root["strings"] as? [String: [String: Any]])
    }

    private func declaredLocalizations() throws -> Set<String> {
        let data = try Data(contentsOf: infoPlistURL)
        let plist = try XCTUnwrap(
            try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        )
        return Set(try XCTUnwrap(plist["CFBundleLocalizations"] as? [String]))
    }

    // MARK: - Témoins

    /// Refus du balayage vide — corollaire payé au cycle 106 : un extracteur
    /// qui ne trouve rien rend une garde verte indiscernable d'une garde
    /// inutile.
    func test_widgetSources_declareLocalizableStrings() throws {
        XCTAssertGreaterThan(
            try declaredKeys().count, 20,
            "le balayage ne trouve presque aucune clé — le motif d'extraction a probablement cessé de matcher"
        )
    }

    func test_everyWidgetStringHasACatalogEntry() throws {
        let declared = try declaredKeys()
        let catalogued = Set(try catalog().keys)

        XCTAssertTrue(
            declared.subtracting(catalogued).isEmpty,
            """
            Ces clés sont demandées par MeeshyWidgets mais absentes du catalogue — \
            elles s'afficheront en anglais pour TOUS les utilisateurs : \
            \(declared.subtracting(catalogued).sorted())
            """
        )
    }

    func test_catalogHasNoOrphanEntries() throws {
        let declared = try declaredKeys()
        let catalogued = Set(try catalog().keys)

        XCTAssertTrue(
            catalogued.subtracting(declared).isEmpty,
            """
            Ces entrées du catalogue ne correspondent à aucun site d'appel — \
            clé renommée dans le code, traduction laissée derrière : \
            \(catalogued.subtracting(declared).sorted())
            """
        )
    }

    func test_everyCatalogEntryCoversEveryDeclaredLocalization() throws {
        let expected = try declaredLocalizations()
        XCTAssertFalse(expected.isEmpty, "CFBundleLocalizations vide dans MeeshyWidgets/Info.plist")

        var gaps: [String: [String]] = [:]
        for (key, entry) in try catalog() {
            guard let localizations = entry["localizations"] as? [String: Any] else {
                gaps[key] = expected.sorted()
                continue
            }
            let missing = expected.subtracting(localizations.keys)
            if !missing.isEmpty { gaps[key] = missing.sorted() }
        }

        XCTAssertTrue(
            gaps.isEmpty,
            "langues annoncées par Info.plist mais absentes du catalogue : \(gaps)"
        )
    }

    /// La cible widget annonce exactement les mêmes langues que l'app.
    ///
    /// Elle en annonçait cinq contre sept — `it` et `ar` manquaient. Un widget
    /// qui n'annonce pas une langue ne la choisira jamais, même si le
    /// catalogue la contient : la traduction serait embarquée et jamais
    /// servie.
    func test_widgetDeclaresTheSameLocalizationsAsTheApp() throws {
        let appPlist = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Info.plist")
        let data = try Data(contentsOf: appPlist)
        let plist = try XCTUnwrap(
            try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        )
        let appLocalizations = Set(try XCTUnwrap(plist["CFBundleLocalizations"] as? [String]))

        XCTAssertEqual(
            try declaredLocalizations(), appLocalizations,
            "MeeshyWidgets et Meeshy doivent annoncer le même jeu de langues"
        )
    }
}
