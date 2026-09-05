import Testing
import Foundation
import CoreGraphics
@testable import MeeshyUI

/// **Une légende s'aligne sur la scène qu'elle commente** (#4762).
///
/// Mesuré au simulateur `Meeshy-Reader` le 2026-09-02, story ouverte en plein
/// écran sur un iPhone 16 Pro (**402 × 874 pt**) :
///
/// | élément | x | largeur |
/// |---|---:|---:|
/// | conteneur de pagination | −44,7 | 491,3 |
/// | canvas | 10,0 | 381,9 |
/// | légende | **−24,8** | **437,7** |
///
/// L'ordre `padding` puis `frame` de `MediaCaptionOverlay` était déjà juste — il
/// avait été corrigé la veille. Ce qui débordait n'était pas la vue mais la
/// largeur qu'on lui PROPOSAIT : son `frame(maxWidth: .infinity)` résolvait celle
/// du conteneur. `−44,7 + 20` (l'inset) `= −24,7`, contre −24,8 mesuré.
///
/// > Une vue ne peut pas se défendre d'un conteneur trop large.
struct StoryCaptionColumnTests {

    private static let viewport = CGSize(width: 402, height: 874)

    @Test("La colonne de la légende EST celle du canvas — le cas mesuré")
    func colonneDuCanvas() {
        let largeur = StoryCanvasFraming.captionColumnWidth(
            viewport: Self.viewport, ratio: 9.0 / 16.0, scale: 0.95)
        // 402 (ajustement 9:16 en largeur) × 0,95 = 381,9 — la valeur relevée
        // pour le canvas dans l'arbre d'accessibilité.
        #expect(abs(largeur - 381.9) < 0.5)
    }

    @Test("Elle ne suit JAMAIS le conteneur, si large soit-il")
    func jamaisLeConteneur() {
        let largeur = StoryCanvasFraming.captionColumnWidth(
            viewport: Self.viewport, ratio: 9.0 / 16.0, scale: 0.95)
        #expect(largeur < 491.3, "491,3 est la largeur du conteneur de pagination — la légende ne doit pas l'atteindre.")
        #expect(largeur <= Self.viewport.width, "Une légende plus large que l'écran sort par les deux bords.")
    }

    @Test("En plein bord (échelle 1) elle épouse le canvas, sans le dépasser")
    func pleinBord() {
        let largeur = StoryCanvasFraming.captionColumnWidth(
            viewport: Self.viewport, ratio: 9.0 / 16.0, scale: 1)
        #expect(abs(largeur - 402) < 0.5)
    }

    /// Un fond PAYSAGE change le ratio, donc la colonne : la règle suit la
    /// scène réelle, jamais un 9:16 supposé.
    @Test("Un fond paysage rétrécit la colonne avec lui")
    func fondPaysage() {
        let paysage = StoryCanvasFraming.captionColumnWidth(
            viewport: Self.viewport, ratio: 16.0 / 9.0, scale: 1)
        #expect(abs(paysage - 402) < 0.5, "En 16:9 la largeur reste bornée par l'écran, la hauteur suit.")
    }

    /// Garde de robustesse : une échelle négative (état transitoire d'animation)
    /// ne doit pas produire une largeur négative, que SwiftUI interpréterait
    /// comme une contrainte invalide.
    @Test("Une échelle négative rend zéro, jamais une largeur négative")
    func échelleNégative() {
        #expect(StoryCanvasFraming.captionColumnWidth(
            viewport: Self.viewport, ratio: 9.0 / 16.0, scale: -0.5) == 0)
    }
}
