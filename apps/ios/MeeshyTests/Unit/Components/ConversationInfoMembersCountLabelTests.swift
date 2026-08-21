import XCTest
@testable import Meeshy

/// L'en-tête de la fiche conversation (`ConversationInfoSheet`) affichait
/// `String(format: "%d membre%@", count, count > 1 ? "s" : "")` : le « s »
/// latin était collé à la racine de CHAQUE langue au-delà de 1. Trois
/// familles de défaut se cachaient sous une apparence FR/EN correcte :
///
/// - **Italien** : « 5 membros » au lieu de « 5 membri » (pluriel en « i »).
/// - **Allemand** : « 5 Mitglieds » au lieu de « 5 Mitglieder ».
/// - **Arabe** : « 5 عضوs » — un caractère LATIN greffé sur l'écriture arabe.
///   L'arabe distingue en outre six formes plurielles qu'une chaîne à plat ne
///   pouvait pas rendre.
///
/// Le compteur est le libellé du chapeau « Membres » de la fiche — c'est LA
/// première information de la section, lue par VoiceOver dès l'ouverture.
///
/// Le contrat est désormais : la RÈGLE PLURIELLE vient du catalogue, la
/// couleur/police/écart de la vue. Ce test verrouille la première, dans les
/// six locales latines/germanique — et régresse explicitement les défauts IT
/// et DE (le défaut original produisait « membros » et « Mitglieds »).
///
/// `bundle` et `locale` vont par PAIRE (idiome `PostStatAccessibilityTests`) :
/// le bundle choisit la TABLE, le locale la RÈGLE. Fixer l'un sans l'autre
/// rendrait le test vert en local et rouge en CI (ou l'inverse).
///
/// `@MainActor` : `ConversationInfoSheet` vit dans le target app, isolé
/// main-actor-par-défaut (Swift 6.2) ; les appels synchrones depuis les
/// tests doivent partager cet acteur.
@MainActor
final class ConversationInfoMembersCountLabelTests: XCTestCase {

    private func label(_ count: Int, in code: String) throws -> String {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return ConversationInfoSheet.membersCountLabel(
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

    // MARK: - Accord singulier / pluriel

    func test_label_singularInFrench() throws {
        XCTAssertEqual(try label(1, in: "fr"), "1 membre")
    }

    func test_label_pluralInFrench() throws {
        XCTAssertEqual(try label(3, in: "fr"), "3 membres")
    }

    func test_label_singularInEnglish() throws {
        XCTAssertEqual(try label(1, in: "en"), "1 member")
    }

    func test_label_pluralInEnglish() throws {
        XCTAssertEqual(try label(3, in: "en"), "3 members")
    }

    func test_label_singularInSpanish() throws {
        XCTAssertEqual(try label(1, in: "es"), "1 miembro")
    }

    func test_label_pluralInSpanish() throws {
        XCTAssertEqual(try label(4, in: "es"), "4 miembros")
    }

    /// **Régression du défaut principal** : avant, « 4 membros » — la racine
    /// portugaise/espagnole avec un « s » latin collé, au lieu de « 4 membri ».
    func test_label_pluralInItalian() throws {
        XCTAssertEqual(try label(4, in: "it"), "4 membri")
    }

    func test_label_singularInItalian() throws {
        XCTAssertEqual(try label(1, in: "it"), "1 membro")
    }

    /// **Régression du défaut principal** : avant, « 5 Mitglieds » — la racine
    /// singulière avec un « s » latin collé, au lieu de « 5 Mitglieder ».
    func test_label_pluralInGerman() throws {
        XCTAssertEqual(try label(5, in: "de"), "5 Mitglieder")
    }

    func test_label_singularInGerman() throws {
        XCTAssertEqual(try label(1, in: "de"), "1 Mitglied")
    }

    func test_label_pluralInPortuguese() throws {
        XCTAssertEqual(try label(3, in: "pt-BR"), "3 membros")
    }

    func test_label_singularInPortuguese() throws {
        XCTAssertEqual(try label(1, in: "pt-BR"), "1 membro")
    }

    // MARK: - Singulier ≠ pluriel dans TOUTES les locales latines / germaniques

    /// Verrou général : si l'une des locales ci-dessous perd sa
    /// `variations.plural`, elle retomberait sur une seule forme et ce test
    /// rougirait — même famille de garde que `LocalizationConsistencyTests`.
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

    /// **Régression du défaut arabe** : avant, le format produisait « 5 عضوs »
    /// (« s » latin greffé). Après, aucune des formes arabes ne doit contenir
    /// de caractère latin — ni « s », ni chiffres alphabétiques ASCII autres
    /// que les indo-arabes rendus par le formatter (Xcode conserve `%d` sous
    /// forme numérique occidentale en arabe latinisé, ce qui est acceptable).
    func test_arabicLabel_containsNoLatinSuffix() throws {
        let arabicLabels = [1, 2, 3, 5, 12, 100].map { try? label($0, in: "ar") }.compactMap { $0 }
        XCTAssertEqual(arabicLabels.count, 6, "chaque forme AR doit être servie")
        for value in arabicLabels {
            XCTAssertFalse(
                value.contains("s"),
                "le format arabe ne doit plus porter le « s » latin greffé : \(value)"
            )
        }
    }
}
