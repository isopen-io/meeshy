import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// #7599 — le fil dit chaque état UNE fois, à UN endroit.
///
/// Trois répétitions relevées dans l'inventaire du 2026-09-23 :
/// 1. un envoi ÉCHOUÉ se disait deux fois — coche rouge `!` dans le pied ET
///    bande de renvoi à côté (bulle et rangée plate) ;
/// 2. la traduction se disait deux fois dans le pied d'une bulle — l'icône 🌐
///    ET les drapeaux qui la montrent déjà ;
/// 3. un texte à VUE UNIQUE restait lisible en peau bulle (le flou ne lisait
///    que `isBlurred`), et ses drapeaux de langue paraissaient en clair en
///    rangée plate.
@MainActor
final class MessageStateSaidOnceTests: XCTestCase {

    private func makeFooter(
        deliveryStatus: MeeshyMessage.DeliveryStatus = .sent,
        flags: [FooterFlag] = [],
        showsTranslate: Bool = false,
        retryBandShown: Bool = false
    ) -> BubbleFooterModel {
        BubbleFooterModel.make(
            timeString: "09:41",
            deliveryStatus: deliveryStatus,
            isMe: true,
            isOnline: true,
            sender: nil,
            flags: flags,
            showsTranslate: showsTranslate,
            retryBandShown: retryBandShown
        )
    }

    // MARK: - Échec d'envoi : la bande le dit, la coche se tait

    func test_failed_withRetryBand_footerDropsItsFailureGlyph() {
        XCTAssertNil(makeFooter(deliveryStatus: .failed, retryBandShown: true).delivery)
    }

    /// Sans bande (émoji, média), la coche reste le seul endroit qui le dit.
    func test_failed_withoutRetryBand_footerKeepsItsFailureGlyph() {
        XCTAssertEqual(makeFooter(deliveryStatus: .failed).delivery, .failed)
    }

    func test_retryBand_neverHidesAnyOtherDeliveryState() {
        for status: MeeshyMessage.DeliveryStatus in [.sending, .sent, .delivered, .read] {
            XCTAssertEqual(makeFooter(deliveryStatus: status, retryBandShown: true).delivery, status)
        }
    }

    func test_glyphStatus_isTheOneRule_sharedByTheFlatRow() {
        XCTAssertNil(BubbleFooterModel.glyphStatus(.failed, retryBandShown: true))
        XCTAssertEqual(BubbleFooterModel.glyphStatus(.failed, retryBandShown: false), .failed)
        XCTAssertEqual(BubbleFooterModel.glyphStatus(.read, retryBandShown: true), .read)
        XCTAssertNil(BubbleFooterModel.glyphStatus(nil, retryBandShown: false))
    }

    // MARK: - Traduction : les drapeaux la disent, l'icône se tait

    func test_translate_withFlagsShown_iconIsNotRepeated() {
        let footer = makeFooter(flags: [FooterFlag(code: "en", isActive: false)], showsTranslate: true)
        XCTAssertFalse(footer.showsTranslate)
        XCTAssertEqual(footer.flags.count, 1)
    }

    /// Sans traduction disponible, l'icône est la seule porte vers la demande.
    func test_translate_withoutFlags_iconStays() {
        XCTAssertTrue(makeFooter(flags: [], showsTranslate: true).showsTranslate)
    }

    // MARK: - Vue unique : voilée en bulle, sans drapeau en rangée plate

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Bubble
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main")
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    func test_bubbleBlur_isGatedOnTheVeil_notOnTheBlurFlagAlone() throws {
        let src = try source("Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertTrue(src.contains("BlurRevealModifier(isBlurrable: content.requiresVeil"))
        XCTAssertFalse(src.contains("BlurRevealModifier(isBlurrable: content.isBlurred"))
    }

    func test_flatRowFlags_hideOnEveryVeiledMessage() throws {
        let src = try source("Focal/Row/FocalRow.swift")
        XCTAssertFalse(src.contains("!content.isBlurred"))
        XCTAssertFalse(src.contains("isBlurred: content.isBlurred,"))
    }

    func test_flatRowMeta_usesTheSharedFailureRule() throws {
        let src = try source("Focal/Row/FocalRow.swift")
        XCTAssertTrue(src.contains("BubbleFooterModel.glyphStatus(content.meta.deliveryStatus, retryBandShown: isFailedOutgoing)"))
    }

    // MARK: - #7620 — le pied de bulle en Bulles, jusqu'au pixel

    private func footerWidth(
        _ model: BubbleFooterModel,
        actions: BubbleFooterActions,
        style: BubbleFooterStyle = .row
    ) -> CGFloat {
        let footer = BubbleFooter(model: model, actions: actions, style: style, isDark: false)
        let host = UIHostingController(rootView: footer.fixedSize())
        return host.sizeThatFits(in: CGSize(width: 1000, height: 1000)).width
    }

    private func receivedFooter(
        flags: [FooterFlag] = [],
        showsTranslate: Bool = true,
        edit: BubbleEditMark? = nil
    ) -> BubbleFooterModel {
        BubbleFooterModel.make(
            timeString: "16:44",
            deliveryStatus: .sent,
            isMe: false,
            isOnline: true,
            sender: nil,
            flags: flags,
            showsTranslate: showsTranslate,
            edit: edit
        )
    }

    private var translateAction: BubbleFooterActions { BubbleFooterActions(onTranslate: {}) }

    /// La recette du 2026-09-23 voyait l'icône de traduction ET 🇬🇧 : le
    /// modèle taisait l'icône, la VUE la rendait dès que le rappel existait.
    func test_rowFooter_withFlagAndTranslateCallback_rendersNoTranslateGlyph() {
        let flags = [FooterFlag(code: "en", isActive: false)]
        let withCallback = footerWidth(receivedFooter(flags: flags), actions: translateAction)
        let withoutCallback = footerWidth(receivedFooter(flags: flags), actions: .none)
        XCTAssertEqual(withCallback, withoutCallback, accuracy: 0.5)
    }

    func test_rowFooter_withoutFlag_rendersTranslateGlyph() {
        let withCallback = footerWidth(receivedFooter(), actions: translateAction)
        let withoutCallback = footerWidth(receivedFooter(), actions: .none)
        XCTAssertGreaterThan(withCallback, withoutCallback)
    }

    /// Le widget audio plie ses drapeaux APRÈS `make` : la règle tient sur le
    /// modèle final, pas seulement dans le constructeur.
    func test_showsTranslateGlyph_flagsFoldedAfterMake_isFalse() {
        var model = receivedFooter(showsTranslate: true)
        model.flags = [FooterFlag(code: "en", isActive: true)]
        model.showsTranslate = true
        XCTAssertFalse(model.showsTranslateGlyph)
    }

    func test_offersTranslation_contentWithoutText_isFalse() {
        XCTAssertFalse(BubbleFooterModel.offersTranslation(hasText: false, isEmojiOnly: false, hasAudio: false))
        XCTAssertFalse(BubbleFooterModel.offersTranslation(hasText: true, isEmojiOnly: true, hasAudio: false))
    }

    func test_offersTranslation_textOrAudio_isTrue() {
        XCTAssertTrue(BubbleFooterModel.offersTranslation(hasText: true, isEmojiOnly: false, hasAudio: false))
        XCTAssertTrue(BubbleFooterModel.offersTranslation(hasText: false, isEmojiOnly: false, hasAudio: true))
    }

    /// Une POSITION n'a pas de texte : ni icône, ni drapeau. Le prédicat
    /// d'avant (`hasTextOrNonMediaContent`) comptait le lieu comme du texte.
    func test_resolvedFooter_positionBubble_readsTheTextRule() throws {
        let src = try source("Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertTrue(src.contains("BubbleFooterModel.offersTranslation("))
        XCTAssertFalse(src.contains("&& (hasTextOrNonMediaContent || !audioAttachments.isEmpty)"))
    }

    func test_editMarkResolve_editedAtOrSaving_returnsTheMark() {
        XCTAssertNil(BubbleEditMark.resolve(editedAt: nil, isSaving: false))
        XCTAssertEqual(BubbleEditMark.resolve(editedAt: Date(), isSaving: false), .edited)
        XCTAssertEqual(BubbleEditMark.resolve(editedAt: nil, isSaving: true), .saving)
    }

    /// Le crayon vit DANS le pied : un pied « modifié » est plus large que le
    /// même pied sans l'état, en rangée comme en compact (émoji seul).
    func test_rowFooter_editedMessage_rendersPencilInFooter() {
        let edited = footerWidth(receivedFooter(showsTranslate: false, edit: .edited), actions: .none)
        let plain = footerWidth(receivedFooter(showsTranslate: false), actions: .none)
        XCTAssertGreaterThan(edited, plain)
    }

    func test_compactFooter_editedMessage_rendersPencilInFooter() {
        let edited = footerWidth(receivedFooter(showsTranslate: false, edit: .edited), actions: .none, style: .compact)
        let plain = footerWidth(receivedFooter(showsTranslate: false), actions: .none, style: .compact)
        XCTAssertGreaterThan(edited, plain)
    }

    /// Posé en tête de bulle, le crayon tombait dans le coin arrondi que le
    /// `clipShape` rogne. Le pied est son seul site.
    func test_bubbleLayout_editedMark_isNotMountedAboveTheBody() throws {
        let src = try source("Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertFalse(src.contains("editedIndicator"))
        XCTAssertTrue(src.contains("BubbleEditMark.resolve("))
    }

    /// Le bouton de réaction du dernier message reçu se posait sur l'heure :
    /// son disque commence SOUS la ligne de méta (8 pt de marge basse du
    /// pied), et le strip tient dans la réserve basse de la cellule (31 pt).
    func test_reactionStripRestingOffset_lastReceivedBubble_clearsTheFooterMetaLine() {
        let offset = BubbleReactionsOverlay.restingOffset
        XCTAssertGreaterThanOrEqual(
            BubbleReactionsOverlay.chipTop(offset: offset),
            -BubbleReactionsOverlay.footerBottomInset
        )
        XCTAssertLessThanOrEqual(BubbleReactionsOverlay.hitBottom(offset: offset), 31)
    }

    func test_bubbleLayout_reactionStrip_usesTheRestingOffset() throws {
        let src = try source("Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertTrue(src.contains(".offset(y: BubbleReactionsOverlay.restingOffset)"))
    }
}
