import XCTest
@testable import Meeshy

@MainActor
final class MessageActionResolverTests: XCTestCase {
    private func ctx(
        isMine: Bool = false, canEdit: Bool = false, canDelete: Bool = false,
        hasText: Bool = true, hasMedia: Bool = false, hasTimebasedMedia: Bool = false,
        isPinned: Bool = false, isStarred: Bool = false,
        isEdited: Bool = false, hasEditRevisions: Bool = false,
        saveableAttachmentCount: Int = 0
    ) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: canEdit, canDelete: canDelete,
            hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: hasTimebasedMedia,
            isPinned: isPinned, isStarred: isStarred, isEdited: isEdited,
            hasEditRevisions: hasEditRevisions,
            saveableAttachmentCount: saveableAttachmentCount)
    }

    // MARK: - primaryActions : liste COMPACTE de l'overlay (≤ actions clés + .more)

    func test_primaryActions_receivedText_isTranslateCopyMore() {
        let a = MessageActionResolver.primaryActions(ctx())
        XCTAssertEqual(a, [.translate, .copy, .more])
    }

    func test_primaryActions_ownEditableText_isEditTranslateCopyMore() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, canDelete: true))
        XCTAssertEqual(a, [.edit, .translate, .copy, .more])
    }

    func test_primaryActions_neverContainsDelete_evenWhenDeletable() {
        let a = MessageActionResolver.primaryActions(ctx(isMine: true, canEdit: true, canDelete: true))
        XCTAssertFalse(a.contains(.delete), "Supprimer vit dans « Plus… », jamais dans le menu compact")
    }

    func test_primaryActions_neverContainsPinStar_movedToMore() {
        let unpinned = MessageActionResolver.primaryActions(ctx())
        XCTAssertFalse(unpinned.contains(.pin))
        XCTAssertFalse(unpinned.contains(.star))
        let pinnedStarred = MessageActionResolver.primaryActions(ctx(isPinned: true, isStarred: true))
        XCTAssertFalse(pinnedStarred.contains(.unpin))
        XCTAssertFalse(pinnedStarred.contains(.unstar))
    }

    func test_primaryActions_alwaysEndsWithMore() {
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx()).last, .more)
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1)).last, .more)
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 5)).last, .more)
    }

    func test_primaryActions_singleMediaNoText_isSaveMediaMore() {
        let a = MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1))
        XCTAssertEqual(a, [.saveMedia, .more])
    }

    func test_primaryActions_multiMediaNoText_dropsSaveMedia_fallsBackToPin() {
        let a = MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 3))
        XCTAssertFalse(a.contains(.saveMedia), "multi-attachment passe par la galerie, pas le menu")
        XCTAssertEqual(a, [.pin, .more], "aucune action clé → repli pin pour ne pas afficher un menu vide")
    }

    func test_primaryActions_imageOnly_dropsTranslate() {
        let a = MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, saveableAttachmentCount: 1))
        XCTAssertFalse(a.contains(.translate), "Traduire n'a pas de sens sur un média sans texte")
    }

    func test_primaryActions_isNeverEmptyBesidesMore() {
        // Contexte dégénéré : ni texte, ni média enregistrable, ni rien
        let a = MessageActionResolver.primaryActions(ctx(hasText: false))
        XCTAssertGreaterThanOrEqual(a.count, 2)
        XCTAssertEqual(a.last, .more)
    }

    // MARK: - moreSections : SSOT « Plus… » (accueille pin/star/delete sortis du primaire)

    func test_moreSections_actionsIncludePinAndStar() {
        let items = actionItems(MessageActionResolver.moreSections(ctx()))
        XCTAssertTrue(items.contains(.pin))
        XCTAssertTrue(items.contains(.star))
    }

    func test_moreSections_pinnedStarred_showUnpinUnstar() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isPinned: true, isStarred: true)))
        XCTAssertTrue(items.contains(.unpin))
        XCTAssertTrue(items.contains(.unstar))
        XCTAssertFalse(items.contains(.pin))
        XCTAssertFalse(items.contains(.star))
    }

    func test_moreSections_canDelete_includesMessageDelete() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: true, canDelete: true)))
        XCTAssertTrue(items.contains(.delete), "la suppression du message est routée vers « Plus… »")
    }

    func test_moreSections_cannotDelete_omitsMessageDelete() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(canDelete: false)))
        XCTAssertFalse(items.contains(.delete))
    }

    func test_moreSections_startsWithReplyForwardThread() {
        let items = actionItems(MessageActionResolver.moreSections(ctx()))
        XCTAssertEqual(Array(items.prefix(3)), [.reply, .forward, .thread])
    }

    func test_moreSections_deleteMediaBeforeMessageDelete_whenBothPresent() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: true, canDelete: true, hasMedia: true)))
        guard let mediaIdx = items.firstIndex(of: .deleteMedia), let msgIdx = items.firstIndex(of: .delete) else {
            return XCTFail("deleteMedia et delete attendus")
        }
        XCTAssertLessThan(mediaIdx, msgIdx)
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

    // « Plus… » enrichi (req 2026-07-24) : éditer / copier / partager / traduire /
    // transcription y sont désormais disponibles (menu complet).

    func test_moreSections_actionsIncludeShare() {
        let items = actionItems(MessageActionResolver.moreSections(ctx()))
        XCTAssertTrue(items.contains(.share), "« Partager » disponible dans « Plus… »")
    }

    func test_moreSections_ownEditableText_actionsIncludeEditAndCopy() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: true, canEdit: true)))
        XCTAssertTrue(items.contains(.edit))
        XCTAssertTrue(items.contains(.copy))
    }

    func test_moreSections_receivedText_actionsOmitEdit_keepCopy() {
        let items = actionItems(MessageActionResolver.moreSections(ctx(isMine: false)))
        XCTAssertFalse(items.contains(.edit), "pas d'édition d'un message reçu")
        XCTAssertTrue(items.contains(.copy))
    }

    func test_moreSections_text_infoIncludesLanguageAndReactions() {
        let items = infoItems(MessageActionResolver.moreSections(ctx()))
        XCTAssertTrue(items.contains(.language), "Traduire (langue) explorable dans « Plus… »")
        XCTAssertTrue(items.contains(.reactions), "Réactions explorables (voir + ajouter) dans « Plus… »")
    }

    func test_moreSections_mediaNoText_infoOmitsLanguageAndSentiment() {
        let items = infoItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true)))
        XCTAssertFalse(items.contains(.language), "pas de traduction sans texte ni piste temporelle")
        XCTAssertFalse(items.contains(.sentiment))
    }

    func test_moreSections_timebasedMedia_infoIncludesLanguage() {
        let items = infoItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true, hasTimebasedMedia: true)))
        XCTAssertTrue(items.contains(.language), "audio/vidéo → traduction (langue) disponible")
    }

    // MARK: - Helpers

    private func actionItems(_ sections: [MoreSection]) -> [MoreItem] {
        for s in sections { if case .actions(let items) = s { return items } }
        return []
    }

    private func infoItems(_ sections: [MoreSection]) -> [MoreItem] {
        for s in sections { if case .info(let items) = s { return items } }
        return []
    }
}
