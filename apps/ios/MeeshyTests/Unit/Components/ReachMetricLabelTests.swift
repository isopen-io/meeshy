import XCTest
import MeeshyUI
@testable import Meeshy

/// La valeur qu'un compteur de portée DIT à VoiceOver, par opposition à celle
/// qu'il MONTRE.
///
/// Les deux divergent volontairement : l'écran manque de place et affiche
/// « 1,2 k » (`CompactCountLabel`, 238i) ; un lecteur d'écran n'a pas cette
/// contrainte et doit entendre le nombre réel. Un abrégé lu à voix haute est une
/// perte d'information pure — « mille deux cent trente-quatre » ne coûte rien de
/// plus à écouter que « un virgule deux mille ».
@MainActor
final class ReachMetricLabelTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")
    private let english = Locale(identifier: "en_US")
    private let arabic = Locale(identifier: "ar_SA")

    // MARK: La valeur parlée est EXACTE

    /// Le cœur du contrat : ce que VoiceOver dit n'est jamais l'abrégé.
    func test_spokenCount_isNeverTheAbbreviatedForm() {
        for value in [1_200, 12_000, 1_500_000] {
            XCTAssertNotEqual(
                ReachMetricLabel.spokenCount(value, locale: english),
                CompactCountLabel.text(value, locale: english),
                "\(value) : VoiceOver doit entendre le compte exact, pas l'abrégé affiché."
            )
        }
    }

    /// Exact veut dire exact : les chiffres du nombre sont tous là.
    func test_spokenCount_keepsEveryDigit() {
        XCTAssertEqual(
            ReachMetricLabel.spokenCount(1_234, locale: english).filter(\.isNumber),
            "1234"
        )
        XCTAssertEqual(
            ReachMetricLabel.spokenCount(1_500_000, locale: english).filter(\.isNumber),
            "1500000"
        )
    }

    /// Deux comptes différents ne doivent jamais se dire pareil — c'est ce que
    /// l'abrégé, lui, ne garantit pas (« 1,2 k » vaut pour 1200 comme 1249).
    func test_spokenCount_distinctCountsAreDistinct() {
        XCTAssertNotEqual(
            ReachMetricLabel.spokenCount(1_200, locale: english),
            ReachMetricLabel.spokenCount(1_249, locale: english)
        )
    }

    // MARK: …et localisée

    /// LA régression héritée de 238i, déplacée ici avec la règle. `"\(count)"`
    /// gravait les chiffres latins : son invariance à la locale ÉTAIT le défaut,
    /// donc la variance en est la preuve. Aucune chaîne CLDR n'est nommée — elles
    /// appartiennent à Foundation et peuvent bouger d'une version d'iOS à l'autre.
    func test_spokenCount_followsTheReadersLocale() {
        XCTAssertNotEqual(
            ReachMetricLabel.spokenCount(1_234, locale: french),
            ReachMetricLabel.spokenCount(1_234, locale: english),
            "Le groupement des milliers diffère entre français et anglais."
        )
    }

    /// L'arabe s'écrit en chiffres arabo-indiens. Un compteur qui rend « 1234 »
    /// dans une interface arabe mêle deux systèmes d'écriture.
    func test_spokenCount_arabicUsesItsOwnDigits() {
        let ar = ReachMetricLabel.spokenCount(1_234, locale: arabic)
        XCTAssertFalse(
            ar.contains(where: { $0.isASCII && $0.isNumber }),
            "Aucun chiffre latin ne doit subsister dans le rendu arabe — obtenu : \(ar)"
        )
    }

    /// Sous le millier il n'y a rien à grouper : toutes les locales latines
    /// s'accordent, et le rendu reste le nombre nu.
    func test_spokenCount_belowOneThousand_isTheBareNumber() {
        XCTAssertEqual(ReachMetricLabel.spokenCount(999, locale: english), "999")
        XCTAssertEqual(ReachMetricLabel.spokenCount(0, locale: english), "0")
        XCTAssertEqual(
            ReachMetricLabel.spokenCount(999, locale: french),
            ReachMetricLabel.spokenCount(999, locale: english)
        )
    }
}
