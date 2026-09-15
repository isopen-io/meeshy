import XCTest
import CoreGraphics
@testable import Meeshy

/// #6760 — **LE PLATEAU EST LA SCÈNE.**
///
/// Directive porteur (2026-09-15) : « les details de l'auteur et les actions
/// doivent être aligné sur le plateau ! C'est le plateau entier qui prend le
/// tumbHash de la scene ! Ce qui est construit se pose donc sur la plateau au
/// milieu et le plateau est la scene ! »
///
/// Mesuré sur sa capture, une pièce 900 × 3 600 dans la galerie de
/// conversation : le ThumbHash occupait bien tout le plateau et le média était
/// bien centré — mais la colonne d'actions était posée sur le bord du MÉDIA
/// (x ≈ 615, pour un média finissant à 622) alors que le plateau s'arrête à 690.
///
/// **Le témoin qui porte la loi est celui de l'INVARIANCE** : deux médias de
/// formes différentes dans le même plateau doivent rendre le MÊME chrome. Une
/// implémentation qui lirait le média ne peut pas le satisfaire par accident.
final class StageChromeAlignmentTests: XCTestCase {

    /// Le plateau mesuré sur la capture du porteur (pt, iPhone 16 Pro).
    private let plateau = CGRect(x: 175, y: 218, width: 351, height: 1008)

    /// La pièce très haute et étroite de la capture : 900 × 3 600.
    private let mediaEtroit = CGRect(x: 225, y: 219, width: 250, height: 1006)

    /// Une pièce large — une photo 4:3 dans le même plateau.
    private let mediaLarge = CGRect(x: 175, y: 487, width: 351, height: 263)

    // MARK: - L'invariance, qui EST la loi

    func test_deuxMediasDeFormesDifferentes_rendentLeMemeChrome() {
        let a = StageChromeAlignment.chromeBounds(stage: plateau, media: mediaEtroit)
        let b = StageChromeAlignment.chromeBounds(stage: plateau, media: mediaLarge)

        XCTAssertEqual(a, b, "Changer de média ne doit RIEN déplacer : le chrome appartient au plateau.")
    }

    /// Le défaut d'origine, écrit en négatif : le bord droit du chrome n'est pas
    /// celui du média. Sans ce témoin, une implémentation qui rend le média
    /// passerait celui d'au-dessus dès que les deux cadres coïncident.
    func test_leBordDroitDuChrome_estCeluiDuPlateau_pasDuMedia() {
        let chrome = StageChromeAlignment.chromeBounds(stage: plateau, media: mediaEtroit)

        XCTAssertEqual(chrome.maxX, plateau.maxX, accuracy: 0.001)
        XCTAssertNotEqual(chrome.maxX, mediaEtroit.maxX, accuracy: 0.001)
    }

    func test_leBordGaucheDuChrome_estCeluiDuPlateau_pasDuMedia() {
        let chrome = StageChromeAlignment.chromeBounds(stage: plateau, media: mediaEtroit)

        XCTAssertEqual(chrome.minX, plateau.minX, accuracy: 0.001)
        XCTAssertNotEqual(chrome.minX, mediaEtroit.minX, accuracy: 0.001)
    }

    // MARK: - Le média se pose au MILIEU du plateau

    func test_unMediaPlusEtroit_estCentreDansLePlateau() {
        let pose = StageChromeAlignment.mediaOrigin(stage: plateau, mediaSize: CGSize(width: 250, height: 1006))

        XCTAssertEqual(pose.x, plateau.midX - 125, accuracy: 0.001)
        XCTAssertEqual(pose.y, plateau.midY - 503, accuracy: 0.001)
    }

    /// **Le rang qui compte** : un média plus COURT que le plateau laisse deux
    /// bandes ÉGALES, jamais une seule. C'est le défaut que #6717 a mesuré sur
    /// la scène — fond visible en haut, rien en bas.
    func test_unMediaPlusCourt_laisseDeuxBandesEGALES() {
        let pose = StageChromeAlignment.mediaOrigin(stage: plateau, mediaSize: CGSize(width: 351, height: 800))

        let haut = pose.y - plateau.minY
        let bas = plateau.maxY - (pose.y + 800)
        XCTAssertEqual(haut, bas, accuracy: 0.001, "Une bande d'un seul côté se lit comme un défaut d'alignement.")
    }

    /// Un média PLUS GRAND que le plateau déborde symétriquement — le cadre le
    /// clippe. Sans cette borne, un `max(0, …)` bien intentionné le collerait en
    /// haut et rendrait le hors-champ asymétrique.
    func test_unMediaPlusGrand_debordeSymetriquement() {
        let pose = StageChromeAlignment.mediaOrigin(stage: plateau, mediaSize: CGSize(width: 351, height: 1200))

        let haut = plateau.minY - pose.y
        let bas = (pose.y + 1200) - plateau.maxY
        XCTAssertEqual(haut, bas, accuracy: 0.001)
    }
}
