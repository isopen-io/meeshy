import XCTest
@testable import MeeshySDK

final class PostCardSubjectTests: XCTestCase {

    private static let viewer = MessageCardSubject.Viewer(id: "me", displayName: "Moi", username: "moi")
    private static let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private static func makePost(content: String = "Le coucher de soleil à Dakar", type: String? = "POST",
                                 media: [FeedMedia] = [], originalLanguage: String? = nil,
                                 translations: [String: PostTranslation]? = nil) -> FeedPost {
        FeedPost(id: "post", author: "Awa", authorId: "awa", authorUsername: "awa", type: type,
                 content: content, timestamp: t0, media: media,
                 originalLanguage: originalLanguage, translations: translations)
    }

    private static func photo(_ id: String) -> FeedMedia {
        FeedMedia(id: id, type: .image, url: "https://staging.meeshy.me/\(id).jpg", width: 1200, height: 800)
    }

    func test_ofPost_textOnly_paintsTheTextSignedByItsAuthor() throws {
        let subject = try XCTUnwrap(MessageCardSubject.of(post: Self.makePost(), viewer: Self.viewer, preferredLanguages: ["fr"]))

        XCTAssertEqual(subject.reply.text, "Le coucher de soleil à Dakar")
        XCTAssertEqual(subject.reply.author, "Awa")
        XCTAssertEqual(subject.reply.handle, "awa")
        XCTAssertNil(subject.quoted)
        XCTAssertTrue(subject.media.isEmpty)
        XCTAssertEqual(subject.sentAt, Self.t0)
    }

    func test_ofPost_photo_paintsThePhotoAttributedToTheAuthor() throws {
        let post = Self.makePost(content: "", media: [Self.photo("p1")])
        let subject = try XCTUnwrap(MessageCardSubject.of(post: post, viewer: Self.viewer, preferredLanguages: ["fr"]))

        XCTAssertEqual(subject.media.map(\.media.id), ["p1"])
        XCTAssertEqual(subject.media.first?.media.kind, .image)
        XCTAssertEqual(subject.media.first?.author?.name, "Awa")
    }

    func test_ofPost_severalPhotos_paintsThemInOrder() throws {
        let post = Self.makePost(media: [Self.photo("p1"), Self.photo("p2")])
        let subject = try XCTUnwrap(MessageCardSubject.of(post: post, viewer: Self.viewer, preferredLanguages: ["fr"]))

        XCTAssertEqual(subject.media.map(\.media.id), ["p1", "p2"])
    }

    func test_ofPost_videoAndVoice_paintBothKinds() throws {
        let post = Self.makePost(media: [
            FeedMedia(id: "v1", type: .video, url: "https://staging.meeshy.me/v1.mp4", thumbnailUrl: "https://staging.meeshy.me/v1.jpg"),
            FeedMedia(id: "a1", type: .audio, url: "https://staging.meeshy.me/a1.m4a", duration: 12),
        ])
        let subject = try XCTUnwrap(MessageCardSubject.of(post: post, viewer: Self.viewer, preferredLanguages: ["fr"]))

        XCTAssertEqual(subject.media.map(\.media.kind), [.video, .audio])
    }

    func test_ofPost_documentOnlyWithoutText_paintsNothing() {
        let post = Self.makePost(content: "  ", media: [FeedMedia(id: "d1", type: .document, url: "https://staging.meeshy.me/d1.pdf")])

        XCTAssertNil(MessageCardSubject.of(post: post, viewer: Self.viewer, preferredLanguages: ["fr"]))
    }

    func test_ofPost_storyOrStatus_disappears_paintsNothing() {
        XCTAssertNil(MessageCardSubject.of(post: Self.makePost(type: "STORY"), viewer: Self.viewer, preferredLanguages: ["fr"]))
        XCTAssertNil(MessageCardSubject.of(post: Self.makePost(type: "STATUS"), viewer: Self.viewer, preferredLanguages: ["fr"]))
    }

    func test_ofPost_originalBelowRankOne_paintsTheServedTranslation() throws {
        let post = Self.makePost(content: "Hello", originalLanguage: "en",
                                 translations: ["fr": PostTranslation(text: "Bonjour")])

        let subject = try XCTUnwrap(MessageCardSubject.of(post: post, viewer: Self.viewer, preferredLanguages: ["fr", "en"]))

        XCTAssertEqual(subject.reply.text, "Bonjour")
    }

    func test_ofPost_originalAtRankOne_paintsTheOriginal() throws {
        let post = Self.makePost(content: "Hello", originalLanguage: "en",
                                 translations: ["fr": PostTranslation(text: "Bonjour")])

        let subject = try XCTUnwrap(MessageCardSubject.of(post: post, viewer: Self.viewer, preferredLanguages: ["en", "fr"]))

        XCTAssertEqual(subject.reply.text, "Hello")
    }

    func test_ofPost_readRule_paintsWhatTheFeedShows() throws {
        let post = Self.makePost(content: "[notre page](https://meeshy.me)")
        let subject = try XCTUnwrap(MessageCardSubject.of(post: post, viewer: Self.viewer, preferredLanguages: ["fr"],
                                                          read: { $0 == "[notre page](https://meeshy.me)" ? "notre page" : $0 }))

        XCTAssertEqual(subject.reply.text, "notre page")
    }

    func test_ofPost_renderedScene_leadsTheCardAsItsHero() throws {
        let scene = MessageCardSubjectMedia(
            media: MessageCardMedia(id: "scene:post", kind: .video, aspect: 9.0 / 16.0),
            fileURL: "file:///tmp/scene.mp4")
        let post = Self.makePost(media: [Self.photo("p1")])

        let subject = try XCTUnwrap(MessageCardSubject.of(post: post, viewer: Self.viewer, preferredLanguages: ["fr"], leadMedia: [scene]))

        XCTAssertEqual(subject.media.map(\.media.id), ["scene:post", "p1"])
        XCTAssertEqual(subject.media.first?.author?.name, "Awa")
    }
}
