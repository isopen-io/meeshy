import XCTest
@testable import MeeshyUI

/// **Un poster vidéo sans vignette serveur patiente sur son thumbHash** (#8231).
///
/// Depuis que le fil ne lit plus aucune vidéo, `MeeshyVideoThumbnail` est le
/// SEUL visage d'une vidéo reçue. Quand le serveur n'a pas posé de
/// `thumbnailUrl`, la première image s'extrait par un `GET` partiel : pendant
/// ce temps, la cellule montrait un dégradé générique alors que le thumbHash —
/// décodé en moins d'une milliseconde — donnait déjà la silhouette de l'image.
final class MeeshyVideoThumbnailPendingLayerTests: XCTestCase {

    func test_pendingLayer_withAThumbHash_showsTheThumbHash() {
        XCTAssertEqual(MeeshyVideoThumbnail.pendingLayer(thumbHash: "3OcRJYB4d3h/iIeHeEh3eIhw+j3A"), .thumbHash)
    }

    func test_pendingLayer_withoutThumbHash_fallsBackToTheGradient() {
        XCTAssertEqual(MeeshyVideoThumbnail.pendingLayer(thumbHash: nil), .gradient)
    }

    func test_pendingLayer_withAnEmptyThumbHash_fallsBackToTheGradient() {
        XCTAssertEqual(MeeshyVideoThumbnail.pendingLayer(thumbHash: ""), .gradient,
                       "une chaîne vide ne décode rien : le dégradé reste le repli")
    }
}
