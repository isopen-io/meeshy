import XCTest
@testable import MeeshySDK

/// #10525 — « Awa a republié votre réel / story / humeur / publication ». La
/// passerelle persiste le titre, dans la langue du destinataire : l'app le
/// montre tel quel. Une ligne d'avant ce titre retombe sur une phrase locale
/// qui NOMME, elle aussi, le contenu republié — jamais « votre publication »
/// pour un réel. Un STATUS se dit « humeur », comme le titre servi.
final class PostRepostNotificationTests: XCTestCase {

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    private func repostJSON(
        type: String = "post_repost",
        title: String? = nil,
        postType: String? = nil,
        postPreview: String? = nil
    ) -> String {
        let titleField = title.map { #""title":"\#($0)","# } ?? ""
        let metadata = [
            #""action":"view_post""#,
            postType.map { #""postType":"\#($0)""# },
            postPreview.map { #""postPreview":"\#($0)""# },
        ].compactMap { $0 }.joined(separator: ",")
        return #"""
        {"id":"n1","userId":"me","type":"\#(type)","priority":"normal",\#(titleField)
         "content":"",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-10-13T08:00:00.000Z"},
         "context":{"postId":"p1"},
         "metadata":{\#(metadata)},
         "actor":{"id":"a1","username":"awa","displayName":"Awa","avatar":null}}
        """#
    }

    // MARK: - Titre

    func test_formattedTitle_withServerTitle_showsWhatTheGatewayServed() throws {
        let notification = try decode(repostJSON(title: "Awa reposted your reel", postType: "REEL"))
        XCTAssertEqual(notification.formattedTitle, "Awa reposted your reel")
    }

    func test_formattedTitle_withoutServerTitle_namesTheRepostedContent() throws {
        let expected: [(String?, String)] = [
            ("REEL", "Awa a republié votre réel"),
            ("STORY", "Awa a republié votre story"),
            ("STATUS", "Awa a republié votre humeur"),
            ("MOOD", "Awa a republié votre humeur"),
            ("POST", "Awa a republié votre publication"),
            (nil, "Awa a republié votre publication"),
        ]
        for (postType, title) in expected {
            XCTAssertEqual(try decode(repostJSON(postType: postType)).formattedTitle, title, "postType \(postType ?? "absent")")
        }
    }

    // MARK: - Pied de ligne

    func test_rowFooter_repostedStatus_isCalledAMood_likeTheServedTitle() throws {
        let notification = try decode(repostJSON(title: "Awa a republié votre humeur", postType: "STATUS"))
        XCTAssertEqual(notification.rowPresentation(copy: { _ in nil }).footer, .content(symbol: "face.smiling.fill", text: "Humeur", isExpired: false))
    }

    func test_rowFooter_repostedReel_namesTheReel() throws {
        let notification = try decode(repostJSON(title: "Awa a republié votre réel", postType: "REEL"))
        XCTAssertEqual(notification.rowPresentation(copy: { _ in nil }).footer, .content(symbol: "play.rectangle.fill", text: "Réel", isExpired: false))
    }

    func test_rowFooter_statusReaction_isCalledAMoodToo() throws {
        let notification = try decode(repostJSON(type: "status_reaction", title: "Awa a réagi à votre humeur", postType: "STATUS"))
        XCTAssertEqual(notification.rowPresentation(copy: { _ in nil }).footer, .content(symbol: "face.smiling.fill", text: "Humeur", isExpired: false))
    }

    // MARK: - Préférence de réception

    func test_preference_postRepostDisabled_filtersTheRepost() {
        var prefs = UserNotificationPreferences.defaults
        prefs.postRepostEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.postRepost))
    }
}
