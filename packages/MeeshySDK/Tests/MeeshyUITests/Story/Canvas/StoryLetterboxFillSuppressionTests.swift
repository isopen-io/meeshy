import XCTest
import UIKit
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// **Quand le lecteur présente l'image seule, la bande n'est plus PEINTE**
/// (#6636).
///
/// Le lecteur rogne alors la carte au rectangle de l'image : la bande sort du
/// cadre visible. La rogner en continuant de la peindre paierait un calque — et
/// un bitmap réduit — que personne ne voit (loi 8). Le témoin porte donc sur les
/// trois étages qui transmettent la décision, du plus bas au plus haut : le
/// calque de fond, le canvas, et les deux hôtes qui le montent.
@MainActor
final class StoryLetterboxFillSuppressionTests: XCTestCase {

    private let scene = CGSize(width: 405, height: 720)

    private func paysage() -> UIImage {
        let taille = CGSize(width: 160, height: 90)
        return UIGraphicsImageRenderer(size: taille).image { ctx in
            UIColor.systemPink.setFill()
            ctx.fill(CGRect(origin: .zero, size: taille))
        }
    }

    private func calqueAjuste() -> StoryBackgroundLayer {
        let layer = StoryBackgroundLayer()
        layer.frame = CGRect(origin: .zero, size: scene)
        layer.configure(kind: .solidColor(.black),
                        transform: BackgroundTransform(videoFitMode: "fit"),
                        geometry: CanvasGeometry(renderSize: scene),
                        resolver: nil, imageCache: nil,
                        letterboxFillHashes: ["fond"])
        return layer
    }

    /// **Le calque** : suspendue, la bande disparaît — même avec le bitmap déjà
    /// stampé, la source que le hachage ne peut pas retenir. Rendue, elle revient
    /// sans reconfiguration : le lecteur peut changer d'avis à la rotation.
    func test_leCalque_nePeintPasLaBandeQuandElleEstSuspendue() {
        let layer = calqueAjuste()
        layer.noteStampedBackground(paysage())
        XCTAssertNotNil(layer.letterboxFillLayer, "fusible : la bande existe avant la suspension")

        layer.setLetterboxFillSuppressed(true)
        XCTAssertNil(layer.letterboxFillLayer, "suspendue, la bande ne se peint plus")

        layer.noteStampedBackground(paysage())
        XCTAssertNil(layer.letterboxFillLayer, "un bitmap qui arrive ne la ramène pas")

        layer.setLetterboxFillSuppressed(false)
        XCTAssertNotNil(layer.letterboxFillLayer, "rendue, elle revient")
    }

    /// **Le canvas** transmet la décision à son calque de fond — et elle survit
    /// à la reconstruction des calques, qui reconfigure le fond à chaque passe.
    func test_leCanvas_transmetLaDecisionAuCalqueDeFond() {
        let canvas = StoryCanvasUIView(slide: StorySlide(id: "s"), mode: .play)
        XCTAssertTrue(canvas.servesLetterboxFill, "par défaut la bande est servie")

        canvas.servesLetterboxFill = false
        XCTAssertTrue(canvas.backgroundLayer.isLetterboxFillSuppressed)

        canvas.servesLetterboxFill = true
        XCTAssertFalse(canvas.backgroundLayer.isLetterboxFillSuppressed)
    }

    /// **Les deux hôtes** : le representable porte la décision, et le player la
    /// lui transmet. Le défaut reste « servie » — toutes les autres surfaces
    /// (carte de fil, détail, plein écran, composer) gardent leurs bandes.
    func test_lesHotes_portentLaDecision_etServentParDefaut() {
        let story = StoryItem(id: "s", createdAt: Date(timeIntervalSince1970: 0))
        XCTAssertTrue(StoryReaderRepresentable(story: story).servesLetterboxFill)
        XCTAssertFalse(StoryReaderRepresentable(story: story, servesLetterboxFill: false).servesLetterboxFill)

        let document = CanvasV3(scenes: [SceneV3(id: "s1", objects: [])])
        let lecteur = MeeshyScenePlayer(document: document, mode: .reader,
                                        sceneIndex: .constant(0), isPlaying: .constant(false),
                                        accentColorHex: "#6366F1")
        XCTAssertTrue(lecteur.host.servesLetterboxFill)
        let imageSeule = MeeshyScenePlayer(document: document, mode: .reader,
                                           sceneIndex: .constant(0), isPlaying: .constant(false),
                                           accentColorHex: "#6366F1",
                                           servesLetterboxFill: false)
        XCTAssertFalse(imageSeule.host.servesLetterboxFill)
    }
}
