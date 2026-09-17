import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La carte du lecteur de stories est la scène, et la scène est 9:16**
/// (décision porteur du 2026-09-17 sur #6896, lot #6904).
///
/// Ce témoin remplace `StoryImageOnlyReaderTests`, dont le sujet — la carte
/// rognée au rectangle de l'image quand rien n'en sort (#6636) — est SUPPLANTÉ :
/// une scène ne change plus de forme selon ce qu'elle contient. La loi
/// (`StoryImageOnlyPresentation`) et son mesureur (`StorySceneFootprint`)
/// restent au SDK avec leurs propres témoins ; le LECTEUR ne les consulte plus.
///
/// Ce qu'il tient :
/// - la carte a les cotes que `SceneShape.layout(.carded(…), in:)` donne ;
/// - le rayon se compense pour l'échelle de la carte, comme avant ;
/// - les trois couches du lecteur partagent la MÊME forme et le MÊME fond, et
///   les quatre montages du canvas la même décision de peinture.
@MainActor
final class StoryReaderSceneCardTests: XCTestCase {

    private let viewport = CGSize(width: 402, height: 874)

    // MARK: - La forme vient de la loi

    /// Le canvas du lecteur est posé aux cotes de la scène — 9:16 ajusté dans le
    /// viewport —, et c'est la loi qui les donne. Le témoin compare les deux
    /// écritures : celle du lecteur (`CanvasGeometry.aspectFitSize`, historique)
    /// et celle de la loi. Elles doivent rendre la MÊME chose, sans quoi le
    /// lecteur et la galerie ne cadrent plus la même scène.
    func test_leCadreDuCanvas_estCeluiDeLaLoi() {
        let parLaLoi = SceneShape.layout(.carded(.black), in: viewport).sceneFrame.size
        let parLeFit = CanvasGeometry.aspectFitSize(in: viewport, ratio: SceneShape.aspect)

        XCTAssertEqual(parLaLoi.width, parLeFit.width, accuracy: 0.01)
        XCTAssertEqual(parLaLoi.height, parLeFit.height, accuracy: 0.01)
        XCTAssertEqual(parLaLoi.width / parLaLoi.height, SceneShape.aspect, accuracy: 0.0001)
    }

    /// **Un lecteur n'a pas d'immersif** (décision porteur) : un tap AVANCE, il
    /// ne bascule pas de cadre. La carte reste donc ajustée, jamais couvrante —
    /// et la loi le dit sans que le lecteur ait à le redire.
    func test_laCarteDuLecteur_neCouvreJamaisLeViewport() {
        let carte = SceneShape.layout(.carded(.black), in: viewport).sceneFrame

        XCTAssertLessThanOrEqual(carte.width, viewport.width)
        XCTAssertLessThanOrEqual(carte.height, viewport.height)
    }

    /// Le clip vit dans l'espace non mis à l'échelle : une carte peinte à 0,5
    /// doit rogner à 40 pour montrer les 20 pt de rayon de la loi.
    ///
    /// **La compensation a QUITTÉ le lecteur** (#6904) : elle vit dans
    /// `SceneCard`, qui gouverne le clip — l'hôte DÉCLARE son facteur au lieu
    /// de faire la division. C'était la dernière ligne d'arithmétique de forme
    /// restée chez lui.
    func test_leRayon_seCompensePourLEchelleDeLaCarte() {
        let loi = SceneShape.layout(.carded(StoryCardView.readerSceneBackdrop), in: viewport)
        XCTAssertEqual(SceneCard<EmptyView>.unscaledCornerRadius(layout: loi, override: nil,
                                                                 hostScale: 0.5),
                       SceneShape.cardedCornerRadius * 2)
        XCTAssertEqual(SceneCard<EmptyView>.unscaledCornerRadius(layout: loi, override: nil,
                                                                 hostScale: 0),
                       SceneShape.cardedCornerRadius)
    }

    // MARK: - Le montage

    /// **Les trois couches de la carte partagent la forme ET le fond, et les
    /// quatre montages du canvas la décision de peindre.**
    ///
    /// Une couche restée sur l'ancien clip ferait sauter la forme quand le
    /// chargeur se retire ; un montage resté sur `imageOnlyRect` rognerait la
    /// carte au rectangle de l'image, ce que la décision du 2026-09-17 retire.
    func test_leLecteur_monteLaFormeEtLeFondSurChaqueCouche() throws {
        let source = AppSourceGuard.stripComments(try String(contentsOf: canvasSource, encoding: .utf8))

        XCTAssertEqual(source.components(separatedBy: ".readerCard(layout: readerSceneLayout").count - 1,
                       3, "canvas sortant, canvas courant, chargeur")
        XCTAssertEqual(source.components(separatedBy: "servesLetterboxFill: false").count - 1,
                       4, "deux hôtes, sortant et courant")
        XCTAssertFalse(source.contains("imageOnlyRect"),
                       "la carte ne se rogne plus au rectangle de l'image : la scène est TOUJOURS 9:16")
        XCTAssertFalse(source.contains("readerCanvasFraming.cornerRadius / readerCanvasFraming.scale"),
                       "aucune couche ne garde l'ancien clip écrit à la main")
    }

    /// **Le fond du lecteur ne peut pas être le même dégradé que celui du plein
    /// écran** (#6797) : c'est ce qui rendait la carte invisible sur le repère
    /// F6 — le hachage étiré derrière ET dans la carte. Une couleur PLATE ne
    /// peut pas ressembler à un flou.
    func test_leFondDeLaCarte_estUneCouleurPlate() throws {
        let source = AppSourceGuard.stripComments(try String(contentsOf: canvasSource, encoding: .utf8))
        XCTAssertTrue(source.contains("SceneShape.layout(.carded(Self.readerSceneBackdrop)"),
                      "la forme remise à la carte porte le fond, et la carte le peint")
        XCTAssertEqual(StoryCardView.readerSceneBackdrop, .thumbHashDominantColor)
        XCTAssertEqual(StoryCardView.readerSceneBackdrop, SceneShape.cardedBackdrop,
                       "le même fond que le plein écran cadré d'un post (#6904)")
    }

    private var canvasSource: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
    }
}
