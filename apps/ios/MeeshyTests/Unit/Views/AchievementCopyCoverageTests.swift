import XCTest
import MeeshySDK
@testable import Meeshy

/// **Chaque famille du catalogue a son MOT — sinon l'écran rend du vide (#5847).**
///
/// `AchievementCopy.label` est un `switch` sur les vingt-deux identités de
/// famille, avec un `default` qui rend `nil`. Ses deux consommateurs traitent
/// ce `nil` différemment, et les deux sont mauvais :
///
///  - le tableau de bord fait `AchievementCopy.label(...) ?? ""` — une **ligne
///    vide** au milieu d'une rangée de succès, sans rien qui rougisse ;
///  - la célébration retombe sur le titre de section — un succès obtenu qui
///    s'annonce « Cercles », sans dire lequel.
///
/// Une famille ajoutée au catalogue partagé sans passer par ici produit donc un
/// écran muet. Ce témoin l'attrape à la compilation du catalogue, pas en
/// production.
@MainActor
final class AchievementCopyCoverageTests: XCTestCase {

    func test_chaqueFamilleDuCatalogue_aSonLibelle() {
        for famille in AchievementCatalog.families {
            for palier in famille.tiers {
                let mot = AchievementCopy.label(famille, tier: palier)
                XCTAssertNotNil(mot, "\(famille.id) n'a pas de libellé — la rangée rendrait du vide")
                XCTAssertFalse(mot?.isEmpty ?? true, "\(famille.id):\(palier) rend une chaîne vide")
            }
        }
    }

    /// Le libellé PORTE le palier — c'est ce qui distingue « 10 conversations »
    /// de « 1 000 conversations » dans une rangée où les deux se suivent. Un
    /// gabarit dont le `{n}` s'est perdu à la traduction rend deux entrées
    /// identiques, et le catalogue devient illisible.
    func test_leLibellePorteSonPalier() {
        for famille in AchievementCatalog.families {
            let mots = famille.tiers.compactMap { AchievementCopy.label(famille, tier: $0) }
            XCTAssertEqual(Set(mots).count, famille.tiers.count,
                           "\(famille.id) rend des libellés identiques d'un palier à l'autre — "
                               + "le nombre s'est perdu dans le gabarit")
        }
    }

    /// Chaque section rendue par l'écran a son titre. `sectionTitle` retombe sur
    /// la clé brute (`default: return section`) : une section neuve afficherait
    /// « decouverte » en en-tête de rangée.
    func test_chaqueSectionRendue_aSonTitre() {
        for section in Set(AchievementCatalog.families.map(\.section)) {
            let titre = AchievementCopy.sectionTitle(section)
            XCTAssertNotEqual(titre, section,
                              "la section « \(section) » affiche sa clé brute en en-tête")
        }
    }
}
