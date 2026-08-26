import XCTest
@testable import Meeshy

/// Les puces de filtre de l'annuaire Contacts affichaient `ContactFilter.rawValue` :
/// du français NON ACCENTUÉ (« Repertoire », « Affilies »), identique dans les sept
/// langues, sur le libellé visible ET sur l'`accessibilityLabel`.
///
/// Doctrine (identique à `PeopleTab.title` et `RequestFilter`) : le `rawValue` reste
/// la clé stable d'identité et de persistance ; `title` est la SEULE surface livrée à
/// l'écran, donc la seule qui traverse le catalogue.
///
/// Les témoins ci-dessous sont volontairement indépendants de la locale d'exécution :
/// `String(localized:)` résout contre le bundle de l'hôte de test, dont la langue
/// varie d'un simulateur à l'autre. Ce qui se vérifie à l'exécution, c'est que le
/// titre n'est JAMAIS la clé d'identité ; la forme accentuée du français se vérifie,
/// elle, sur le catalogue lui-même.
@MainActor
final class ContactFilterTitleTests: XCTestCase {

    // MARK: - Le titre n'est jamais la clé d'identité

    func test_contactFilter_title_isLocalizedAndAccented() throws {
        XCTAssertNotEqual(
            ContactFilter.phonebook.title,
            ContactFilter.phonebook.rawValue,
            "la puce « Répertoire » rendrait la clé d'identité non accentuée"
        )
        XCTAssertNotEqual(
            ContactFilter.affiliates.title,
            ContactFilter.affiliates.rawValue,
            "la puce « Affiliés » rendrait la clé d'identité non accentuée"
        )

        let french = try Self.frenchCatalogValues()
        XCTAssertEqual(
            french["contacts.list.filter.phonebook"],
            "Répertoire",
            "la valeur française du catalogue porte l'accent que le rawValue n'a pas"
        )
        XCTAssertEqual(
            french["contacts.list.filter.affiliates"],
            "Affiliés",
            "la valeur française du catalogue porte l'accent que le rawValue n'a pas"
        )
    }

    // MARK: - Le rawValue reste la clé stable

    /// Contre-épreuve du témoin ci-dessus : « accentuer le titre » ne doit jamais se
    /// solder par une accentuation du `rawValue`, qui est persisté et comparé.
    func test_contactFilter_rawValue_staysTheStableIdentityKey() {
        let rawValues = ContactFilter.allCases.map { $0.rawValue }
        XCTAssertEqual(rawValues, ["Tous", "En ligne", "Hors ligne", "Repertoire", "Affilies"])
    }

    // MARK: - Les cinq puces restent distinctes

    func test_contactFilter_titles_areDistinctAndNonEmpty() {
        let titles = ContactFilter.allCases.map { $0.title }
        XCTAssertEqual(titles.count, 5)
        XCTAssertTrue(titles.allSatisfy { !$0.isEmpty }, "une puce sans libellé est une puce muette")
        XCTAssertEqual(Set(titles).count, 5, "deux puces portant le même libellé sont indiscernables")
    }

    // MARK: - Catalogue

    private struct CatalogUnreadable: Error, CustomStringConvertible {
        let description: String
    }

    /// Valeurs françaises du catalogue de l'app, lues sur l'arbre source.
    /// Le catalogue est la source de vérité de la forme accentuée — le bundle
    /// d'exécution, lui, dépend de la langue du simulateur.
    private static func frenchCatalogValues() throws -> [String: String] {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Contacts
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root

        let catalog = repoRoot.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings")
        guard FileManager.default.fileExists(atPath: catalog.path) else {
            throw XCTSkip("Catalogue introuvable depuis \(repoRoot.path) — arbre source indisponible")
        }

        let data = try Data(contentsOf: catalog)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = root["strings"] as? [String: Any] else {
            throw CatalogUnreadable(description: "Catalogue illisible : \(catalog.path)")
        }

        var values: [String: String] = [:]
        for (key, entry) in strings {
            guard let entry = entry as? [String: Any],
                  let localizations = entry["localizations"] as? [String: Any],
                  let french = localizations["fr"] as? [String: Any],
                  let unit = french["stringUnit"] as? [String: Any],
                  let value = unit["value"] as? String else { continue }
            values[key] = value
        }
        return values
    }
}
