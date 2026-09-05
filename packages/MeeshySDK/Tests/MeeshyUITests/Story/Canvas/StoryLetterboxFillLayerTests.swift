import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Qui POSE ce que la règle décide.**
///
/// `StoryLetterboxFillTests` éprouve la règle : combien de bande, avec quelle
/// source, dans quel ordre. Elle resterait verte si personne ne peignait rien —
/// c'est exactement le mode d'échec que la nuit du 2026-08-31 a rencontré deux
/// fois, sur deux surfaces différentes : une bande de mentions montée et jetée,
/// et une bande de letterbox dont la seule source arrivait à la PUBLICATION,
/// donc jamais pendant la composition.
///
/// > La question posée ici n'est ni « la règle est-elle juste ? » ni « qui
/// > l'appelle ? », mais **« y a-t-il, à la fin, un layer avec des pixels
/// > dedans ? »**
///
/// Elle se pose sur un `CALayer` nu, sans fenêtre ni simulateur d'écran : c'est
/// ce qui la rend rapide et déterministe là où une capture demande un
/// double-tap qu'aucun outil d'automatisation ne synthétise de façon fiable.
@MainActor
final class StoryLetterboxFillLayerTests: XCTestCase {

    private let scene = CGSize(width: 405, height: 720)   // 9:16

    private func makeLayer(fitMode: String?, hashes: [String] = []) -> StoryBackgroundLayer {
        let layer = StoryBackgroundLayer()
        layer.frame = CGRect(origin: .zero, size: scene)
        layer.configure(
            kind: .solidColor(.black),
            transform: BackgroundTransform(videoFitMode: fitMode),
            geometry: CanvasGeometry(renderSize: scene),
            resolver: nil,
            imageCache: nil,
            letterboxFillHashes: hashes
        )
        return layer
    }

    private func paysage() -> UIImage {
        let taille = CGSize(width: 160, height: 90)
        return UIGraphicsImageRenderer(size: taille).image { ctx in
            UIColor.systemPink.setFill()
            ctx.fill(CGRect(origin: .zero, size: taille))
        }
    }

    // MARK: - Le bitmap de l'atelier

    /// **Le cas mesuré au simulateur.** Un média que l'auteur vient de choisir
    /// n'a AUCUN hachage — `StoryThumbHashEnricher` ne s'exécute qu'à la
    /// publication. La bande doit tout de même être peinte, depuis le bitmap
    /// que le canvas vient de stamper.
    func test_sansHachage_leBitmapStampePeintLaBande() {
        let layer = makeLayer(fitMode: "fit", hashes: [])
        XCTAssertNil(layer.letterboxFillLayer, "aucune source encore — rien à peindre")

        layer.noteStampedBackground(paysage())

        let fill = try? XCTUnwrap(layer.letterboxFillLayer)
        XCTAssertNotNil(fill, "la bande doit exister dès que la matière arrive")
        XCTAssertNotNil(fill?.contents, "…et porter des PIXELS, pas un layer vide")
    }

    /// La bande se range SOUS le contenu, et par un `insertSublayer(at: 0)` —
    /// pas par l'ordre des appels, qui finirait par la peindre par-dessus la
    /// vidéo le jour où l'attachement du player changera de moment.
    func test_laBande_estLeLayerLePlusBAS() {
        let layer = makeLayer(fitMode: "fit")
        layer.noteStampedBackground(paysage())

        XCTAssertIdentical(layer.sublayers?.first, layer.letterboxFillLayer)
    }

    /// Elle couvre le CANVAS entier et se remplit : un `.resizeAspect` y
    /// laisserait ses propres bandes — un letterbox dans un letterbox.
    func test_laBande_couvreLeCanvas_etSeRemplit() throws {
        let layer = makeLayer(fitMode: "fit")
        layer.noteStampedBackground(paysage())
        let fill = try XCTUnwrap(layer.letterboxFillLayer)

        XCTAssertEqual(fill.frame, CGRect(origin: .zero, size: scene))
        XCTAssertEqual(fill.contentsGravity, .resizeAspectFill)
        XCTAssertEqual(fill.opacity, StoryLetterboxFill.fillOpacity)
    }

    // MARK: - Ce qui ne doit RIEN poser

    /// **Le mode REMPLI est le défaut, donc l'écrasante majorité des scènes.**
    /// Le média y couvre le canvas : un layer de plus n'y ajouterait pas un
    /// pixel, seulement du coût (loi 8).
    func test_enModeREMPLI_aucunLayerNEstPose() {
        for mode in [nil, "fill"] {
            let layer = makeLayer(fitMode: mode, hashes: ["fond"])
            layer.noteStampedBackground(paysage())
            XCTAssertNil(layer.letterboxFillLayer, "mode \(mode ?? "libre")")
        }
    }

    /// Sans aucune source, la bande garde le fond du canvas — jamais un
    /// rectangle fabriqué.
    func test_sansSource_aucunLayerNEstPose() {
        XCTAssertNil(makeLayer(fitMode: "fit", hashes: []).letterboxFillLayer)
    }

    /// **Reconfigurer ne DOUBLE pas la bande.** Chaque `configure` la retire
    /// avant de la reposer ; sans cela, un canvas reconstruit à chaque
    /// `rebuildLayers` empilerait un layer par passe.
    func test_reconfigurer_neDoublePasLaBande() {
        let layer = makeLayer(fitMode: "fit")
        layer.noteStampedBackground(paysage())
        layer.noteStampedBackground(paysage())
        layer.noteStampedBackground(paysage())

        let bandes = (layer.sublayers ?? []).filter { $0 === layer.letterboxFillLayer }
        XCTAssertEqual(bandes.count, 1)
    }

    // MARK: - Le grain

    /// **C'est la RÉDUCTION qui fait le flou, et qui borne le coût.** Poser le
    /// bitmap PLEIN donnerait une bande NETTE — une seconde copie de la photo à
    /// côté d'elle — et retiendrait plusieurs mégaoctets par canvas monté.
    func test_leBitmap_estReduitAuGrainDeLaBande() throws {
        let grand = UIGraphicsImageRenderer(size: CGSize(width: 4032, height: 3024)).image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 4032, height: 3024))
        }
        let reduit = try XCTUnwrap(StoryBackgroundLayer.downsampledForFill(grand))

        XCTAssertEqual(max(reduit.size.width, reduit.size.height),
                       StoryBackgroundLayer.letterboxFillLongEdge, accuracy: 1)
        XCTAssertEqual(reduit.size.width / reduit.size.height, 4032.0 / 3024.0, accuracy: 0.05,
                       "la réduction garde la FORME — une bande déformée trahirait sa source")
    }

    /// Une image déjà minuscule n'est pas AGRANDIE : on ne fabrique pas des
    /// pixels qui n'existent pas.
    func test_uneImageDejaMinuscule_nEstPasAgrandie() throws {
        let petite = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 6)).image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 6))
        }
        let reduit = try XCTUnwrap(StoryBackgroundLayer.downsampledForFill(petite))
        XCTAssertEqual(reduit.size, CGSize(width: 8, height: 6))
    }
}
