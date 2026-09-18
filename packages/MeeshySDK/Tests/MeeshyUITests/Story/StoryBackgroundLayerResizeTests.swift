import XCTest
import QuartzCore
@testable import MeeshyUI

/// **Un canvas qui GRANDIT doit reprojeter son fond** (#6904, tour 3).
///
/// Mesuré au simulateur le 2026-09-17 sur le repère F1 (post pano 4:1, plein
/// écran immersif de la galerie) : le canvas reçoit bien ses nouvelles bornes —
/// `layoutSubviews` trace `bounds={402, 714.67}` après la carte `{378, 672}` —
/// mais le fond reste peint aux cotes de la CARTE, ancré en haut à gauche. Le
/// média se retrouve 23 pt au-dessus du centre du cadre, et les textes d'une
/// scène plus chargée sortent par le bord.
///
/// La cause est un diff qui se compare à LUI-MÊME : `configure` sortait par
/// `nothingChanged` dès que `self.frame.size == geometry.renderSize`, or l'hôte
/// (`StoryCanvasUIView.rebuildLayers`) assigne `backgroundLayer.frame` à la
/// nouvelle taille DOUZE lignes plus haut, juste avant d'appeler `configure`.
/// La condition était donc vraie à chaque passe, y compris celle où la
/// géométrie venait de changer — et la branche `canReuseContent`, qui existe
/// précisément pour « resync frame (resize du canvas) », n'était jamais
/// atteinte.
///
/// > Un diff qui interroge une valeur que son APPELANT vient d'écrire ne mesure
/// > plus le changement : il mesure sa propre assignation.
@MainActor
final class StoryBackgroundLayerResizeTests: XCTestCase {

    private let carded = CGSize(width: 378, height: 672)
    private let immersive = CGSize(width: 402, height: 714 + 2.0 / 3.0)

    func test_configure_apresAgrandissementDuCanvas_reprojetteLeContenu() {
        let layer = StoryBackgroundLayer()
        configure(layer, at: carded)
        XCTAssertEqual(layer.contentLayer?.frame.size.width ?? 0, carded.width, accuracy: 0.5)
        XCTAssertEqual(layer.contentLayer?.frame.size.height ?? 0, carded.height, accuracy: 0.5)

        configure(layer, at: immersive)

        XCTAssertEqual(layer.contentLayer?.frame.size.width ?? 0, immersive.width, accuracy: 0.5,
                       "le fond garde la largeur de la carte après le passage en plein écran")
        XCTAssertEqual(layer.contentLayer?.frame.size.height ?? 0, immersive.height, accuracy: 0.5,
                       "le fond garde la hauteur de la carte après le passage en plein écran")
    }

    func test_configure_apresRetrecissementDuCanvas_reprojetteLeContenu() {
        let layer = StoryBackgroundLayer()
        configure(layer, at: immersive)

        configure(layer, at: carded)

        XCTAssertEqual(layer.contentLayer?.frame.size.width ?? 0, carded.width, accuracy: 0.5)
        XCTAssertEqual(layer.contentLayer?.frame.size.height ?? 0, carded.height, accuracy: 0.5)
    }

    /// Le diff reste ARMÉ : deux passes à géométrie identique ne recréent pas le
    /// contenu — c'est ce que la garde anti-flash protège, et le correctif ne
    /// doit pas l'ouvrir.
    func test_configure_deuxFoisAlaMemeGeometrie_gardeLeMemeSousLayer() {
        let layer = StoryBackgroundLayer()
        configure(layer, at: carded)
        let premier = layer.contentLayer

        configure(layer, at: carded)

        XCTAssertTrue(layer.contentLayer === premier)
    }

    /// Ce que l'hôte fait, dans son ordre : il pose le cadre de la couche PUIS
    /// il la reconfigure (`StoryCanvasUIView+Rendering.rebuildLayers`). Rejouer
    /// cet ordre est tout l'objet du témoin — c'est lui qui rendait le diff
    /// aveugle.
    private func configure(_ layer: StoryBackgroundLayer, at size: CGSize) {
        layer.frame = CGRect(origin: .zero, size: size)
        layer.configure(kind: .gradient(colors: [.red, .blue], direction: .topToBottom),
                        transform: BackgroundTransform(),
                        geometry: CanvasGeometry(renderSize: size),
                        resolver: nil,
                        imageCache: nil)
    }
}
