import XCTest
@testable import Meeshy

/// #5036 — **le pied des références COLLE au bas du dessin, pas au bas de la
/// frame.**
///
/// > Directive porteur 2026-09-03 : « les hashtag et mention doivent être
/// > **directement en bas de la scene** aligné comme le son de fond de la
/// > scene ! »
///
/// ## Ce que la mesure a appris, et qui n'était pas dans l'énoncé
///
/// Le pied était **déjà** rangé avant la rangée d'outils : l'ORDRE était juste.
/// Il flottait pourtant à **77 pt** sous le dessin (mesuré au simulateur,
/// iPhone 16 Pro, 9:16). Ces points ne sont ni une marge ni un espacement de
/// pile — le canvas est `maxHeight: .infinity` et la carte, ajustée à son
/// ratio, s'y CENTRE. C'est la moitié basse du letterbox, que rien n'occupe.
///
/// > Un ordre juste peut produire une disposition fausse. Réordonner n'aurait
/// > rien changé : ce qui séparait le pied de la carte n'était pas un frère,
/// > c'était du VIDE que la pile ne pouvait pas voir.
final class ComposerReferencesLiftTests: XCTestCase {

    private var gouttiere: CGFloat { ComposerRailGeometry.referencesGutter }

    /// Le cas nominal : la carte est contrainte par la LARGEUR, il reste du
    /// letterbox, et le pied remonte de tout sauf la gouttière.
    func test_unLetterboxAmple_remonteLePiedÀUneGouttièrePrès() {
        let remontee = ComposerRailGeometry.referencesLift(cardBottomInset: 77, gutter: gouttiere)
        XCTAssertEqual(remontee, 77 - gouttiere)
        XCTAssertEqual(77 - remontee, gouttiere,
                       "ce qui reste entre le dessin et le pied EST la gouttière")
    }

    /// **Le cas iPad, et ce n'est pas une précaution.** Dès que la carte est
    /// contrainte par la HAUTEUR — écran large, format non 9:16 —, le letterbox
    /// vaut zéro : il n'y a rien à remonter. Une remontée négative ferait
    /// chevaucher le pied avec la rangée qui le suit, ce qui est PIRE que
    /// l'écart qu'on corrige.
    func test_sansLetterbox_leePiedNeRemontePas() {
        XCTAssertEqual(ComposerRailGeometry.referencesLift(cardBottomInset: 0, gutter: gouttiere), 0)
    }

    /// La même borne rend l'appel sûr quand le letterbox est plus MINCE que la
    /// gouttière — un cas que le nominal ne distingue pas du précédent, et où
    /// une soustraction nue rendrait un négatif.
    func test_unLetterboxPlusMinceQueLaGouttière_neRemontePasÀLenvers() {
        XCTAssertEqual(ComposerRailGeometry.referencesLift(cardBottomInset: 2, gutter: gouttiere), 0)
        XCTAssertEqual(ComposerRailGeometry.referencesLift(cardBottomInset: -30, gutter: gouttiere), 0)
    }

    /// **La gouttière basse est celle du HAUT.** Le porteur demande
    /// explicitement l'alignement sur la trace du son (« aligné comme le son de
    /// fond ») ; deux gouttières qui diffèrent de deux points se lisent comme un
    /// défaut, pas comme une intention. `ComposerSceneSoundHeader` pose
    /// `.padding(.bottom, 6)`.
    func test_lesDeuxGouttières_sontLaMême() {
        XCTAssertEqual(ComposerRailGeometry.referencesGutter, 6)
    }

    /// **Le pied cède toujours à un outil ouvert** (#5010). Le corps de #5036
    /// demandait l'inverse — « même quand un outil est ouvert » — mais il a été
    /// écrit AVANT que #5010 ne soit livré, sur une directive porteur du même
    /// jour qui dit explicitement de cacher les éléments permanents de la zone
    /// canonique pendant qu'un outil s'affiche.
    ///
    /// > Le corps d'une issue est DATÉ ; le code ne l'est pas. Ce témoin fixe
    /// > laquelle des deux clauses gouverne, pour qu'un lecteur de #5036 ne
    /// > défasse pas #5010 en croyant le compléter.
    func test_leePiedCèdeÀUnOutilOuvert_etLaLoiDOrdreNeLeRamènePas() {
        XCTAssertFalse(ComposerCanonicalZone.isServed(.references, toolIsOpen: true))
        XCTAssertTrue(ComposerCanonicalZone.isServed(.references, toolIsOpen: false))
    }
}
