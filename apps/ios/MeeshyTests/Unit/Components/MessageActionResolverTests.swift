import XCTest
@testable import Meeshy

@MainActor
final class MessageActionResolverTests: XCTestCase {
    private func ctx(
        isMine: Bool = false, canEdit: Bool = false, canDelete: Bool = false,
        hasText: Bool = true, hasMedia: Bool = false, hasTimebasedMedia: Bool = false,
        isPinned: Bool = false, isStarred: Bool = false,
        isEdited: Bool = false, hasEditRevisions: Bool = false
    ) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: canEdit, canDelete: canDelete,
            hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: hasTimebasedMedia,
            isPinned: isPinned, isStarred: isStarred, isEdited: isEdited,
            hasEditRevisions: hasEditRevisions)
    }

    func test_primaryActions_receivedTextBasic_isTranslateCopyPinStarMore() {
        let a = MessageActionResolver.primaryActions(ctx())
        XCTAssertEqual(a, [.translate, .copy, .pin, .star, .more])
    }

    func test_primaryActions_ownEditableText_includesEditAndDelete() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, canDelete: true))
        XCTAssertEqual(a, [.edit, .translate, .copy, .pin, .star, .more, .delete])
    }

    func test_primaryActions_pinnedStarred_showsUnpinUnstar() {
        let a = MessageActionResolver.primaryActions(ctx(isPinned: true, isStarred: true))
        XCTAssertTrue(a.contains(.unpin))
        XCTAssertTrue(a.contains(.unstar))
        XCTAssertFalse(a.contains(.pin))
        XCTAssertFalse(a.contains(.star))
    }

    func test_primaryActions_noText_dropsCopyAndEdit() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, hasText: false, hasMedia: true))
        XCTAssertFalse(a.contains(.copy))
        XCTAssertFalse(a.contains(.edit))
    }

    func test_moreSections_alwaysHasReplyForwardThread() {
        let sections = MessageActionResolver.moreSections(ctx())
        guard case .actions(let items)? = sections.first(where: { if case .actions = $0 { return true }; return false }) else {
            return XCTFail("actions section missing")
        }
        XCTAssertEqual(items, [.reply, .forward, .thread])
    }

    func test_moreSections_timebasedMedia_showsTranscriptionNotSentiment() {
        let sections = MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true, hasTimebasedMedia: true))
        let info = infoItems(sections)
        XCTAssertTrue(info.contains(.transcription))
        XCTAssertFalse(info.contains(.sentiment))
    }

    func test_moreSections_editedWithRevisions_showsHistory() {
        let sections = MessageActionResolver.moreSections(ctx(isEdited: true, hasEditRevisions: true))
        XCTAssertTrue(infoItems(sections).contains(.history))
    }

    func test_moreSections_alwaysHasReportInModeration() {
        let sections = MessageActionResolver.moreSections(ctx())
        guard case .moderation(let items)? = sections.first(where: { if case .moderation = $0 { return true }; return false }) else {
            return XCTFail("moderation section missing")
        }
        XCTAssertEqual(items, [.report])
    }

    func test_moreSections_neverContainsLanguage() {
        for section in MessageActionResolver.moreSections(ctx(isMine: true, canEdit: true, canDelete: true,
            hasMedia: true, hasTimebasedMedia: true, isEdited: true, hasEditRevisions: true)) {
            let items: [MoreItem]
            switch section { case .actions(let i), .info(let i), .moderation(let i): items = i }
            XCTAssertFalse(items.contains(.language))
        }
    }

    private func infoItems(_ sections: [MoreSection]) -> [MoreItem] {
        for s in sections { if case .info(let items) = s { return items } }
        return []
    }
}
