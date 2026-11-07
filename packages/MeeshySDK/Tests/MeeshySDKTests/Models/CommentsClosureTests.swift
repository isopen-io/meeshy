import XCTest
@testable import MeeshySDK

/// **Les commentaires d'une publication fermée se lisent sur la charge servie**
/// (#16541) — `commentsDisabled` sur la publication ET sur celle qu'elle
/// republie, absent d'un serveur antérieur (ouvert).
final class CommentsClosureTests: XCTestCase {

    /// Relevée sur le staging (`WriteAcknowledgementWireTests.storyRepost`),
    /// réduite aux champs que la règle lit ; les deux drapeaux sont paramétrés.
    private func wire(own: String?, source: String?) -> String {
        let ownField = own.map { #""commentsDisabled":\#($0),"# } ?? ""
        let sourceField = source.map { #""commentsDisabled":\#($0),"# } ?? ""
        return #"""
        {"id":"6aeb00fe31240d07248a0d69","type":"POST","visibility":"PUBLIC","content":null,\#(ownField)"allowSoundExtraction":false,"commentCount":0,"createdAt":"2026-11-04T09:55:10.287Z","author":{"id":"6ada27bf28983c39d9838be9","username":"recmod_m","displayName":"Recette Moderation","avatar":null},"repostOf":{"id":"6aea9043674bc60d1d3ff682","type":"STORY",\#(sourceField)"content":null,"originalLanguage":"en","author":{"id":"6ada27bf28983c39d9838be9","username":"recmod_m","displayName":"Recette Moderation","avatar":null},"createdAt":"2026-11-04T01:54:11.924Z"}}
        """#
    }

    private func decode(own: String?, source: String?) async throws -> APIPost {
        try await APIClient.decodeOffMain(APIPost.self, from: Data(wire(own: own, source: source).utf8))
    }

    // MARK: - Décodage

    func test_decode_servedFalse_isOpen() async throws {
        let post = try await decode(own: "false", source: nil)
        XCTAssertEqual(post.commentsDisabled, false)
        XCTAssertFalse(post.commentsClosed)
    }

    func test_decode_servedTrue_isClosed() async throws {
        let post = try await decode(own: "true", source: nil)
        XCTAssertTrue(post.commentsClosed)
    }

    func test_decode_olderServerWithoutField_isOpen() async throws {
        let post = try await decode(own: nil, source: nil)
        XCTAssertNil(post.commentsDisabled)
        XCTAssertFalse(post.commentsClosed)
    }

    func test_decode_closedSource_closesTheRepost() async throws {
        let post = try await decode(own: "false", source: "true")
        XCTAssertEqual(post.repostOf?.commentsDisabled, true)
        XCTAssertTrue(post.commentsClosed)
    }

    // MARK: - Modèle d'affichage

    func test_toFeedPost_carriesOwnAndSourceFlags() async throws {
        let closed = try await decode(own: "true", source: nil).toFeedPost()
        XCTAssertTrue(closed.commentsDisabled)
        XCTAssertTrue(closed.commentsClosed)

        let viaSource = try await decode(own: "false", source: "true").toFeedPost()
        XCTAssertFalse(viaSource.commentsDisabled)
        XCTAssertEqual(viaSource.repost?.commentsDisabled, true)
        XCTAssertTrue(viaSource.commentsClosed)
    }

    func test_feedPostCacheRoundTrip_keepsTheClosure() throws {
        var post = FeedPost(author: "A", content: "x")
        post.commentsDisabled = true

        let decoded = try JSONDecoder().decode(FeedPost.self, from: JSONEncoder().encode(post))

        XCTAssertTrue(decoded.commentsClosed)
    }

    func test_feedPostCachedBeforeTheField_decodesOpen() throws {
        let decoded = try JSONDecoder().decode(FeedPost.self, from: JSONEncoder().encode(FeedPost(author: "A", content: "x")))
        XCTAssertFalse(decoded.commentsClosed)
    }

    func test_storyGroups_carryTheClosure() async throws {
        let json = #"""
        {"id":"s1","type":"STORY","commentsDisabled":true,"createdAt":"2026-11-04T09:55:10.287Z","author":{"id":"u1","username":"u"}}
        """#
        let story = try await APIClient.decodeOffMain(APIPost.self, from: Data(json.utf8))

        let item = [story].toStoryGroups().first?.stories.first

        XCTAssertEqual(item?.commentsClosed, true)
        XCTAssertEqual(item?.mergingContentTranslation(language: "en", content: "hi").commentsClosed, true)
    }

    // MARK: - Droit de basculer

    func test_mayToggle_author_isTrue() {
        XCTAssertTrue(CommentsClosure.mayToggle(authoredByViewer: true, platformRole: "USER"))
    }

    func test_mayToggle_platformModerators_isTrue() {
        for role in ["MODERATOR", "ADMIN", "BIGBOSS"] {
            XCTAssertTrue(CommentsClosure.mayToggle(authoredByViewer: false, platformRole: role), role)
        }
    }

    func test_mayToggle_otherReaders_isFalse() {
        for role in ["USER", "AUDIT", "ANALYST", "moderator", nil] as [String?] {
            XCTAssertFalse(CommentsClosure.mayToggle(authoredByViewer: false, platformRole: role), role ?? "nil")
        }
    }

    // MARK: - Refus servi

    func test_isRefusal_commentsDisabledEnvelope_isTrue() {
        let body = Data(#"{"success":false,"error":"Les commentaires sont désactivés","code":"COMMENTS_DISABLED"}"#.utf8)
        XCTAssertTrue(CommentsClosure.isRefusal(MeeshyError.forbidden(reason: nil, body: body)))
    }

    func test_isRefusal_otherForbidden_isFalse() {
        let body = Data(#"{"success":false,"error":"Interdit","code":"FORBIDDEN"}"#.utf8)
        XCTAssertFalse(CommentsClosure.isRefusal(MeeshyError.forbidden(reason: nil, body: body)))
        XCTAssertFalse(CommentsClosure.isRefusal(MeeshyError.forbidden(reason: nil, body: nil)))
        XCTAssertFalse(CommentsClosure.isRefusal(MeeshyError.server(statusCode: 500, message: "x")))
    }

    // MARK: - Corps des requêtes

    func test_createBody_carriesTheClosureOnlyWhenAsked() throws {
        let closed = try JSONSerialization.jsonObject(with: JSONEncoder().encode(CreatePostRequest(content: "x", commentsDisabled: true))) as? [String: Any]
        XCTAssertEqual(closed?["commentsDisabled"] as? Bool, true)

        let silent = try JSONSerialization.jsonObject(with: JSONEncoder().encode(CreatePostRequest(content: "x"))) as? [String: Any]
        XCTAssertNil(silent?["commentsDisabled"])
    }

    func test_updateBody_carriesTheClosureOnlyWhenAsked() throws {
        let reopened = try JSONSerialization.jsonObject(with: JSONEncoder().encode(UpdatePostRequest(commentsDisabled: false))) as? [String: Any]
        XCTAssertEqual(reopened?["commentsDisabled"] as? Bool, false)

        let silent = try JSONSerialization.jsonObject(with: JSONEncoder().encode(UpdatePostRequest(content: "x"))) as? [String: Any]
        XCTAssertNil(silent?["commentsDisabled"])
    }

    // MARK: - Service

    func test_setCommentsDisabled_patchesTheSettingsRoute_andReturnsTheWrittenState() async throws {
        let mock = MockAPIClient()
        mock.stubWire("/posts/p1/comment-settings", json: #"{"success":true,"data":{"postId":"p1","commentsDisabled":true}}"#)

        let written = try await PostService(api: mock).setCommentsDisabled(postId: "p1", disabled: true)

        XCTAssertTrue(written)
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["commentsDisabled"] as? Bool, true)
    }
}
