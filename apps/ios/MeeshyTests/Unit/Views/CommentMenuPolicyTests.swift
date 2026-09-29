import XCTest
import MeeshySDK
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
        deletable: Bool = false
    ) -> [CommentMenuAction] {
        CommentMenuPolicy.actions(
            for: comment, viewerId: viewerId, servedText: comment.displayContent,
            canImagine: canImagine, editable: editable, deletable: deletable
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

    // MARK: - Édition en place d'un commentaire de story

    func test_replacingEdited_aRoot_isReplacedInPlace() {
        let a = Self.comment(id: "a"), b = Self.comment(id: "b")
        let edited = b.withEditedContent("Nouveau", effectFlags: 0)
        let result = StoryCommentEditing.replacing(edited, comments: [a, b], replies: [:])
        XCTAssertEqual(result.comments.map(\.content), ["Bonjour", "Nouveau"])
        XCTAssertTrue(result.replies.isEmpty)
    }

    func test_replacingEdited_aReply_isReplacedInItsThread_only() {
        let root = Self.comment(id: "root")
        let r1 = Self.comment(id: "r1", parentId: "root"), r2 = Self.comment(id: "r2", parentId: "root")
        let edited = r2.withEditedContent("Corrigé", effectFlags: 0)
        let result = StoryCommentEditing.replacing(edited, comments: [root], replies: ["root": [r1, r2]])
        XCTAssertEqual(result.comments.map(\.content), ["Bonjour"])
        XCTAssertEqual(result.replies["root"]?.map(\.content), ["Bonjour", "Corrigé"])
    }

    func test_replacingEdited_anUnknownComment_changesNothing() {
        let a = Self.comment(id: "a")
        let ghost = Self.comment(id: "ghost").withEditedContent("X", effectFlags: 0)
        let result = StoryCommentEditing.replacing(ghost, comments: [a], replies: ["a": [Self.comment(id: "r1", parentId: "a")]])
        XCTAssertEqual(result.comments.map(\.id), ["a"])
        XCTAssertEqual(result.replies["a"]?.map(\.content), ["Bonjour"])
    }

    func test_editedDraft_aBlankOrUnchangedDraft_isNotSent() {
        XCTAssertNil(StoryCommentEditing.draftToSend("   ", original: "Bonjour"))
        XCTAssertNil(StoryCommentEditing.draftToSend("Bonjour ", original: "Bonjour"))
        XCTAssertEqual(StoryCommentEditing.draftToSend("  Bonsoir ", original: "Bonjour"), "Bonsoir")
    }
}
