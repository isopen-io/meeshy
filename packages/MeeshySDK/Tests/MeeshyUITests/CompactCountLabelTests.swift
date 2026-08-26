import XCTest
@testable import MeeshyUI

/// L'abrégé des grands nombres des cartes « communauté » (effectif et nombre de
/// conversations) était composé à la main :
///
/// ```swift
/// String(format: "%.1fk", Double(count) / 1000.0)
/// ```
///
/// `String(format:)` **sans locale** ne localise rien — il formate selon la
/// locale POSIX. Le défaut n'était donc pas un détail de goût :
///
/// - le **séparateur décimal** restait le point dans TOUTES les langues, alors
///   que le français, l'espagnol, l'italien, l'allemand et le portugais
///   emploient la virgule — et que le point y est le séparateur de MILLIERS.
///   « 1.5k » ne s'y lit pas « mille cinq cents » ;
/// - le **suffixe latin** « k » / « M » était gravé, y compris en arabe, qui
///   abrège par « ألف » / « مليون ».
///
/// Ces tests n'affirment PAS les chaînes exactes que rend CLDR — elles
/// appartiennent à Foundation et peuvent évoluer d'une version d'iOS à l'autre.
/// Ils vérifient les **propriétés** qui constituaient précisément le défaut, et
/// que l'ancien code violait toutes :
///
/// | Propriété | Ancien code | Attendu |
/// |---|---|---|
/// | dépend de la locale | non — sortie identique partout | oui |
/// | virgule décimale en français | non — « 1.5k » | oui |
/// | pas de suffixe latin en arabe | non — « 1.5k » | oui |
///
/// La première ligne est LA régression : l'invariance à la locale ÉTAIT le bug,
/// donc la variance est la preuve du correctif.
///
/// Suite **phase 0** (`MeeshySDK-Package`) : `CompactCountLabel` vit dans
/// `MeeshyUI` depuis qu'il sert AUSSI `VibrantCommunityCard` côté SDK. La
/// fonction est `nonisolated` — un formateur pur n'a aucune raison d'être
/// isolé — mais la classe reste `@MainActor`, idiome des suites `MeeshyUITests`.
@MainActor
final class CompactCountLabelTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")
    private let english = Locale(identifier: "en_US")
    private let arabic = Locale(identifier: "ar")

    // MARK: - La régression : l'abrégé dépend enfin de la locale

    func test_compactForm_differsBetweenFrenchAndEnglish() {
        XCTAssertNotEqual(
            CompactCountLabel.text(1500, locale: french),
            CompactCountLabel.text(1500, locale: english),
            "l'ancien `String(format:)` sans locale rendait « 1.5k » partout — "
            + "un abrégé localisé DOIT différer entre deux locales aux "
            + "séparateurs décimaux distincts"
        )
    }

    func test_frenchCompactForm_usesTheCommaDecimalSeparator() {
        let value = CompactCountLabel.text(1500, locale: french)
        XCTAssertTrue(
            value.contains(","),
            "le français sépare les décimales par une virgule — rendu : \(value)"
        )
    }

    func test_arabicCompactForm_carriesNoLatinSuffix() {
        let value = CompactCountLabel.text(1500, locale: arabic)
        for latin in ["k", "K", "M"] {
            XCTAssertFalse(
                value.contains(latin),
                "l'arabe abrège par « ألف » / « مليون », jamais par un suffixe latin — rendu : \(value)"
            )
        }
    }

    // MARK: - Les magnitudes restent distinctes

    func test_thousandsAndMillionsRenderDifferently() {
        XCTAssertNotEqual(
            CompactCountLabel.text(1_500, locale: english),
            CompactCountLabel.text(1_500_000, locale: english),
            "un millier et un million ne peuvent pas s'abréger pareil"
        )
    }

    func test_compactForm_isMonotonicAcrossMagnitudes() {
        let values = [999, 1_500, 1_500_000].map { CompactCountLabel.text($0, locale: english) }
        XCTAssertEqual(Set(values).count, 3, "trois magnitudes, trois rendus distincts")
    }

    // MARK: - Sous le millier, le nombre reste tel quel

    func test_smallCountsRenderPlainly() {
        XCTAssertEqual(CompactCountLabel.text(999, locale: english), "999")
        XCTAssertEqual(CompactCountLabel.text(0, locale: english), "0")
        XCTAssertEqual(CompactCountLabel.text(42, locale: english), "42")
    }

    /// Sous le millier il n'y a pas de décimale à séparer : les deux locales
    /// doivent alors coïncider. Garde-fou contre un helper qui introduirait un
    /// séparateur de milliers là où l'ancien code n'en mettait pas.
    func test_smallCounts_areIdenticalAcrossLocales() {
        XCTAssertEqual(
            CompactCountLabel.text(999, locale: french),
            CompactCountLabel.text(999, locale: english)
        )
    }
}
