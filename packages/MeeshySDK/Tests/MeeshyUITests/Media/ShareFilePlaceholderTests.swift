import XCTest
import AVFoundation
import UIKit
@testable import MeeshyUI

/// #9682 — le placeholder d'une source de partage paresseuse est un VRAI fichier :
/// c'est sur lui que la feuille décide d'offrir « Enregistrer la vidéo » et « Fichiers ».
@MainActor
final class ShareFilePlaceholderTests: XCTestCase {

    func test_video_isARealPlayableVideo_underTheFinalName() async throws {
        let url = try XCTUnwrap(ShareFilePlaceholder.video(named: "Meeshy-reel.mp4"))
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        XCTAssertEqual(url.lastPathComponent, "Meeshy-reel.mp4")
        let tracks = try await AVURLAsset(url: url).loadTracks(withMediaType: .video)
        XCTAssertEqual(tracks.count, 1, "une vraie piste vidéo, lisible")
        XCTAssertTrue(UIVideoAtPathIsCompatibleWithSavedPhotosAlbum(url.path),
                      "la photothèque l'accepte : « Enregistrer la vidéo » peut paraître")
    }

    func test_image_isARealImage_underTheFinalName() throws {
        let url = try XCTUnwrap(ShareFilePlaceholder.image(named: "Meeshy-photo.png"))
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        XCTAssertEqual(url.lastPathComponent, "Meeshy-photo.png")
        XCTAssertNotNil(UIImage(contentsOfFile: url.path))
    }
}
