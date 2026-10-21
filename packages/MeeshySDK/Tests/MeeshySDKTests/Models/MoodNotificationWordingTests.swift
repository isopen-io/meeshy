import XCTest
@testable import MeeshySDK

/// #10526 — un mood (Post de type STATUS) se dit « humeur » dans TOUTE
/// notification qui le nomme : réaction, commentaire, republication. Le titre
/// servi par la passerelle s'affiche tel quel ; une ligne sans titre servi
/// retombe sur une phrase locale qui dit, elle aussi, « votre humeur » ; le
/// pied de ligne dit « Humeur ». Le type transmis reste STATUS.
final class MoodNotificationWordingTests: XCTestCase {

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    private func json(
        type: String,
        title: String? = nil,
        postType: String? = nil,
        emoji: String? = nil
    ) -> String {
        let titleField = title.map { #""title":"\#($0)","# } ?? ""
        let metadata = [
            #""action":"view_post""#,
            postType.map { #""postType":"\#($0)""# },
            emoji.map { #""emoji":"\#($0)""# },
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

    // MARK: - Titre de secours

    func test_formattedTitle_reactionOnStatus_withoutServerTitle_saysMood() throws {
        for postType in ["STATUS", "MOOD"] {
            let notification = try decode(json(type: "status_reaction", postType: postType, emoji: "🔥"))
            XCTAssertEqual(notification.formattedTitle, "Awa a réagi 🔥 à votre humeur", "postType \(postType)")
        }
    }

    func test_formattedTitle_statusReaction_withoutPostType_saysMood() throws {
        let notification = try decode(json(type: "status_reaction", emoji: "🔥"))
        XCTAssertEqual(notification.formattedTitle, "Awa a réagi 🔥 à votre humeur")
    }

    func test_formattedTitle_reactionOnStatus_withoutEmoji_saysMood() throws {
        let notification = try decode(json(type: "status_reaction", postType: "STATUS"))
        XCTAssertEqual(notification.formattedTitle, "Awa a aimé votre humeur")
    }

    func test_formattedTitle_postLikeOnStatus_saysMood() throws {
        let notification = try decode(json(type: "post_like", postType: "STATUS", emoji: "❤️"))
        XCTAssertEqual(notification.formattedTitle, "Awa a réagi ❤️ à votre humeur")
    }

    func test_formattedTitle_commentOnStatus_withoutServerTitle_saysMood() throws {
        let notification = try decode(json(type: "post_comment", postType: "STATUS"))
        XCTAssertEqual(notification.formattedTitle, "Awa a commenté votre humeur")
    }

    func test_formattedTitle_withServerTitle_showsWhatTheGatewayServed() throws {
        let notification = try decode(json(type: "post_comment", title: "Awa commented on your mood", postType: "STATUS"))
        XCTAssertEqual(notification.formattedTitle, "Awa commented on your mood")
    }

    func test_formattedTitle_reactionOnPost_isUnchanged() throws {
        let notification = try decode(json(type: "post_like", postType: "POST", emoji: "❤️"))
        XCTAssertEqual(notification.formattedTitle, "Awa a reagi ❤️ a votre publication")
    }

    // MARK: - Pied de ligne

    func test_rowFooter_anyGestureOnStatus_saysMood() throws {
        for type in ["status_reaction", "post_comment", "post_like", "post_repost"] {
            for postType in ["STATUS", "MOOD"] {
                let notification = try decode(json(type: type, title: "Awa", postType: postType))
                XCTAssertEqual(
                    notification.rowPresentation(copy: { _ in nil }).footer,
                    .content(symbol: "face.smiling.fill", text: "Humeur", isExpired: false),
                    "\(type) · \(postType)"
                )
            }
        }
    }

    func test_rowFooter_statusReaction_withoutPostType_saysMood() throws {
        let notification = try decode(json(type: "status_reaction", title: "Awa"))
        XCTAssertEqual(notification.rowPresentation(copy: { _ in nil }).footer, .content(symbol: "face.smiling.fill", text: "Humeur", isExpired: false))
    }
}
