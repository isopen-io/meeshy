import XCTest
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
}
