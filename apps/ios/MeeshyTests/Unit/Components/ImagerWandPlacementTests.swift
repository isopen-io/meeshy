import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La baguette « Imager » d'accès direct** (#16163) et **l'atelier unique**
/// (#16393). Carte de post et détail : dernière action de la rangée. Rangée
/// d'un commentaire : juste avant le « ⋯ ». La bulle de message n'en porte pas,
/// son appui long offre déjà « Imager » et « Export rapide ». La baguette suit la
/// MÊME loi que l'entrée « Imager » du menu du même élément.
@MainActor
final class ImagerWandPlacementTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    private static func comment(id: String = "c1", content: String = "Bonjour",
                                flags: MessageEffectFlags = []) -> FeedComment {
        FeedComment(id: id, author: "Awa", authorId: "u-awa", content: content, effectFlags: Int(flags.rawValue))
    }

    // MARK: - La loi du commentaire est celle du menu

    func test_commentTarget_plainComment_offersTheWand() {
        let target = CommentImagerTarget(comment: Self.comment(), showOriginal: false, accentColor: "6366F1")

        XCTAssertTrue(target.canImagine)
        XCTAssertEqual(target.ownRequest?.subject.reply.text, "Bonjour")
    }

    func test_commentTarget_ephemeralComment_offersNothing() {
        let target = CommentImagerTarget(comment: Self.comment(flags: .ephemeral), showOriginal: false, accentColor: "6366F1")

        XCTAssertFalse(target.canImagine)
        XCTAssertNil(target.ownRequest)
    }

    func test_commentTarget_viewOnceComment_offersNothing() {
        let target = CommentImagerTarget(comment: Self.comment(flags: .viewOnce), showOriginal: false, accentColor: "6366F1")

        XCTAssertFalse(target.canImagine)
    }

    func test_commentTarget_emptyComment_offersNothing() {
        let target = CommentImagerTarget(comment: Self.comment(content: "  "), showOriginal: false, accentColor: "6366F1")

        XCTAssertFalse(target.canImagine)
    }

    func test_commentMenuAndRow_readTheSameTarget() throws {
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/CommentMoreMenu.swift").contains("canImagine: imagerTarget.canImagine"))
        let row = try source("Meeshy/Features/Main/Views/CommentRowView.swift")
        XCTAssertTrue(row.contains("CommentImagerButton("))
        XCTAssertTrue(row.contains("CommentImagerTarget(comment: comment"))
    }

    // MARK: - Où la baguette se pose

    func test_wand_isTheRailGlyph_withTheMenuWord() throws {
        let wand = try source("Meeshy/Features/Export/ImagerWandButton.swift")
        XCTAssertTrue(wand.contains("Image(systemName: FullscreenChromeSymbol.imager)"))
        XCTAssertTrue(wand.contains(".accessibilityLabel(MessageCardExportMenu.imageLabel)"))
        XCTAssertTrue(wand.contains(".frame(minWidth: 44, minHeight: 44)"))
        XCTAssertTrue(wand.contains("MessageCardExportMenu.quickLabel"), "l'appui long offre « Export rapide »")
    }

    func test_feedPostRow_endsWithTheWand_afterSend() throws {
        let bar = try source("Meeshy/Features/Main/Views/FeedPostActionsBar.swift")
        let send = try XCTUnwrap(bar.range(of: "\"a11y.feed.post.send.hint\""))
        let wand = try XCTUnwrap(bar.range(of: "imagerButton", range: send.upperBound..<bar.endIndex))
        XCTAssertLessThan(send.lowerBound, wand.lowerBound)
        XCTAssertTrue(bar.contains("if let onImager"), "rien à imager ⇒ pas de baguette")
        let card = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(card.contains("onImager: imagerAction"), "la baguette et le menu ⋯ lisent la même action")
    }

    func test_postDetailRow_endsWithTheWand_underTheSameLaw() throws {
        let detail = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(detail.contains("detailImagerButton"))
        XCTAssertTrue(detail.contains("if let post = displayPost, let action = PostSaveAction.imagerAction(for: post, coordinator: mediaSaveCoordinator)"))
    }

    func test_commentRow_putsTheWandJustBeforeTheMoreMenu() throws {
        let row = try source("Meeshy/Features/Main/Views/CommentRowView.swift")
        let wand = try XCTUnwrap(row.range(of: "imagerButton\n"))
        let more = try XCTUnwrap(row.range(of: "moreMenu", range: wand.upperBound..<row.endIndex))
        XCTAssertLessThan(wand.lowerBound, more.lowerBound)
    }

    func test_messageBubble_carriesNoWand_itsLongPressAlreadyImages() throws {
        let resolver = try source("Meeshy/Features/Main/Components/MessageActionResolver.swift")
        XCTAssertTrue(resolver.contains("out.append(.exportImage)"))
        XCTAssertTrue(resolver.contains("if ctx.hasDefaultExportFormat { out.append(.exportQuick) }"))
        let bubbles = try FileManager.default.contentsOfDirectory(
            at: MyStoriesSourceCorpus.appRoot().appendingPathComponent("Meeshy/Features/Main/Views/Bubble"),
            includingPropertiesForKeys: nil)
        let wands = try bubbles.filter { $0.pathExtension == "swift" }.filter {
            try AppSourceGuard.text(at: $0).contains("ImagerWandButton")
        }
        XCTAssertEqual(wands, [], "aucune baguette posée sur chaque bulle")
    }

    // MARK: - L'atelier unique : la scène rendue, les choix de contenu au rail

    func test_lead_renderedFile_kindFollowsTheFile() {
        let lead = MessageCardLead(id: "scene:p") { nil }

        XCTAssertEqual(lead.media(rendered: URL(fileURLWithPath: "/tmp/a.mp4")).media.kind, .video)
        XCTAssertEqual(lead.media(rendered: URL(fileURLWithPath: "/tmp/a.jpg")).media.kind, .image)
        XCTAssertEqual(lead.placeholder.media.id, "scene:p")
    }

    func test_subject_replacingTheLead_keepsItsAuthorAndHero() {
        let lead = MessageCardLead(id: "scene:p") { nil }
        let signed = lead.placeholder.by(MessageCardMediaAuthor(name: "Awa"))
        let subject = MessageCardSubject(quoted: nil, reply: MessageCardPart(author: "Awa", text: ""), sentAt: Date(),
                                         media: [signed], heroID: "scene:p")

        let rendered = subject.replacing(lead: lead.media(rendered: URL(fileURLWithPath: "/tmp/a.jpg")))

        XCTAssertEqual(rendered.media.first?.fileURL, URL(fileURLWithPath: "/tmp/a.jpg").absoluteString)
        XCTAssertEqual(rendered.media.first?.author?.name, "Awa")
        XCTAssertEqual(rendered.heroID, "scene:p")
    }

    func test_loader_readsALocalRenderedFile_asIs() {
        XCTAssertEqual(MessageCardMediaLoader.localURL("file:///tmp/a.mp4")?.path, "/tmp/a.mp4")
        XCTAssertNil(MessageCardMediaLoader.localURL("https://staging.meeshy.me/a.mp4"))
    }

    func test_contentTab_comesFirst_onlyWhenThereIsAChoice() {
        let offered = MessageCardExportTab.offered(hasMedia: true, languageCount: 1, offersContent: true)
        XCTAssertEqual(offered.first, .content)
        XCTAssertFalse(MessageCardExportTab.offered(hasMedia: true, languageCount: 1).contains(.content))
    }

    func test_contentChoices_liveInTheTray_neverAboveThePreview() throws {
        let sheet = try source("Meeshy/Features/Export/MessageCardExportSheet.swift")
        XCTAssertFalse(sheet.contains("compositionBar"), "plus aucun contrôle isolé au-dessus de l'aperçu")
        XCTAssertTrue(sheet.contains("contentPanel: contentPanel"))
        let tray = try source("Meeshy/Features/Export/MessageCardExportTray.swift")
        XCTAssertTrue(tray.contains("case .content:"))
    }
}
