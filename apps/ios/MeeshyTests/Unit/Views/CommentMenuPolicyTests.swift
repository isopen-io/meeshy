import XCTest
import MeeshySDK
import SwiftUI
@testable import Meeshy

/// **Le menu « … » d'un commentaire : quelles actions, pour ce commentaire et
/// ce lecteur** (#8709).
///
/// Directive porteur 2026-09-29 : « permettre, si on est auteur, de pouvoir
/// éditer ; signaler pour les autres ; copier ; et Imager avec l'arbre de
/// réponse si nécessaire ». La loi est UNE — la ligne d'un commentaire de post
/// et celle d'un commentaire de story la lisent toutes deux.
@MainActor
final class CommentMenuPolicyTests: XCTestCase {

    private static let me = "u-me"

    private static func comment(
        id: String = "c1",
        authorId: String = "u-other",
        content: String = "Bonjour",
        translated: String? = nil,
        parentId: String? = nil,
        flags: MessageEffectFlags = []
    ) -> FeedComment {
        FeedComment(id: id, author: "Awa", authorId: authorId, content: content,
                    parentId: parentId, effectFlags: Int(flags.rawValue),
                    originalLanguage: translated == nil ? nil : "fr", translatedContent: translated)
    }

    private static func actions(
        _ comment: FeedComment,
        viewerId: String? = me,
        canImagine: Bool = true,
        editable: Bool = true,
        deletable: Bool = false,
        removable: Bool = false
    ) -> [CommentMenuAction] {
        CommentMenuPolicy.actions(
            for: comment, viewerId: viewerId, servedText: comment.displayContent,
            canImagine: canImagine, editable: editable, deletable: deletable, removable: removable
        )
    }

    // MARK: - Auteur / autres

    func test_actions_forItsAuthor_offerEditAndNeverReport() {
        let mine = Self.comment(authorId: Self.me)
        XCTAssertEqual(Self.actions(mine), [.copy, .imagine, .edit])
        XCTAssertEqual(Self.actions(mine, deletable: true), [.copy, .imagine, .edit, .delete])
    }

    func test_actions_forAnotherReader_offerReportAndNeverEditNorDelete() {
        let theirs = Self.comment(authorId: "u-other")
        XCTAssertEqual(Self.actions(theirs, deletable: true), [.copy, .imagine, .report])
    }

    func test_actions_whenTheHostCannotEdit_theAuthorGetsNoEdit() {
        XCTAssertEqual(Self.actions(Self.comment(authorId: Self.me), editable: false), [.copy, .imagine])
    }

    func test_actions_forAnUnknownReader_offerNeitherEditNorReport() {
        XCTAssertEqual(Self.actions(Self.comment(authorId: ""), viewerId: ""), [.copy, .imagine])
        XCTAssertEqual(Self.actions(Self.comment(authorId: Self.me), viewerId: nil), [.copy, .imagine])
    }

    // MARK: - Retrait par la modération (#11151)

    func test_actions_whenTheHostCanRemove_anotherReadersCommentOffersRemoveAfterReport() {
        let theirs = Self.comment(authorId: "u-other")
        XCTAssertEqual(Self.actions(theirs, removable: true), [.copy, .imagine, .report, .remove])
    }

    func test_actions_removeIsNeverOfferedOnItsOwnComment() {
        let mine = Self.comment(authorId: Self.me)
        XCTAssertFalse(Self.actions(mine, deletable: true, removable: true).contains(.remove))
    }

    func test_actions_removeIsNeverOfferedToAnUnknownReader() {
        XCTAssertFalse(Self.actions(Self.comment(authorId: "u-other"), viewerId: nil, removable: true).contains(.remove))
    }

    func test_actions_withoutTheRemovalRight_noRemove() {
        XCTAssertFalse(Self.actions(Self.comment(authorId: "u-other")).contains(.remove))
    }

    // MARK: - Protections

    func test_actions_aProtectedComment_isNeverCopied() {
        for flag in [MessageEffectFlags.blurred, .viewOnce, .ephemeral] {
            let hidden = Self.comment(flags: flag)
            XCTAssertFalse(Self.actions(hidden, canImagine: false).contains(.copy), "\(flag)")
            XCTAssertTrue(Self.actions(hidden, canImagine: false).contains(.report), "\(flag)")
        }
    }

    func test_actions_aBlankServedText_isNotCopied() {
        XCTAssertEqual(Self.actions(Self.comment(content: "   "), canImagine: false), [.report])
    }

    func test_actions_imagineFollowsTheCardLaw_notTheMenu() {
        XCTAssertFalse(Self.actions(Self.comment(), canImagine: false).contains(.imagine))
    }

    // MARK: - L'arbre de réponses

    func test_imagineReplies_aRootOffersItsLoadedReplies_withoutTheProtectedOnes() {
        let root = Self.comment(id: "root")
        let replies = [
            Self.comment(id: "r1", parentId: "root"),
            Self.comment(id: "r2", parentId: "root", flags: .blurred),
            Self.comment(id: "r3", content: " ", parentId: "root"),
            Self.comment(id: "r4", parentId: "root"),
        ]
        XCTAssertEqual(CommentMenuPolicy.imagineReplies(for: root, loaded: replies).map(\.id), ["r1", "r4"])
    }

    func test_imagineReplies_aReplyOffersNone_andAProtectedRootOffersNone() {
        let reply = Self.comment(id: "r1", parentId: "root")
        XCTAssertTrue(CommentMenuPolicy.imagineReplies(for: reply, loaded: [reply]).isEmpty)
        let hiddenRoot = Self.comment(id: "root", flags: .viewOnce)
        XCTAssertTrue(CommentMenuPolicy.imagineReplies(for: hiddenRoot, loaded: [reply]).isEmpty)
    }

    func test_imagineReplies_areBoundedToTheFirstFive() {
        let root = Self.comment(id: "root")
        let replies = (1...9).map { Self.comment(id: "r\($0)", parentId: "root") }
        XCTAssertEqual(CommentMenuPolicy.imagineReplies(for: root, loaded: replies).map(\.id), ["r1", "r2", "r3", "r4", "r5"])
    }

    func test_imagineRequest_aReplyCarriesItsRoot_asTheQuote() throws {
        let root = Self.comment(id: "root", content: "Bonjour", translated: "Hello")
        let reply = Self.comment(id: "r1", content: "Salut", parentId: "root")
        let request = try XCTUnwrap(MessageCardExportMenu.request(
            comment: reply, showOriginal: false, accentColor: "6366F1",
            viewer: MessageCardSubject.Viewer(id: Self.me, displayName: "Moi"), handle: "moi", quoting: root
        ))
        XCTAssertEqual(request.subject.quoted?.text, "Hello")
        XCTAssertEqual(request.subject.reply.text, "Salut")
    }

    // MARK: - Brouillon d'édition d'un commentaire de story

    func test_editedDraft_aBlankOrUnchangedDraft_isNotSent() {
        XCTAssertNil(StoryCommentEditing.draftToSend("   ", original: "Bonjour"))
        XCTAssertNil(StoryCommentEditing.draftToSend("Bonjour ", original: "Bonjour"))
        XCTAssertEqual(StoryCommentEditing.draftToSend("  Bonsoir ", original: "Bonjour"), "Bonsoir")
    }
}

/// **Retirer un commentaire de story** (#11159) : la modération retire le
/// commentaire d'un autre, avec un motif — la racine emporte ses réponses, une
/// réponse décompte son parent ; optimiste, défait si la passerelle refuse.
@MainActor
final class StoryCommentRemovalTests: XCTestCase {

    private static func comment(id: String, authorId: String = "u-other", parentId: String? = nil, replies: Int = 0) -> FeedComment {
        FeedComment(id: id, author: "Awa", authorId: authorId, content: "Bonjour", replies: replies, parentId: parentId)
    }

    private final class Thread {
        var comments: [FeedComment]
        var replies: [String: [FeedComment]]
        var count: Int
        init(comments: [FeedComment], replies: [String: [FeedComment]], count: Int) {
            self.comments = comments
            self.replies = replies
            self.count = count
        }
    }

    private static func writer(_ thread: Thread, service: MockPostService) -> StoryCommentThreadWriter {
        StoryCommentThreadWriter(
            postId: "story-1",
            comments: Binding(get: { thread.comments }, set: { thread.comments = $0 }),
            replies: Binding(get: { thread.replies }, set: { thread.replies = $0 }),
            count: Binding(get: { thread.count }, set: { thread.count = $0 }),
            service: service
        )
    }

    func test_remove_accepted_sendsTheReason_andKeepsTheCommentOut() async {
        let service = MockPostService()
        let thread = Thread(comments: [Self.comment(id: "a"), Self.comment(id: "b")], replies: [:], count: 2)

        await Self.writer(thread, service: service).remove(Self.comment(id: "a"), reason: "Propos haineux")

        XCTAssertEqual(service.lastDeleteCommentPostId, "story-1")
        XCTAssertEqual(service.lastDeleteCommentCommentId, "a")
        XCTAssertEqual(service.lastDeleteCommentReason, "Propos haineux")
        XCTAssertEqual(thread.comments.map(\.id), ["b"])
        XCTAssertEqual(thread.count, 1)
    }

    func test_remove_refused_restoresTheThreadAndTheCount() async {
        let service = MockPostService()
        service.deleteCommentResult = .failure(APIError.serverError(403, "forbidden"))
        let thread = Thread(comments: [Self.comment(id: "a", replies: 1)], replies: ["a": [Self.comment(id: "r1", parentId: "a")]], count: 2)

        await Self.writer(thread, service: service).remove(Self.comment(id: "a", replies: 1), reason: "Spam répété")

        XCTAssertEqual(thread.comments.map(\.id), ["a"])
        XCTAssertEqual(thread.replies["a"]?.map(\.id), ["r1"])
        XCTAssertEqual(thread.count, 2)
    }

    func test_commentOffer_platformModeratorOnAnothersComment_isOffered_neverOnTheirOwn() {
        let theirs = Self.comment(id: "a", authorId: "u-other")
        for role in ["MODERATOR", "ADMIN", "BIGBOSS"] {
            XCTAssertNotNil(ContentRemovalOffer.comment(theirs, viewerId: "mod", viewerRole: role) { _ in }, role)
        }
        XCTAssertNil(ContentRemovalOffer.comment(theirs, viewerId: "mod", viewerRole: "USER") { _ in })
        XCTAssertNil(ContentRemovalOffer.comment(Self.comment(id: "m", authorId: "mod"), viewerId: "mod", viewerRole: "BIGBOSS") { _ in })
    }
}
