import XCTest
@testable import Meeshy

/// **Le longpress d'un message ouvre le composer v3** (#5409).
///
/// Directive porteur 2026-09-06 : « dans le longpress de message dans les
/// conversations, le composer qui est ouvert à ce moment-là doit être remplacé
/// par le composer v3 ».
///
/// Le chemin est : longpress → `MessageOverlayMenu` → « Composer » →
/// `MediaComposerDoor` → `MeeshyComposerHost`, ouverture
/// `.mediaSeeded`. La seule règle qui décide de la surface montée est
/// `ComposerSurfaceRouting.surface`, et c'est elle que ce fichier interroge —
/// jamais une capture d'écran, qui ne dirait pas POURQUOI.
final class ComposerLongPressOpensV3Tests: XCTestCase {

    func test_mediaSeeded_monteLePlateauDocument() {
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: .post), .document)
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: .story), .document)
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: .reel), .document)
    }

    /// Le statut garde sa surface : le mood est sans scène, et c'est la même
    /// réponse que pour toutes les autres ouvertures qui laissent choisir.
    func test_mediaSeeded_leStatutResteSurLeMood() {
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .mediaSeeded, format: .status), .mood)
    }

    /// **Plus aucune ouverture ne reste sur l'atelier** (#15629) : la reprise
    /// et la caméra vidéo suivent le format comme les autres, et l'atelier a
    /// quitté le dépôt — `ComposerSurfaceKind` n'a plus de case pour lui.
    func test_laRepriseEtLaCameraVideo_suiventLeFormat() {
        for opening in [ComposerOpening.resume, .videoCameraReady] {
            XCTAssertEqual(ComposerSurfaceRouting.surface(opening: opening, format: .post), .document)
            XCTAssertEqual(ComposerSurfaceRouting.surface(opening: opening, format: .story), .document)
            XCTAssertEqual(ComposerSurfaceRouting.surface(opening: opening, format: .status), .mood)
        }
    }
}
