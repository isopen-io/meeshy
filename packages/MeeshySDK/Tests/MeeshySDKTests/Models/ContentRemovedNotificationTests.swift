import XCTest
@testable import MeeshySDK

/// « Votre message a été retiré par un administrateur — Motif : … » (#11151) :
/// la passerelle émet `content_removed` à l'AUTEUR seul. Absent du catalogue,
/// il décodait en `.system` — titre « Notification systeme », motif perdu.
final class ContentRemovedNotificationTests: XCTestCase {

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    private func removedJSON(
        title: String? = "Votre message dans « Groupe » a été retiré par un administrateur",
        content: String? = "Motif : Propos haineux",
        reason: String = "Propos haineux"
    ) -> String {
        let titleField = title.map { #""title":"\#($0)","# } ?? ""
        let contentField = content.map { #""content":"\#($0)","# } ?? ""
        return #"""
        {"id":"n1","userId":"me","type":"content_removed","priority":"normal",\#(titleField)\#(contentField)
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-10-20T08:00:00.000Z"},
         "context":{"conversationId":"c1","conversationTitle":"Groupe"},
         "metadata":{"contentType":"message","contentId":"m1","conversationId":"c1","reason":"\#(reason)"}}
        """#
    }

    func test_rawValue_isTheServerType() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "content_removed"), .contentRemoved)
    }

    func test_decoding_keepsTypeReasonAndRemovedContent() throws {
        let notification = try decode(removedJSON())

        XCTAssertEqual(notification.notificationType, .contentRemoved)
        XCTAssertEqual(notification.metadata?.reason, "Propos haineux")
        XCTAssertEqual(notification.metadata?.contentType, "message")
        XCTAssertEqual(notification.metadata?.contentId, "m1")
        XCTAssertEqual(notification.context?.conversationId, "c1")
    }

    func test_presentation_isAShieldInTheSystemFamily() {
        XCTAssertEqual(MeeshyNotificationType.contentRemoved.systemIcon, "xmark.shield.fill")
        XCTAssertEqual(MeeshyNotificationType.contentRemoved.accentHex, "EF4444")
    }

    func test_formattedTitle_withServerTitle_showsWhatTheGatewayServed() throws {
        XCTAssertEqual(
            try decode(removedJSON()).formattedTitle,
            "Votre message dans « Groupe » a été retiré par un administrateur"
        )
    }

    func test_formattedTitle_withoutServerTitle_namesTheRemoval() throws {
        XCTAssertFalse(try decode(removedJSON(title: nil)).formattedTitle.isEmpty)
        XCTAssertNotEqual(try decode(removedJSON(title: nil)).formattedTitle, "Notification systeme")
    }

    func test_formattedBody_whenServedBodyCarriesTheReason_showsItOnce() throws {
        XCTAssertEqual(try decode(removedJSON()).formattedBody, "Motif : Propos haineux")
    }

    func test_formattedBody_whenServedBodyOmitsTheReason_appendsIt() throws {
        let body = try decode(removedJSON(content: "Votre message a été retiré")).formattedBody

        XCTAssertTrue(body?.hasPrefix("Votre message a été retiré") == true)
        XCTAssertTrue(body?.contains("Propos haineux") == true)
    }

    func test_formattedBody_withoutServedBody_stillShowsTheReason() throws {
        XCTAssertTrue(try decode(removedJSON(content: nil)).formattedBody?.contains("Propos haineux") == true)
    }

    func test_preferences_systemOff_stillDeliverTheStatementOfReasons() {
        var prefs = UserNotificationPreferences.defaults
        prefs.systemEnabled = false
        XCTAssertTrue(prefs.isTypeEnabled(.contentRemoved))
    }
}
