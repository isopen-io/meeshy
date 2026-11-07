import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// **La puce d'une vue unique dit où en est son envoi** (#16130) : horloge en attente,
/// accusé ensuite, « ! » en échec, sur les deux rendus de la puce — sans rien dire de ce
/// qu'elle scelle.
///
/// Le fil rend la puce par deux chemins : `BubbleViewOnceSealedView` en Bulles, et
/// `FocalRow` en Script et en Focal, où la colonne méta est à opacité 0 au repos. Un
/// témoin par chemin, parce qu'un statut posé sur l'un seulement resterait invisible
/// dans le mode d'ouverture par défaut (`.script`).
@MainActor
final class ViewOnceDeliveryStatusTests: XCTestCase {

    private let secret = "SECRET-VU-TEXTE"
    private let fileName = "SECRET-VU-NOM.m4a"
    private let sentAt = Date(timeIntervalSince1970: 1_800_000_000)

    // MARK: - Fabriques

    private func viewOnceMessage(
        isMe: Bool = true,
        status: Message.DeliveryStatus = .sent,
        isOpened: Bool = false
    ) -> Message {
        let voice = MessageAttachment(
            id: "a1", messageId: "vu1", fileName: fileName, originalName: fileName,
            mimeType: "audio/mp4", fileSize: 10, fileUrl: "https://staging.meeshy.me/v.m4a",
            duration: 4242, caption: secret, isViewOnce: true
        )
        var message = Message(
            id: "vu1", conversationId: "c1", senderId: isMe ? "me" : "u2", content: secret,
            attachments: [voice], createdAt: sentAt, senderName: "Demo", deliveryStatus: status, isMe: isMe
        )
        message.isViewOnce = true
        message.viewOnceOpenedAt = isOpened ? sentAt : nil
        return message
    }

    private func content(for message: Message) -> BubbleContent {
        BubbleContent(
            message: message,
            translations: [],
            preferredTranslation: nil,
            currentUserId: "me",
            timeString: "16:48"
        )
    }

    private func sealedFooter(
        status: Message.DeliveryStatus,
        isMe: Bool = true,
        isOnline: Bool = true
    ) -> BubbleFooterModel {
        BubbleViewOnceSealedView.footerModel(
            for: content(for: viewOnceMessage(isMe: isMe, status: status)),
            isOnline: isOnline
        )
    }

    private func sealedView(footer: BubbleFooterModel) -> BubbleViewOnceSealedView {
        BubbleViewOnceSealedView(
            state: .sealed, isMe: true, isDark: false, protection: .unprotected, footer: footer, onOpen: {}
        )
    }

    // MARK: - Mode Bulles : le pied de la puce

    func test_footerModel_pendingOwnViewOnce_exposesTheSendingClock() {
        let footer = sealedFooter(status: .sending)

        XCTAssertEqual(footer.delivery, .sending)
        XCTAssertTrue(footer.isPending)
        XCTAssertEqual(footer.sendStartedAt, sentAt, "sans son départ, un envoi de 100 ms ferait clignoter l'horloge")
        XCTAssertEqual(footer.timestamp, "16:48")
    }

    func test_footerModel_offlinePendingViewOnce_carriesTheOfflineState() {
        XCTAssertTrue(sealedFooter(status: .sending, isOnline: false).isOffline, "l'hors-ligne rend le sablier des autres bulles")
    }

    func test_footerModel_sentViewOnce_exposesTheCheck() {
        XCTAssertEqual(sealedFooter(status: .sent).delivery, .sent)
        XCTAssertNil(sealedFooter(status: .sent).sendStartedAt)
    }

    func test_footerModel_deliveredAndReadViewOnce_exposeTheirChecks() {
        XCTAssertEqual(sealedFooter(status: .delivered).delivery, .delivered)
        XCTAssertEqual(sealedFooter(status: .read).delivery, .read)
    }

    func test_footerModel_failedViewOnce_exposesTheFailure() {
        let footer = sealedFooter(status: .failed)

        XCTAssertEqual(footer.delivery, .failed, "la puce n'a pas de bande de renvoi : le « ! » reste")
        XCTAssertTrue(footer.isFailed)
    }

    func test_footerModel_openedOwnViewOnce_keepsItsCheck() {
        let opened = BubbleViewOnceSealedView.footerModel(
            for: content(for: viewOnceMessage(status: .delivered, isOpened: true)), isOnline: true
        )

        XCTAssertEqual(opened.delivery, .delivered, "ouvrir sa propre vue unique ne fait pas oublier qu'elle est arrivée")
    }

    func test_footerModel_receivedViewOnce_hasNoDeliveryGlyph() {
        XCTAssertNil(sealedFooter(status: .read, isMe: false).delivery, "un accusé ne dit rien à celui qui reçoit")
    }

    func test_equality_aStatusChange_redrawsThePill() {
        XCTAssertNotEqual(
            sealedView(footer: sealedFooter(status: .sending)),
            sealedView(footer: sealedFooter(status: .sent)),
            "`.equatable()` garderait l'horloge d'un message parti"
        )
    }

    func test_equality_goingOffline_redrawsThePendingPill() {
        XCTAssertNotEqual(
            sealedView(footer: sealedFooter(status: .sending, isOnline: true)),
            sealedView(footer: sealedFooter(status: .sending, isOnline: false))
        )
    }

    // MARK: - Protection : le statut ne porte rien de ce que la puce scelle

    func test_footerModel_carriesNothingOfTheSealedContent() {
        let footer = sealedFooter(status: .sending)
        let carried = String(describing: footer)

        XCTAssertFalse(carried.contains(secret), "ni le texte ni la légende")
        XCTAssertFalse(carried.contains(fileName), "ni le nom du fichier")
        XCTAssertFalse(carried.contains("4242"), "ni la durée")
        XCTAssertFalse(carried.contains("staging.meeshy.me"), "ni l'URL")
        XCTAssertNil(footer.sender, "ni l'identité")
        XCTAssertTrue(footer.flags.isEmpty, "ni les langues du message")
        XCTAssertFalse(footer.showsTranslateGlyph, "ni la porte de la traduction")
        XCTAssertNil(footer.edit)
        XCTAssertNil(footer.integrity)
    }

    // MARK: - Script et Focal : la colonne méta, à opacité 0 au repos

    func test_flatRow_sealedAndOpenedOwnViewOnce_pinTheirPendingDelivery() {
        XCTAssertTrue(content(for: viewOnceMessage(status: .sending)).pinsPendingDelivery)
        XCTAssertTrue(content(for: viewOnceMessage(status: .sending, isOpened: true)).pinsPendingDelivery)
    }

    func test_flatRow_ordinaryMessage_doesNotPinItsDelivery_thatIsIssue16542() {
        let ordinary = Message(id: "m1", conversationId: "c1", senderId: "me", content: "bonjour", deliveryStatus: .sending, isMe: true)

        XCTAssertFalse(content(for: ordinary).pinsPendingDelivery, "#16542 reste à solder pour toutes les bulles")
    }

    func test_metaRow_inFlightStatuses_showAtRest_whenPinned() {
        for status: Message.DeliveryStatus in [.sending, .clock, .slow] {
            XCTAssertTrue(FocalMetaRow.showsDeliveryAtRest(status, pinsPendingDelivery: true), "\(status)")
        }
    }

    func test_metaRow_settledStatuses_stayInTheReveal_evenWhenPinned() {
        for status: Message.DeliveryStatus in [.sent, .delivered, .read, .failed, .invisible] {
            XCTAssertFalse(FocalMetaRow.showsDeliveryAtRest(status, pinsPendingDelivery: true), "\(status)")
        }
    }

    func test_metaRow_unpinnedRow_keepsEveryStatusInTheReveal() {
        for status: Message.DeliveryStatus in [.sending, .clock, .slow, .sent, .failed] {
            XCTAssertFalse(FocalMetaRow.showsDeliveryAtRest(status, pinsPendingDelivery: false), "\(status)")
        }
    }

    func test_metaRow_equality_seesThePinAndTheSendStart() {
        let base = FocalMetaRow(isMe: true, timeString: "16:48", deliveryStatus: .sending, isDark: false)
        var pinned = base
        pinned.pinsPendingDelivery = true
        var dated = base
        dated.sendStartedAt = sentAt

        XCTAssertNotEqual(base, pinned)
        XCTAssertNotEqual(base, dated)
    }

    func test_bubbleContent_ownMessage_carriesItsSendStart_receivedOneDoesNot() {
        XCTAssertEqual(content(for: viewOnceMessage()).meta.sendStartedAt, sentAt)
        XCTAssertNil(content(for: viewOnceMessage(isMe: false)).meta.sendStartedAt)
    }

    // MARK: - VoiceOver

    func test_accessibilityLabel_ownViewOnce_saysItsDeliveryStatus() {
        let label = MessageAccessibilityLabelComposer.compose(content(for: viewOnceMessage(status: .sending)))

        XCTAssertTrue(label.contains(MessageAccessibilityLabelComposer.deliveryStatusAccessibilityLabel(.sending)), label)
        XCTAssertFalse(label.contains(secret))
        XCTAssertFalse(label.contains(fileName))
    }

    func test_accessibilityLabel_receivedViewOnce_saysNoDeliveryStatus() {
        let label = MessageAccessibilityLabelComposer.compose(content(for: viewOnceMessage(isMe: false, status: .read)))

        XCTAssertFalse(label.contains(MessageAccessibilityLabelComposer.deliveryStatusAccessibilityLabel(.read)), label)
    }

    // MARK: - Les deux rendus sont branchés

    private func source(_ relativePath: String) throws -> String {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let raw = try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return raw.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    func test_sealedView_rendersTheSharedFooter_notATwin() throws {
        let view = try source("Meeshy/Features/Main/Views/Bubble/BubbleViewOnceViews.swift")

        XCTAssertTrue(view.contains("BubbleFooter(model: footer, actions: footerActions, style: .compact, isDark: isDark)"))
        XCTAssertFalse(view.contains("BubbleDeliveryCheck("), "le glyphe n'est pas redéclaré ici : le pied le porte déjà")
    }

    func test_flatRow_handsThePinAndTheSendStart_toTheMetaColumn() throws {
        let row = try source("Meeshy/Features/Focal/Row/FocalRow.swift")

        XCTAssertTrue(row.contains("pinsPendingDelivery: content.pinsPendingDelivery"))
        XCTAssertTrue(row.contains("sendStartedAt: content.meta.sendStartedAt"))
    }
}
