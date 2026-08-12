import XCTest
import SwiftUI
@testable import MeeshyUI

/// Métriques et composition de la trame des réglages.
///
/// Ce qui est testé ici est ce qui se voit : l'alignement du filet séparateur
/// et ce que VoiceOver prononce. Le reste (dégradés, verre) n'est pas décidable
/// en test unitaire et relève de la relecture visuelle.
@MainActor
final class SettingsComponentsTests: XCTestCase {

    // MARK: - Filet séparateur

    /// Le filet doit commencer au TEXTE, pas au bord de la carte. Un filet
    /// pleine largeur redonne à la carte l'aspect « tableau » dense qu'on
    /// cherche justement à quitter ; c'est le détail qui sépare une liste
    /// aérée d'une grille.
    func test_separatorInset_startsAtTheTitle_notAtTheCardEdge() {
        XCTAssertEqual(
            SettingsRowMetrics.separatorInset,
            SettingsRowMetrics.horizontalPadding
                + SettingsRowMetrics.iconSize
                + SettingsRowMetrics.iconTextSpacing
        )
    }

    /// Garde-fou de dérive : l'inset est DÉRIVÉ, jamais réglé à la main. Si
    /// quelqu'un grossit la pastille d'icône sans toucher au filet, le filet
    /// doit suivre tout seul.
    func test_separatorInset_isDerived_notHardCoded() {
        XCTAssertGreaterThan(SettingsRowMetrics.separatorInset, SettingsRowMetrics.iconSize)
        XCTAssertNotEqual(SettingsRowMetrics.separatorInset, 16)
    }

    /// La densité visée est celle d'une fiche aérée, pas d'un tableau. On fige
    /// le plancher plutôt que la valeur exacte : le design peut respirer
    /// davantage, jamais moins.
    func test_rowMetrics_areSpaciousEnoughForTheTargetDesign() {
        XCTAssertGreaterThanOrEqual(SettingsRowMetrics.verticalPadding, 14)
        XCTAssertGreaterThanOrEqual(SettingsRowMetrics.iconSize, 32)
        XCTAssertGreaterThanOrEqual(SettingsRowMetrics.minimumHeight, 44,
                                    "Cible tactile minimale Apple HIG")
    }

    // MARK: - VoiceOver

    func test_accessibilityLabel_combinesTitleAndValue() {
        XCTAssertEqual(
            SettingsRowMetrics.accessibilityLabel(title: "Stockage", value: "407,8 Mo"),
            "Stockage, 407,8 Mo"
        )
    }

    /// Sans valeur, pas de virgule orpheline — VoiceOver marquerait une pause
    /// sur du vide.
    func test_accessibilityLabel_withoutValue_isTitleAlone() {
        XCTAssertEqual(
            SettingsRowMetrics.accessibilityLabel(title: "Stockage", value: nil),
            "Stockage"
        )
        XCTAssertEqual(
            SettingsRowMetrics.accessibilityLabel(title: "Stockage", value: "  "),
            "Stockage",
            "Une valeur vide de sens ne doit pas être annoncée"
        )
    }

    // MARK: - Info

    /// Deux lignes distinctes ne doivent jamais partager une fiche d'info :
    /// l'identité vient de la clé de ligne, pas du titre affiché (deux écrans
    /// peuvent légitimement afficher « Analytics »).
    func test_settingsInfo_identityComesFromTheKey() {
        let a = SettingsInfo(id: "privacy.analytics", title: "Analytics", message: "…")
        let b = SettingsInfo(id: "data.analytics", title: "Analytics", message: "…")
        XCTAssertNotEqual(a.id, b.id)
    }

    func test_settingsInfo_isEquatable_soThePresentationDoesNotFlicker() {
        let a = SettingsInfo(id: "k", title: "T", message: "M")
        let b = SettingsInfo(id: "k", title: "T", message: "M")
        XCTAssertEqual(a, b)
    }
}
