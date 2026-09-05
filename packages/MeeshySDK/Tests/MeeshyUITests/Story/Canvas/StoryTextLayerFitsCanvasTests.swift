import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Un texte de story tient dans son CADRE** (#4762).
///
/// Mesuré au simulateur le 2026-09-02 : la description d'une story s'affichait
/// « e latest apps, models, » pour « The latest apps, models, », « m a viral »
/// pour « From a viral », et sa troisième ligne sortait à droite sous le rail.
/// Le bloc débordait des DEUX côtés d'un canvas pourtant incrusté.
///
/// Le texte en question n'est pas un objet de scène : la story porte bien un
/// canvas v3 (5 objets — 2 médias, 2 stickers emoji, 1 audio) et **aucun texte**.
/// Il est SYNTHÉTISÉ depuis `content` par `StoryEffects.migrateLegacyText`, puis
/// posé par la même `StoryTextLayer` que les autres.
///
/// Ces témoins interrogent donc la couche elle-même, sur le cas qui la met en
/// défaut : un texte **plus long que le cadre**. Un témoin écrit sur un texte
/// court ne peut pas tomber — il tient quelle que soit la règle.
@MainActor
final class StoryTextLayerFitsCanvasTests: XCTestCase {

    private static let longText = """
    The latest apps, models,
    and inspiration
    From a viral dash-cam trend to Google's video editor — here's
    everything that just landed.
    """

    private func poser(_ texte: String,
                       fontSize: Double = 28,
                       scale: Double = 1,
                       renderWidth: CGFloat) -> StoryTextLayer {
        let geometry = CanvasGeometry(renderSize: CGSize(width: renderWidth,
                                                         height: renderWidth / CanvasGeometry.portraitRatio))
        let layer = StoryTextLayer()
        layer.configure(with: StoryTextObject(text: texte, x: 0.5, y: 0.5,
                                              scale: scale, fontSize: fontSize),
                        geometry: geometry, mode: .play, renderScale: 3)
        return layer
    }

    /// Le cas MESURÉ : le cadre réel du lecteur sur iPhone 16 Pro.
    func test_unTexteLong_tientDansLaLargeurDuCadre() {
        let largeur: CGFloat = 380          // points, cadre incrusté du lecteur
        let layer = poser(Self.longText, renderWidth: largeur)
        XCTAssertLessThanOrEqual(layer.bounds.width, largeur,
            "Le texte déborde du cadre de \(layer.bounds.width - largeur) pt — c'est ce qui rognait « The » et « From ».")
    }

    /// La même exigence tenue quand l'auteur a AGRANDI son texte : l'échelle se
    /// replie dans la taille de police AVANT la mise en ligne, donc elle change
    /// le nombre de lignes, jamais la largeur du bloc.
    func test_unTexteAGRANDI_tientEncore() {
        let largeur: CGFloat = 380
        let layer = poser(Self.longText, fontSize: 28, scale: 2.5, renderWidth: largeur)
        XCTAssertLessThanOrEqual(layer.bounds.width, largeur,
            "Un texte mis à l'échelle 2,5 doit gagner des lignes, pas de la largeur.")
    }

    /// Et sur un cadre ÉTROIT — un iPhone SE, ou la scène incrustée d'un post,
    /// où la marge d'erreur est la plus faible.
    func test_surUnCadreETROIT_tientAussi() {
        let largeur: CGFloat = 240
        let layer = poser(Self.longText, renderWidth: largeur)
        XCTAssertLessThanOrEqual(layer.bounds.width, largeur,
            "Le plafond de mise en ligne suit la largeur RENDUE, jamais une constante design.")
    }
}
