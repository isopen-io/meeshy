import XCTest
@testable import Meeshy

/// Le compteur « N membres » était rendu par SIX surfaces via TROIS mécanismes :
/// deux helpers jumeaux (`ForwardPickerRow` 231i, `ConversationInfoSheet` 232i)
/// sur deux clés distinctes, et quatre concaténations `"\(count) " + unit.members`.
///
/// Cette suite verrouille le contrat unique qui les remplace — elle reprend
/// INTÉGRALEMENT les régressions des deux suites qu'elle absorbe
/// (`ForwardPickerMembersCountLabelTests`, `ConversationInfoMembersCountLabelTests`),
/// et y ajoute les deux défauts que la consolidation solde :
///
/// - **la puce « • » gravée dans la traduction** — elle vivait dans les 13 formes
///   localisées de `forward.members-count`, ce qui empêchait la clé de servir aux
///   surfaces sans puce et faisait porter un glyphe de mise en page à la mémoire
///   de traduction. Elle est désormais rendue par la vue ;
/// - **la concaténation** — `"\(count) " + nom-au-pluriel` ne peut pas accorder :
///   `ConversationListHelpers` rendait « 1 membres » pour un groupe d'un seul
///   membre, et l'arabe (six formes plurielles) n'en recevait jamais qu'une.
///
/// `bundle` et `locale` vont par PAIRE (idiome `PostStatAccessibilityTests`) : le
/// bundle choisit la TABLE, le locale la RÈGLE plurielle. Fixer l'un sans l'autre
/// rendrait le test vert en local et rouge en CI (ou l'inverse).
///
/// `@MainActor` : le target app est isolé main-actor-par-défaut (Swift 6.2) ; les
/// appels synchrones depuis les tests doivent partager cet acteur.
@MainActor
final class MembersCountLabelTests: XCTestCase {

    private static let latinLocales = ["fr", "en", "es", "it", "de", "pt-BR"]

    private func bundle(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    private func label(_ count: Int, in code: String, capped: Bool = false) throws -> String {
        MembersCountLabel.text(
            count,
            capped: capped,
            bundle: try bundle(code),
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

    /// Régression IT (232i) : le suffixe « s » latin produisait « 4 membros »,
    /// mot qui n'existe pas en italien — le pluriel y est en « i ».
    func test_label_pluralInItalian() throws {
        XCTAssertEqual(try label(4, in: "it"), "4 membri")
    }

    func test_label_singularInItalian() throws {
        XCTAssertEqual(try label(1, in: "it"), "1 membro")
    }

    /// Régression DE (232i) : « 5 Mitglieds » au lieu de « 5 Mitglieder ».
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

    /// Verrou général : si l'une des locales perd sa `variations.plural`, elle
    /// retombe sur une forme unique et ce test rougit.
    func test_singularAndPluralDifferInEveryLatinLocale() throws {
        for code in Self.latinLocales {
            XCTAssertNotEqual(
                try label(1, in: code), try label(5, in: code),
                "le compteur « membre » doit s'accorder au nombre en \(code) — variations.plural manquante ?"
            )
        }
    }

    /// Régression AR (231i / 232i) : le format à plat greffait un « s » latin sur
    /// l'écriture arabe (« 5 عضوs ») et n'exposait qu'une des six formes.
    func test_arabicLabel_containsNoLatinSuffix() throws {
        let arabicLabels = try [1, 2, 3, 5, 12, 100].map { try label($0, in: "ar") }
        for value in arabicLabels {
            XCTAssertFalse(
                value.contains("s"),
                "le format arabe ne doit plus porter le « s » latin greffé : \(value)"
            )
        }
    }

    // MARK: - La puce est de la mise en page, plus de la traduction

    /// Régression de la consolidation : `forward.members-count` gravait « • » dans
    /// ses 13 formes localisées. La clé unique ne doit porter aucun séparateur —
    /// c'est ce qui lui permet de servir les six surfaces, avec ou sans puce.
    func test_label_carriesNoSeparatorGlyph() throws {
        for code in Self.latinLocales + ["ar"] {
            for count in [1, 3, 12] {
                let value = try label(count, in: code)
                XCTAssertFalse(
                    value.contains("\u{2022}"),
                    "la puce est rendue par la vue, pas par le catalogue — \(code)/\(count) : \(value)"
                )
            }
        }
    }

    // MARK: - Effectif plafonné par le serveur

    /// Quand le serveur plafonne l'effectif, l'affichage est « 199+ » : le « + »
    /// est un suffixe du NOMBRE, qu'aucun `%d` ne peut porter. Cette forme retombe
    /// sur le nom au pluriel nu — juste, puisqu'un plafond n'est jamais atteint
    /// sous 2 — et reste le SEUL site de concaténation de l'application.
    func test_cappedLabel_keepsThePlusSuffixOnTheCount() throws {
        XCTAssertEqual(try label(199, in: "fr", capped: true), "199+ membres")
        XCTAssertEqual(try label(199, in: "en", capped: true), "199+ members")
        XCTAssertEqual(try label(199, in: "de", capped: true), "199+ Mitglieder")
    }

    func test_uncappedLabel_isThePluralizedForm() throws {
        XCTAssertEqual(try label(199, in: "fr", capped: false), "199 membres")
    }

    func test_cappedDefaultsToFalse() throws {
        let explicit = MembersCountLabel.text(3, capped: false,
                                              bundle: try bundle("fr"),
                                              locale: Locale(identifier: "fr"))
        let implicit = MembersCountLabel.text(3,
                                              bundle: try bundle("fr"),
                                              locale: Locale(identifier: "fr"))
        XCTAssertEqual(explicit, implicit)
    }
}
