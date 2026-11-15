import XCTest
import MeeshySDK
@testable import Meeshy

/// #8230 — une citation d'AUDIO ou de VIDÉO montre son aperçu, comme une
/// citation d'image ou de story.
///
/// La règle est jugée ici en exécution ; le montage de chaque face dans les
/// deux peaux l'est dans `QuotedMediaFaceMountGuardTests`.
final class QuotedMediaFaceTests: XCTestCase {

    private func reference(
        type: String?,
        thumbnail: String? = nil,
        fileUrl: String? = nil,
        isProtected: Bool? = nil,
        isStory: Bool = false
    ) -> ReplyReference {
        ReplyReference(
            messageId: "m1", authorName: "Bob", previewText: "",
            attachmentType: type,
            attachmentThumbnailUrl: thumbnail,
            attachmentFileUrl: fileUrl,
            attachmentIsProtected: isProtected,
            isStoryReply: isStory
        )
    }

    // MARK: - La face

    func test_mediaFace_imageWithThumbnail_isTheThumbnail() {
        XCTAssertEqual(QuotedReplyPresentation.mediaFace(for: reference(type: "image", thumbnail: "https://c/t.jpg")), .thumbnail)
    }

    func test_mediaFace_videoWithServedThumbnail_keepsTheThumbnail() {
        XCTAssertEqual(
            QuotedReplyPresentation.mediaFace(for: reference(type: "video/mp4", thumbnail: "https://c/t.jpg", fileUrl: "https://c/v.mp4")),
            .thumbnail
        )
    }

    func test_mediaFace_videoWithoutThumbnail_extractsAPosterFromItsFile() {
        XCTAssertEqual(
            QuotedReplyPresentation.mediaFace(for: reference(type: "video/mp4", fileUrl: "https://c/v.mp4")),
            .videoPoster,
            "une vidéo dont la vignette serveur a raté doit quand même montrer une image"
        )
    }

    func test_mediaFace_videoWithoutThumbnailNorFile_fallsBackToTheGlyph() {
        XCTAssertNil(QuotedReplyPresentation.mediaFace(for: reference(type: "video")),
                     "un blob ancien sans adresse n'a rien à extraire : le glyphe reste")
    }

    func test_mediaFace_voice_isAnAudioPreview_evenWithoutItsFile() {
        XCTAssertEqual(QuotedReplyPresentation.mediaFace(for: reference(type: "audio")), .audio)
        XCTAssertEqual(QuotedReplyPresentation.mediaFace(for: reference(type: "audio/m4a", fileUrl: "https://c/a.m4a")), .audio)
    }

    func test_mediaFace_protectedMedia_hasNoFaceAtAll() {
        for type in ["image", "video/mp4", "audio"] {
            XCTAssertNil(
                QuotedReplyPresentation.mediaFace(for: reference(type: type, thumbnail: "https://c/t.jpg",
                                                                 fileUrl: "https://c/f", isProtected: true)),
                "\(type) protégé : ni vignette, ni poster, ni onde"
            )
        }
    }

    func test_mediaFace_documentAndStory_haveNoMediaFace() {
        XCTAssertNil(QuotedReplyPresentation.mediaFace(for: reference(type: "application/pdf", fileUrl: "https://c/d.pdf")))
        XCTAssertNil(QuotedReplyPresentation.mediaFace(for: reference(type: "video", thumbnail: "https://c/t.jpg", isStory: true)))
    }

    // MARK: - Le motif d'onde figé

    func test_quotedAudioBars_isDeterministicPerQuotedMessage() {
        let first = QuotedReplyPresentation.quotedAudioBars(seed: "m1")
        XCTAssertEqual(first, QuotedReplyPresentation.quotedAudioBars(seed: "m1"),
                       "la même citation dessine la même onde à chaque rendu")
        XCTAssertNotEqual(first, QuotedReplyPresentation.quotedAudioBars(seed: "m2"))
    }

    func test_quotedAudioBars_staysWithinItsBounds() {
        let bars = QuotedReplyPresentation.quotedAudioBars(seed: "65f0c2a1b3d4e5f601234567")
        XCTAssertEqual(bars.count, QuotedReplyPresentation.quotedAudioBarCount)
        XCTAssertTrue(bars.allSatisfy { (0.25...1).contains($0) })
        XCTAssertGreaterThan(Set(bars).count, 1, "une onde plate ne dit pas « ceci se joue »")
    }
}
