import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **Une image ou une vidéo en plein écran tient entière dans l'écran** (#10352).
///
/// Retour porteur du 2026-10-12 : « les images et vidéo affichés en full full
/// screen sortent du viewport sous iOS ! […] Dans la galerie de la conversation ».
///
/// La cause : chaque page posait un cadre FIXE calculé contre la fenêtre, quel
/// que soit le conteneur qu'elle recevait réellement. Une page protégée vit dans
/// la couche sécurisée (#9574), dont le contrôleur retranchait la zone sûre ; une
/// fenêtre redimensionnée (iPad) n'invalidait pas le corps de la galerie. Dans
/// les deux cas le cadre était plus grand que sa place, et le média en sortait.
///
/// Trois témoins tiennent la correction :
/// - le viewport du solveur est celui que la galerie MESURE, la fenêtre n'étant
///   qu'un repli avant la première mesure ;
/// - les deux pages, image et vidéo, plient leur cadre au conteneur mesuré
///   (`FittedMediaStage`, loi `MediaStageFraming.Result.fitted(in:)`) ;
/// - la galerie ne lit plus la fenêtre qu'à cet unique repli.
@MainActor
final class MediaGalleryPageFitsItsContainerTests: XCTestCase {

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    // MARK: - Le viewport du solveur

    func test_viewport_beforeTheFirstMeasure_fallsBackToTheWindow() {
        let window = CGSize(width: 390, height: 844)
        XCTAssertEqual(MediaGalleryStage.viewport(measured: .zero, window: window), window)
    }

    func test_viewport_onceMeasured_isTheMeasure_notTheWindow() {
        let measured = CGSize(width: 507, height: 700)
        XCTAssertEqual(MediaGalleryStage.viewport(measured: measured, window: CGSize(width: 1024, height: 1366)),
                       measured,
                       "une fenêtre redimensionnée (Split View, Stage Manager) se lit à la MESURE de la galerie")
    }

    func test_viewport_aDegenerateMeasure_isNotAViewport() {
        let window = CGSize(width: 390, height: 844)
        XCTAssertEqual(MediaGalleryStage.viewport(measured: CGSize(width: 390, height: 0), window: window), window)
    }

    // MARK: - Les deux pages plient leur cadre au conteneur réel

    func test_imageAndVideoPages_fitTheirStageIntoTheContainerTheyReceive() throws {
        let text = try AppSourceGuard.unit(Self.gallery)
        let montages = text.components(separatedBy: "FittedMediaStage(stage: stage)").count - 1
        XCTAssertEqual(montages, 2,
                       "GalleryImagePage ET GalleryVideoPage posent leur cadre par FittedMediaStage — un cadre fixe calculé contre la fenêtre déborde d'un conteneur plus petit")
    }

    func test_theGallery_readsTheWindowSizeOnlyAsTheViewportFallback() throws {
        let text = try AppSourceGuard.unit(Self.gallery)
        let lectures = text.components(separatedBy: "DeviceLayout.windowSize").count - 1
        XCTAssertEqual(lectures, 1,
                       "la fenêtre n'est qu'un repli avant la mesure (`stageViewport`) — chaque autre lecture rend des cotes qu'aucune rotation ni redimensionnement n'invalide")
    }
}
