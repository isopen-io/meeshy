import XCTest
import MeeshySDK
@testable import Meeshy

/// F-082 (WS-3) — critères §7 :
/// - « Aucune bulle visible » : garde source — aucun des 4 fichiers
///   `Focal/Row/Focal{AttachmentBlock,AudioBlock,QuotedReplyView,SystemRows}.swift`
///   ne contient `BubbleBackground` ni `cornerRadius: 18`.
/// - `Equatable` des blocs riches — le gate de re-render (même patron que
///   `LentilleRowEquatableTests`/`FocalRowInputEquatableTests`).
@MainActor
final class FocalRichBlockEquatableTests: XCTestCase {

    // MARK: - Garde source « aucune bulle »

    private static let ws3Files = [
        "FocalAttachmentBlock.swift",
        "FocalAudioBlock.swift",
        "FocalQuotedReplyView.swift",
        "FocalSystemRows.swift"
    ]

    private func source(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_ws3Files_neverReferenceBubbleBackground() throws {
        for fileName in Self.ws3Files {
            let stripped = AppSourceGuard.stripComments(try source(fileName))
            XCTAssertFalse(
                stripped.contains("BubbleBackground"),
                "\(fileName) ne doit référencer aucun fond de bulle (contrat §WS-3 : « aucune bulle visible »)"
            )
        }
    }

    func test_ws3Files_neverHardcodeBubbleCornerRadius18() throws {
        for fileName in Self.ws3Files {
            let stripped = AppSourceGuard.stripComments(try source(fileName))
            XCTAssertFalse(
                stripped.contains("cornerRadius: 18"),
                "\(fileName) ne doit jamais reproduire le radius 18 de la bulle chat historique"
            )
        }
    }

    // MARK: - Fabrique minimale

    private func makeContent(
        attachments: BubbleContent.Attachments = .none,
        isMe: Bool = false
    ) -> BubbleContent {
        BubbleContent(
            messageId: "m1", kind: .standard, text: nil, translation: nil, reply: nil,
            attachments: attachments, location: nil, ephemeral: nil, isBlurred: false,
            isViewOnce: false, isPinned: false, forwardAttribution: nil, editedAt: nil,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: isMe, senderName: "Ali", callNotice: nil, joinNotice: nil
        )
    }

    private func imageAttachment(id: String, thumbnailUrl: String = "https://x/a.jpg") -> MeeshyMessageAttachment {
        var att = MeeshyMessageAttachment(id: id, fileName: "a", originalName: "a", mimeType: "image/jpeg", fileSize: 1)
        att.thumbnailUrl = thumbnailUrl
        return att
    }

    // MARK: - FocalAttachmentBlock

    func test_focalAttachmentBlock_equatable_sameInputs_isEqual() {
        let items = [imageAttachment(id: "a1")]
        let lhs = FocalAttachmentBlock(items: items, accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        let rhs = FocalAttachmentBlock(items: items, accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        XCTAssertEqual(lhs, rhs)
    }

    func test_focalAttachmentBlock_equatable_differentThumbnail_isNotEqual() {
        let lhs = FocalAttachmentBlock(items: [imageAttachment(id: "a1", thumbnailUrl: "https://x/1.jpg")], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        let rhs = FocalAttachmentBlock(items: [imageAttachment(id: "a1", thumbnailUrl: "https://x/2.jpg")], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        XCTAssertNotEqual(lhs, rhs)
    }

    func test_focalAttachmentBlock_equatable_ignoresClosureIdentity() {
        let items = [imageAttachment(id: "a1")]
        let lhs = FocalAttachmentBlock(items: items, accentHex: "#31B6BA", messageDeliveryStatus: .sent, onMediaTap: { _ in })
        let rhs = FocalAttachmentBlock(items: items, accentHex: "#31B6BA", messageDeliveryStatus: .sent, onMediaTap: { _ in })
        XCTAssertEqual(lhs, rhs, "les callbacks n'entrent jamais dans l'égalité — patron BubbleFooterActions")
    }

    // MARK: - FocalAudioBlock

    func test_focalAudioBlock_equatable_sameContent_isEqual() {
        let content = makeContent(attachments: .audio([MeeshyMessageAttachment(id: "au1", fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1)]))
        let lhs = FocalAudioBlock(content: content, accentHex: "#31B6BA", isDark: false, allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv")
        let rhs = FocalAudioBlock(content: content, accentHex: "#31B6BA", isDark: false, allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv")
        XCTAssertEqual(lhs, rhs)
    }

    func test_focalAudioBlock_equatable_differentDark_isNotEqual() {
        let content = makeContent(attachments: .audio([MeeshyMessageAttachment(id: "au1", fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1)]))
        let lhs = FocalAudioBlock(content: content, accentHex: "#31B6BA", isDark: false, allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv")
        let rhs = FocalAudioBlock(content: content, accentHex: "#31B6BA", isDark: true, allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv")
        XCTAssertNotEqual(lhs, rhs)
    }

    // MARK: - FocalQuotedReplyView

    func test_focalQuotedReplyView_equatable_sameReply_isEqual() {
        let reply = BubbleContent.Reply(
            reference: ReplyReference(messageId: "q1", authorName: "Bo", previewText: "hi", isMe: false, authorColor: "#31B6BA"),
            isStory: false
        )
        let lhs = FocalQuotedReplyView(reply: reply, accentHex: "#31B6BA", isDark: false, mentionDisplayNames: [:])
        let rhs = FocalQuotedReplyView(reply: reply, accentHex: "#31B6BA", isDark: false, mentionDisplayNames: [:])
        XCTAssertEqual(lhs, rhs)
    }

    // MARK: - FocalSystemRows (leaf views)

    func test_focalDeletedRow_equatable() {
        XCTAssertEqual(FocalDeletedRow(isDark: false), FocalDeletedRow(isDark: false))
        XCTAssertNotEqual(FocalDeletedRow(isDark: false), FocalDeletedRow(isDark: true))
    }

    func test_focalSystemNoticeRow_equatable() {
        XCTAssertEqual(
            FocalSystemNoticeRow(text: "Appel vidéo · 04:32", isDark: false),
            FocalSystemNoticeRow(text: "Appel vidéo · 04:32", isDark: false)
        )
        XCTAssertNotEqual(
            FocalSystemNoticeRow(text: "a", isDark: false),
            FocalSystemNoticeRow(text: "b", isDark: false)
        )
    }

    // MARK: - F-083bis — citation : filet au token, jamais le chrome verbatim

    /// « Filet == FocalMetrics.Quote.rule » (mandat F-083bis) : le fichier
    /// pose son filet via la cote partagée, jamais un littéral concurrent —
    /// en particulier PAS l'ancien filet `4`pt de `BubbleQuotedReply`
    /// (`RoundedRectangle(cornerRadius: 2).frame(width: 4)`, chrome
    /// abandonné par cet arbitrage).
    func test_focalQuotedReplyView_railWidth_comesFromFocalMetricsQuote_neverALiteral() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalQuotedReplyView.swift"))
        XCTAssertTrue(
            stripped.contains("FocalMetrics.Quote.railWidth"),
            "FocalQuotedReplyView.swift doit poser son filet via FocalMetrics.Quote.railWidth"
        )
        XCTAssertFalse(stripped.contains("frame(width: 4)"), "l'ancien filet 4pt de BubbleQuotedReply ne doit plus apparaître")
        XCTAssertFalse(stripped.contains("BubbleQuotedReply("), "FocalQuotedReplyView ne doit plus INSTANCIER BubbleQuotedReply (chrome natif désormais)")
    }

    func test_focalMetricsQuote_railWidth_is2_5() {
        XCTAssertEqual(FocalMetrics.Quote.railWidth, 2.5, "miroir de thread.quote.borderSize, présence vérifiée dans lentille-tokens.json avant F-083bis")
    }

    // MARK: - F-083bis — grille : flou/vue unique jamais l'image nette

    /// « La grille floutée ne rend pas l'image nette » : `mediaLayer` n'est
    /// jamais rendu SANS être gardé par `protectionState == .none` dans
    /// `FocalAttachmentBlock.swift` (`FocalGridCell.body`). Garde
    /// STRUCTURELLE (compte d'occurrences du gate) — la décision elle-même
    /// est prouvée exhaustivement par `FocalMediaProtectionTests` (pure,
    /// sans rendu).
    func test_focalGridCell_mediaLayer_isGuardedByProtectionState() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalAttachmentBlock.swift"))
        XCTAssertTrue(
            stripped.contains("if case .none = protectionState {\n                mediaLayer\n            }") ||
            stripped.contains("case .none = protectionState") && stripped.contains("mediaLayer"),
            "mediaLayer doit être gardé par protectionState == .none"
        )
        // Au moins 2 gates réels : le rendu du média ET le tap (ouverture
        // plein écran interdite tant que le média est protégé).
        let gateOccurrences = stripped.components(separatedBy: "protectionState").count - 1
        XCTAssertGreaterThanOrEqual(gateOccurrences, 3, "protectionState doit gater le rendu ET le tap ET l'overlay de recouvrement")
    }

    func test_focalGridCell_neverInstantiatesThePrivateBubbleGridCellFamily() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalAttachmentBlock.swift"))
        XCTAssertFalse(stripped.contains("BubbleGridCell("))
        XCTAssertFalse(stripped.contains("AttachmentBlurOverlayView("), "réimplémentation native attendue, pas un accès élargi au type fileprivate")
    }

    func test_focalAttachmentBlock_equatable_blurredVsNot_isNotEqual() {
        var blurred = imageAttachment(id: "a1")
        blurred.isBlurred = true
        let plain = imageAttachment(id: "a1")
        let lhs = FocalAttachmentBlock(items: [blurred], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        let rhs = FocalAttachmentBlock(items: [plain], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        XCTAssertNotEqual(lhs, rhs)
    }

    func test_focalAttachmentBlock_equatable_viewOnceCountChange_isNotEqual() {
        var a = imageAttachment(id: "a1")
        a.isViewOnce = true
        a.viewOnceCount = 1
        var b = imageAttachment(id: "a1")
        b.isViewOnce = true
        b.viewOnceCount = 2
        let lhs = FocalAttachmentBlock(items: [a], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        let rhs = FocalAttachmentBlock(items: [b], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        XCTAssertNotEqual(lhs, rhs)
    }
}
