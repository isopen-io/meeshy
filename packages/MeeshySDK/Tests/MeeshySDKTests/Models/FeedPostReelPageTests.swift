import XCTest
@testable import MeeshySDK

/// **Une page de réel ne se réévalue que si ce qu'elle montre change (#10354).**
///
/// `FeedPost: Equatable` ne compare que l'identifiant. La page de réel rendue
/// `Equatable` s'appuie sur `rendersSameReelPage`, qui doit voir chaque champ
/// qu'elle affiche — sans quoi une édition, un compteur ou une traduction
/// resteraient invisibles.
final class FeedPostReelPageTests: XCTestCase {

    private func reel(content: String = "Bonjour", likes: Int = 0,
                      translations: [String: PostTranslation]? = nil,
                      media: [FeedMedia] = []) -> FeedPost {
        FeedPost(id: "r1", author: "Awa", authorId: "u1", type: "REEL", content: content,
                 timestamp: Date(timeIntervalSince1970: 0), likes: likes, media: media,
                 originalLanguage: "fr", translations: translations)
    }

    func test_sameReel_rendersTheSamePage() {
        XCTAssertTrue(FeedPost.rendersSameReelPage(reel(), reel()))
    }

    func test_anEdit_changesThePage() {
        XCTAssertFalse(FeedPost.rendersSameReelPage(reel(), reel(content: "Salut")))
    }

    func test_aLikeFromTheSocket_changesThePage() {
        XCTAssertFalse(FeedPost.rendersSameReelPage(reel(), reel(likes: 1)))
    }

    func test_anArrivingTranslation_changesThePage() {
        XCTAssertFalse(FeedPost.rendersSameReelPage(
            reel(), reel(translations: ["en": PostTranslation(text: "Hello")])))
    }

    func test_aNewCaption_changesThePage() {
        let before = FeedMedia(id: "m1", type: .video, url: "/v.mp4")
        let after = FeedMedia(id: "m1", type: .video, url: "/v.mp4", caption: "Plage")
        XCTAssertFalse(FeedPost.rendersSameReelPage(reel(media: [before]), reel(media: [after])))
    }

    func test_anArrivingTranslatedAudio_changesThePage() {
        let before = FeedMedia(id: "m1", type: .audio, url: "/a.m4a")
        let after = FeedMedia(id: "m1", type: .audio, url: "/a.m4a",
                              translatedAudios: [MessageTranslatedAudio(id: "t1", attachmentId: "m1",
                                                                        targetLanguage: "en", url: "/a-en.m4a",
                                                                        transcription: "Hello", durationMs: 1000,
                                                                        format: "m4a", cloned: false,
                                                                        quality: 1, ttsModel: "mms")])
        XCTAssertFalse(FeedPost.rendersSameReelPage(reel(media: [before]), reel(media: [after])))
    }

    func test_anotherReel_isAnotherPage() {
        let other = FeedPost(id: "r2", author: "Awa", authorId: "u1", type: "REEL", content: "Bonjour",
                             timestamp: Date(timeIntervalSince1970: 0), originalLanguage: "fr")
        XCTAssertFalse(FeedPost.rendersSameReelPage(reel(), other))
    }
}
