import XCTest
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
