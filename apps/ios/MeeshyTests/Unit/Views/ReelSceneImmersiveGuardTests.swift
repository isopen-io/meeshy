import XCTest
import CoreGraphics
@testable import Meeshy
import MeeshySDK

/// **Le réel composé est IMMERSIF, et le rognage qu'il inflige à la scène est
/// MESURÉ, pas juste espéré** (revue #6904, tour 2).
///
/// `ReelSceneView` (`ReelsPlayerView+Scene.swift`) pose `.aspectRatio(SceneShape
/// .aspect, contentMode: .fill)` puis `.clipped()` à la main plutôt que
/// d'appeler `SceneShape.layout(.immersive, in:)` — un des mécanismes « plus
/// anciens et indépendants » que `SceneShape.swift` cite comme non convergés
/// (câbler la loi dans onze hôtes est un lot séparé). Le comportement des
/// deux formulations est néanmoins identique : les deux couvrent le viewport
/// en préservant le rapport 9:16 et centrent le contenu visible. Ce témoin
/// PROUVE cette équivalence sur un viewport de référence (iPhone 402×874) et
/// verrouille que le rognage EST celui de `layout(.immersive)`, jamais un
/// autre — c'est la mesure qu'aucun commit du lot ne rapportait.
final class ReelSceneImmersiveGuardTests: XCTestCase {

    private static let unitFile = "Meeshy/Features/Main/Views/ReelsPlayerView+Scene.swift"

    private func source() throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(Self.unitFile), encoding: .utf8)
    }

    /// **La garde de SOURCE** : `ReelSceneView` reste posé en `.fill` +
    /// `.clipped()` sur le rapport FIXE de la scène — jamais en `.fit` (qui
    /// laisserait des bandes, le défaut que le commentaire du fichier dit
    /// vouloir éviter) et jamais sur un rapport dérivé du média ou du porteur.
    func test_laSceneDUnReel_resteEnRemplissageSurLeRapportFixe() throws {
        let src = try source()
        XCTAssertTrue(src.contains(".aspectRatio(SceneShape.aspect, contentMode: .fill)"),
                      "le réel doit couvrir le viewport au rapport FIXE de la scène, pas un rapport dérivé")
        XCTAssertTrue(src.contains(".clipped()"),
                      "sans .clipped(), le débordement du .fill peindrait par-dessus les vues voisines")
    }

    /// **La MESURE** : sur un viewport portrait ordinaire, `.fill` + `.clipped`
    /// et `SceneShape.layout(.immersive, in:)` rognent EXACTEMENT la même
    /// largeur — 44,8 pt de chaque côté sur un iPhone 402×874, soit 18,2 % de
    /// la largeur de la scène. Un futur écart entre les deux formulations
    /// (l'une réécrite, l'autre non) ferait rougir ce témoin plutôt que de se
    /// découvrir au simulateur.
    func test_leRognageImmersif_estCeluiDeSceneShapeLayout() {
        let viewport = CGSize(width: 402, height: 874)

        let loi = SceneShape.layout(.immersive, in: viewport)

        // Reproduction du calcul `.aspectRatio(_, contentMode: .fill)` +
        // `.frame(maxWidth: .infinity, maxHeight: .infinity)` + `.clipped()` :
        // la vue est dimensionnée au plus PETIT format qui COUVRE le viewport
        // en préservant `SceneShape.aspect`, puis centrée et rognée dessus.
        let largeurCouvrante = max(viewport.width, viewport.height * SceneShape.aspect)
        let hauteurCouvrante = largeurCouvrante / SceneShape.aspect
        let rognageParCote = (largeurCouvrante - viewport.width) / 2

        XCTAssertEqual(loi.sceneFrame.width, largeurCouvrante, accuracy: 1e-6)
        XCTAssertEqual(loi.sceneFrame.height, hauteurCouvrante, accuracy: 1e-6)
        XCTAssertEqual(rognageParCote, 44.8125, accuracy: 1e-3,
                       "mesure de référence du lot #6904 : 44,8 pt rognés de chaque côté")
        XCTAssertEqual((rognageParCote * 2) / largeurCouvrante, 0.1824, accuracy: 1e-3,
                       "18,2 % de la largeur de la scène retirés au total (les deux côtés)")
        XCTAssertEqual(loi.offscreenPainter, .none)
    }
}
