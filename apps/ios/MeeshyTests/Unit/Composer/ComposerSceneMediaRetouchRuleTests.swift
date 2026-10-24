import XCTest
import UIKit
@testable import Meeshy

/// #12590 — **« Modifier » une image ou une vidéo de la scène ouvre la retouche, quand le média a
/// une source locale.** Sinon on n'offre pas : un média distant sans fichier garde l'édition en place.
final class ComposerSceneMediaRetouchRuleTests: XCTestCase {

    private func faits(isVideo: Bool = false, mediaURL: String? = nil, adopted: URL? = nil,
                       loadedVideo: URL? = nil, bitmap: Bool = false) -> ComposerSceneMediaFacts {
        ComposerSceneMediaFacts(isVideo: isVideo, mediaURL: mediaURL, adoptedLocalURL: adopted,
                                loadedVideoURL: loadedVideo, hasBitmap: bitmap)
    }

    func test_aLocalImageFile_isOffered_fromItsFile() {
        let url = URL(fileURLWithPath: "/tmp/photo.jpg")
        XCTAssertEqual(ComposerSceneMediaRetouchRule.origin(faits(mediaURL: url.absoluteString, bitmap: true)), .file(url))
    }

    func test_aVideoFile_isOffered() {
        let url = URL(fileURLWithPath: "/tmp/clip.mov")
        XCTAssertTrue(ComposerSceneMediaRetouchRule.offers(faits(isVideo: true, mediaURL: url.absoluteString)))
    }

    func test_aBackgroundImage_isOffered_likeAnyImage() {
        XCTAssertTrue(ComposerSceneMediaRetouchRule.offers(faits(mediaURL: "file:///tmp/fond.heic")))
    }

    func test_theFileIsPreferred_overTheBitmapInMemory() {
        let url = URL(fileURLWithPath: "/tmp/native.jpg")
        XCTAssertEqual(ComposerSceneMediaRetouchRule.origin(faits(mediaURL: url.absoluteString, bitmap: true)), .file(url),
                       "la définition native prime sur le bitmap réduit de la scène")
    }

    func test_aRemoteImageWithoutAnyLocalSource_isNotOffered() {
        XCTAssertFalse(ComposerSceneMediaRetouchRule.offers(faits(mediaURL: "https://cdn.meeshy.me/p.jpg")))
    }

    func test_aRemoteImageWithAnAdoptedLocalCopy_isOfferedFromThatCopy() {
        let copie = URL(fileURLWithPath: "/tmp/adoptee.jpg")
        XCTAssertEqual(ComposerSceneMediaRetouchRule.origin(faits(mediaURL: "https://cdn.meeshy.me/p.jpg", adopted: copie)),
                       .file(copie))
    }

    func test_aRemoteImageWithOnlyABitmap_isOfferedFromTheBitmap() {
        XCTAssertEqual(ComposerSceneMediaRetouchRule.origin(faits(mediaURL: "https://cdn.meeshy.me/p.jpg", bitmap: true)), .bitmap)
    }

    func test_aRemoteVideoWithoutFile_isNotOffered_evenWithAThumbnailBitmap() {
        XCTAssertFalse(ComposerSceneMediaRetouchRule.offers(faits(isVideo: true, mediaURL: "https://cdn.meeshy.me/v.mp4", bitmap: true)),
                       "la vignette d'une vidéo n'est pas la vidéo")
    }

    func test_aRemoteVideoLoadedFromAFile_isOfferedFromThatFile() {
        let url = URL(fileURLWithPath: "/tmp/charge.mov")
        XCTAssertEqual(ComposerSceneMediaRetouchRule.origin(faits(isVideo: true, mediaURL: "https://cdn.meeshy.me/v.mp4", loadedVideo: url)),
                       .file(url))
    }

    func test_anObjectWithNothing_isNotOffered() {
        XCTAssertFalse(ComposerSceneMediaRetouchRule.offers(faits()))
    }
}

/// #12590 — **le média que « Terminé » rend s'écrit sous `<nouvel id>.<ext>`** : la convention qui
/// relie un bitmap à sa clé de canvas, et le même fichier pour le document et pour la scène.
@MainActor
final class ComposerSceneMediaDeliveryTests: XCTestCase {

    func test_delivery_ofAnImage_isWrittenUnderTheNewObjectId_andSharedByDocumentAndScene() async throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 10)).image { contexte in
            UIColor.red.setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: 20, height: 10))
        }
        let id = UUID().uuidString
        let livre = try XCTUnwrap(await ComposerSceneMediaRetouch.delivery(of: .image(image), objectId: id))
        XCTAssertEqual(livre.media.url.deletingPathExtension().lastPathComponent, id)
        XCTAssertEqual(livre.media.mimeType, "image/jpeg")
        XCTAssertTrue(FileManager.default.fileExists(atPath: livre.media.url.path))
        guard case .image(_, let fichier) = livre.source else { return XCTFail("une image") }
        XCTAssertEqual(fichier, livre.media.url, "le document et la scène portent le MÊME fichier")
    }

    func test_delivery_ofAVideo_movesTheFileUnderTheNewObjectId() async throws {
        let brut = FileManager.default.temporaryDirectory.appendingPathComponent("retouche-\(UUID().uuidString).mov")
        try Data(repeating: 0x2A, count: 64).write(to: brut)
        let id = UUID().uuidString
        let livre = try XCTUnwrap(await ComposerSceneMediaRetouch.delivery(of: .video(brut), objectId: id))
        XCTAssertFalse(FileManager.default.fileExists(atPath: brut.path), "le rendu de l'exporteur est déplacé, pas copié")
        XCTAssertEqual(livre.media.url.lastPathComponent, "\(id).mov")
        XCTAssertTrue(FileManager.default.fileExists(atPath: livre.media.url.path))
        guard case .video(let fichier, _, _, _) = livre.source else { return XCTFail("une vidéo") }
        XCTAssertEqual(fichier, livre.media.url)
    }
}
