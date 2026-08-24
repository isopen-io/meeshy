import XCTest
@testable import Meeshy

/// **Un nombre appartient à la locale de son lecteur — chiffres, groupement,
/// glyphe de pourcentage et espacement compris.**
///
/// Aucune chaîne CLDR n'est nommée ici. Les valeurs exactes (« 1 234 » contre
/// « 1,234 », l'espace insécable avant `%` en français) appartiennent à
/// Foundation et peuvent bouger d'une version d'iOS à l'autre ; les figer
/// rendrait la suite rouge sur une mise à jour du simulateur sans qu'aucune
/// règle du produit ait changé. Ce qui est asserté, c'est **la variance** —
/// puisque l'invariance à la locale ÉTAIT précisément le défaut.
@MainActor
final class LocalizedNumberTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")
    private let english = Locale(identifier: "en_US")
    private let arabic = Locale(identifier: "ar_SA")

    // MARK: - exact

    func test_exact_keepsEveryDigit() {
        XCTAssertEqual(LocalizedNumber.exact(1_234, locale: english).filter(\.isNumber), "1234")
        XCTAssertEqual(LocalizedNumber.exact(1_500_000, locale: english).filter(\.isNumber), "1500000")
    }

    /// Le groupement des milliers diffère entre français et anglais : c'est la
    /// preuve que la locale est consultée, sans nommer sa convention.
    func test_exact_followsTheReadersLocale() {
        XCTAssertNotEqual(
            LocalizedNumber.exact(1_234, locale: french),
            LocalizedNumber.exact(1_234, locale: english)
        )
    }

    /// L'arabe s'écrit en chiffres arabo-indiens. `"\(n)"` gravait les chiffres
    /// latins — une interface arabe mêlait donc deux systèmes d'écriture.
    func test_exact_arabicUsesItsOwnDigits() {
        let spoken = LocalizedNumber.exact(1_234, locale: arabic)
        XCTAssertFalse(
            spoken.contains("1"),
            "En arabe, le nombre ne doit pas s'écrire en chiffres latins — obtenu « \(spoken) »."
        )
        XCTAssertTrue(spoken.contains(where: \.isNumber), "Il doit rester un nombre.")
    }

    func test_exact_zeroIsRendered() {
        XCTAssertTrue(LocalizedNumber.exact(0, locale: english).contains("0"))
    }

    // MARK: - percent

    /// L'entrée est le pourcentage (`50`), pas la fraction : un appelant qui
    /// passerait `0.5` obtiendrait « 0 % ». Ce test épingle le contrat d'entrée.
    func test_percent_takesThePercentageNotTheFraction() {
        XCTAssertEqual(
            LocalizedNumber.percent(50, locale: english).filter(\.isNumber), "50"
        )
        XCTAssertEqual(
            LocalizedNumber.percent(100, locale: english).filter(\.isNumber), "100"
        )
    }

    /// **Le défaut central de 241i.** Le français veut une espace insécable
    /// avant `%`, l'anglais n'en veut pas ; `MessageOverlayMenu` gravait les
    /// DEUX orthographes à quatre lignes d'écart. Les deux rendus doivent donc
    /// différer — sans que le test dise lequel porte l'espace.
    func test_percent_spacingFollowsTheLocale() {
        XCTAssertNotEqual(
            LocalizedNumber.percent(50, locale: french),
            LocalizedNumber.percent(50, locale: english),
            "Le français et l'anglais n'espacent pas le « % » de la même façon."
        )
    }

    func test_percent_arabicUsesItsOwnDigits() {
        let rendered = LocalizedNumber.percent(50, locale: arabic)
        XCTAssertFalse(
            rendered.contains("5"),
            "En arabe, le pourcentage ne doit pas s'écrire en chiffres latins — obtenu « \(rendered) »."
        )
    }

    /// Pas de décimale parasite : l'entrée est entière, la sortie aussi.
    func test_percent_hasNoFractionalPart() {
        for value in [0, 33, 50, 66, 100] {
            let rendered = LocalizedNumber.percent(value, locale: english)
            XCTAssertFalse(
                rendered.contains("."),
                "\(value) rend « \(rendered) » : un pourcentage entier ne porte pas de décimale."
            )
        }
    }

    // MARK: - La règle de 239i n'a pas changé d'énoncé

    /// `ReachMetricLabel.spokenCount` délègue maintenant ici. Les deux doivent
    /// rendre exactement la même chose — sans quoi la « source unique » en
    /// serait deux.
    func test_reachMetricSpokenCount_delegatesToTheSameRule() {
        for value in [0, 7, 1_234, 1_500_000] {
            XCTAssertEqual(
                ReachMetricLabel.spokenCount(value, locale: french),
                LocalizedNumber.exact(value, locale: french)
            )
        }
    }
}
