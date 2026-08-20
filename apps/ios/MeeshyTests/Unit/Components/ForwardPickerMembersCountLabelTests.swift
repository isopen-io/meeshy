import XCTest
@testable import Meeshy

/// Le compteur « • N membres » du picker de transfert se répète sur CHAQUE
/// ligne du picker, dans le nœud combiné lu par VoiceOver — c'est le libellé
/// le plus répété de l'écran. Sa règle plurielle était **gravée dans la
/// chaîne** (`"• %d membres"`) au lieu d'être une entrée `variations.plural`
/// du catalogue, et la ligne n'apparaissait qu'à `memberCount > 0` : en
/// français, où N = 1 tombe dans le SINGULIER, une conversation à un seul
/// membre lisait « • 1 membres ». Le défaut se répétait à l'identique en
/// espagnol, italien et allemand ; l'arabe (6 formes) ne pouvait tout
/// simplement pas être servi correctement par une chaîne à plat.
///
/// Le contrat est désormais : la RÈGLE PLURIELLE vient du catalogue, la
/// couleur/police/écart vient de la vue. Ce test verrouille la première.
///
/// `bundle` et `locale` vont par PAIRE (idiome `PostStatAccessibilityTests`,
/// docs 45-48 de ce fichier-frère) : le bundle choisit la TABLE
/// (`fr.lproj` / `en.lproj`), le locale choisit la RÈGLE plurielle. Fixer
/// l'un sans l'autre rendrait le test vert en local (simu français) et
/// rouge en CI (simu anglais).
///
/// `@MainActor` : `ForwardPickerRow` vit dans le target app, isolé
/// main-actor-par-défaut (Swift 6.2) ; les appels synchrones depuis les
/// tests doivent partager cet acteur (même contrat que `PostStatAccessibilityTests`).
@MainActor
final class ForwardPickerMembersCountLabelTests: XCTestCase {

    private func label(_ count: Int, in code: String) throws -> String {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return ForwardPickerRow.membersCountLabel(
            count,
            bundle: try XCTUnwrap(Bundle(path: path)),
            locale: Locale(identifier: code)
        )
    }

    // MARK: - Le compteur est toujours présent

    func test_label_containsTheCount() throws {
        XCTAssertTrue(try label(42, in: "en").contains("42"))
        XCTAssertTrue(try label(42, in: "fr").contains("42"))
    }

    // MARK: - Accord singulier / pluriel, langue par langue
    //
    // Le défaut original : le français rangeait « 1 » dans le pluriel. Cette
    // assertion RÉGRESSE explicitement ce comportement.

    func test_label_singularInFrench() throws {
        XCTAssertEqual(try label(1, in: "fr"), "• 1 membre")
    }

    func test_label_pluralInFrench() throws {
        XCTAssertEqual(try label(3, in: "fr"), "• 3 membres")
    }

    func test_label_singularInEnglish() throws {
        XCTAssertEqual(try label(1, in: "en"), "• 1 member")
    }

    func test_label_pluralInEnglish() throws {
        XCTAssertEqual(try label(3, in: "en"), "• 3 members")
    }

    /// L'espagnol et l'italien accordent comme le français — même défaut,
    /// même régression.
    func test_label_singularInSpanish() throws {
        XCTAssertEqual(try label(1, in: "es"), "• 1 miembro")
    }

    func test_label_pluralInSpanish() throws {
        XCTAssertEqual(try label(4, in: "es"), "• 4 miembros")
    }

    func test_label_singularInItalian() throws {
        XCTAssertEqual(try label(1, in: "it"), "• 1 membro")
    }

    func test_label_pluralInItalian() throws {
        XCTAssertEqual(try label(4, in: "it"), "• 4 membri")
    }

    func test_label_singularInGerman() throws {
        XCTAssertEqual(try label(1, in: "de"), "• 1 Mitglied")
    }

    func test_label_pluralInGerman() throws {
        XCTAssertEqual(try label(5, in: "de"), "• 5 Mitglieder")
    }

    // MARK: - Distinction singulier ≠ pluriel dans TOUTES les langues romanes / germaniques

    /// Une assertion volontairement globale : si l'une des locales ci-dessous
    /// perd sa `variations.plural`, elle retomberait sur une seule forme et ce
    /// test rougirait. Verrou de la même famille que `LocalizationConsistencyTests`.
    func test_singularAndPluralDifferInEveryLatinLocale() throws {
        for code in ["fr", "en", "es", "it", "de", "pt-BR"] {
            let one = try label(1, in: code)
            let many = try label(5, in: code)
            XCTAssertNotEqual(
                one, many,
                "le compteur « membre » doit s'accorder au nombre en \(code) — variations.plural manquante ?"
            )
        }
    }
}
