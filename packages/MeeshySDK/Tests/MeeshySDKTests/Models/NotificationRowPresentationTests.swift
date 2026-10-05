import XCTest
@testable import MeeshySDK

/// #8724 — une ligne de la page Notifications ne répète rien et dit de quoi il
/// s'agit. Les témoins suivent la capture du porteur (2026-09-29) type par type.
final class NotificationRowPresentationTests: XCTestCase {

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    private let catalog: NotificationCopyLookup = { key in
        [
            "progression.axis.social.invite_joined": "Invités venus",
            "progression.axis.content.text_message": "Messages texte",
            "progression.achievement.first_voice.title": "Première voix",
            "progression.achievement.first_voice.condition": "Un premier message ou commentaire vocal",
            "notification.milestone.badge.reason": "Badge débloqué · palier %lld",
            "notification.milestone.inviteJoined.reason": "%@ a rejoint Meeshy grâce à vous",
            "notification.milestone.level.name": "Niveau %lld",
        ][key]
    }

    private let state = #""state":{"isRead":false,"readAt":null,"createdAt":"2026-09-29T17:00:00.000Z"}"#

    // MARK: - La règle

    func test_repeats_truncatedQuote_matchesTheFullText() {
        XCTAssertTrue(NotificationRowText.repeats(
            "« Superbe features qui vient avec tellement d’…",
            "Superbe features qui vient avec tellement d’autres!"
        ))
    }

    func test_repeats_differentTexts_doNotMatch() {
        XCTAssertFalse(NotificationRowText.repeats("Salut", "Les amateurs"))
    }

    func test_distinct_dropsTheLaterRepetition_keepsItsPlace() {
        XCTAssertEqual(NotificationRowText.distinct(["A b", "a  B", nil, "c"]), ["A b", nil, nil, "c"])
    }

    // MARK: - Réaction à un commentaire (Belva)

    func test_rowPresentation_commentReaction_showsTheCommentOnce_andThePostInFooter() throws {
        let notification = try decode(#"""
        {"id":"n1","userId":"me","type":"comment_reaction","priority":"low",
         "title":"Belva Tano a réagi ❤️ à votre commentaire",
         "subtitle":"« Superbe features qui vient avec tellement d’autres! »",
         "content":"Belva Tano a réagi ❤️ à votre commentaire sur la publication de Grace",
         "actor":{"id":"b1","username":"belva","displayName":"Belva Tano","avatar":null},
         "context":{"postId":"p1","commentId":"c1"},
         "metadata":{"reactionEmoji":"❤️","postType":"POST",
                     "commentPreview":"Superbe features qui vient avec tellement d’autres!",
                     "postPreview":"Nouvelle version de Meeshy disponible"},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        XCTAssertEqual(row.body, "« Superbe features qui vient avec tellement d’autres! »")
        XCTAssertNil(row.quote)
        XCTAssertEqual(row.footer, .content(symbol: "square.text.square.fill",
                                            text: "Nouvelle version de Meeshy disponible",
                                            isExpired: false))
    }

    func test_rowPresentation_commentReactionWithoutPostExcerpt_footerNamesTheContentKind_neverTheComment() throws {
        let notification = try decode(#"""
        {"id":"n2","userId":"me","type":"comment_reaction","priority":"low",
         "title":"Belva Tano a réagi ❤️ à votre commentaire",
         "subtitle":"« Superbe features »",
         "actor":{"id":"b1","username":"belva","displayName":"Belva Tano","avatar":null},
         "metadata":{"postType":"STORY","commentPreview":"Superbe features"},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        guard case .content(let symbol, let text, _) = row.footer else { return XCTFail("pied de contenu attendu") }
        XCTAssertEqual(symbol, "circle.dashed.inset.filled")
        XCTAssertFalse(text.contains("Superbe"), "le pied ne répète pas le commentaire")
    }

    // MARK: - Réaction à un post

    func test_rowPresentation_postReaction_bodyStaysSilent_footerCarriesThePost() throws {
        let notification = try decode(#"""
        {"id":"n3","userId":"me","type":"post_like","priority":"normal",
         "title":"Ali a réagi 🔥 à votre publication","subtitle":"Votre publication",
         "content":"🎥 Vidéo · Mon voyage",
         "actor":{"id":"a1","username":"ali","displayName":"Ali","avatar":null},
         "metadata":{"postType":"REEL","postPreview":"Mon voyage","mediaType":"video"},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        XCTAssertNil(row.body)
        XCTAssertEqual(row.footer, .content(symbol: "play.rectangle.fill", text: "Mon voyage", isExpired: false))
    }

    // MARK: - Réponse à un commentaire

    func test_rowPresentation_commentReply_quotesTheParent_andFootsThePost() throws {
        let notification = try decode(#"""
        {"id":"n4","userId":"me","type":"comment_reply","priority":"normal",
         "title":"Grace a répondu à votre commentaire","subtitle":"Publication",
         "content":"Merci !",
         "actor":{"id":"g1","username":"grace","displayName":"Grace","avatar":null},
         "metadata":{"postType":"POST","commentPreview":"Merci !","parentCommentPreview":"Bravo",
                     "postPreview":"Lancement"},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        XCTAssertEqual(row.body, "Merci !")
        XCTAssertEqual(row.quote, "En réponse à « Bravo »")
        XCTAssertEqual(row.footer, .content(symbol: "square.text.square.fill", text: "Lancement", isExpired: false))
    }

    // MARK: - Nouvelle publication d'un ami

    func test_rowPresentation_friendNewPostWithoutText_footerFallsBackToTheKind_notTheMediaAgain() throws {
        let notification = try decode(#"""
        {"id":"n5","userId":"me","type":"friend_new_post","priority":"normal",
         "title":"elvira a publié un nouveau post","subtitle":"Nouvelle publication",
         "actor":{"id":"e1","username":"elvira","displayName":"elvira","avatar":null},
         "metadata":{"contentType":"POST","mediaType":"video"},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        XCTAssertEqual(row.body, "🎥 Vidéo")
        XCTAssertEqual(row.footer, .content(symbol: "square.text.square.fill", text: "Publication", isExpired: false))
    }

    // MARK: - Message de groupe

    func test_rowPresentation_groupReply_footerIsTheGroup() throws {
        let notification = try decode(#"""
        {"id":"n6","userId":"me","type":"message_reply","priority":"normal",
         "title":"Reponse de Temgouananagrace","subtitle":"Les amateurs","content":"Comme d’habitude 🤣",
         "actor":{"id":"t1","username":"tg","displayName":"Temgouananagrace","avatar":null},
         "context":{"conversationId":"c1","conversationTitle":"Les amateurs","conversationType":"group"},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        XCTAssertEqual(row.body, "Comme d’habitude 🤣")
        XCTAssertEqual(row.footer, .conversation(title: "Les amateurs"))
    }

    func test_rowPresentation_directMessage_hasNoFooter() throws {
        let notification = try decode(#"""
        {"id":"n7","userId":"me","type":"new_message","priority":"normal",
         "title":"Message de Fortune","content":"Tu fais quoi",
         "actor":{"id":"f1","username":"fortune","displayName":"Fortune","avatar":null},
         "context":{"conversationId":"c2","conversationTitle":"Fortune","conversationType":"direct"},
        \#(state)}
        """#)

        XCTAssertNil(notification.rowPresentation(copy: catalog).footer)
    }

    // MARK: - Paliers

    func test_rowPresentation_badgeEarned_namesTheBadge_withItsIconAndReason() throws {
        let notification = try decode(#"""
        {"id":"n8","userId":"me","type":"badge_earned","priority":"normal",
         "content":"🏅 Badge débloqué : Messages texte · palier 10",
         "metadata":{"axisKey":"content.text_message","threshold":10},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        XCTAssertEqual(row.leading, .milestone(symbol: "text.bubble.fill"))
        XCTAssertEqual(row.title, "Messages texte")
        XCTAssertEqual(row.body, "Badge débloqué · palier 10")
    }

    func test_rowPresentation_badgeWithoutCatalog_fallsBackToTheServedSentence() throws {
        let notification = try decode(#"""
        {"id":"n9","userId":"me","type":"badge_earned","priority":"normal",
         "content":"🏅 Badge débloqué : Messages texte · palier 10",
         "metadata":{"axisKey":"content.text_message","threshold":10},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: { _ in nil })

        XCTAssertEqual(row.title, "Badge débloqué")
        XCTAssertEqual(row.body, "🏅 Badge débloqué : Messages texte · palier 10")
    }

    func test_rowPresentation_inviteJoinedBadge_namesTheInvitee() throws {
        let notification = try decode(#"""
        {"id":"n10","userId":"me","type":"badge_earned","priority":"normal",
         "content":"🏅 Badge débloqué : Invités venus · palier 1",
         "actor":{"id":"i1","username":"awa","displayName":"Awa","avatar":null},
         "metadata":{"axisKey":"social.invite_joined","threshold":1},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        XCTAssertEqual(row.title, "Invités venus")
        XCTAssertEqual(row.body, "Awa a rejoint Meeshy grâce à vous")
        XCTAssertEqual(row.leading, .milestone(symbol: "person.badge.plus.fill"))
    }

    func test_rowPresentation_achievement_saysItsCondition() throws {
        let notification = try decode(#"""
        {"id":"n11","userId":"me","type":"achievement_unlocked","priority":"normal",
         "content":"🏆 Succès débloqué : Première voix",
         "metadata":{"achievementKey":"achievement.first_voice"},
        \#(state)}
        """#)

        let row = notification.rowPresentation(copy: catalog)

        XCTAssertEqual(row.title, "Première voix")
        XCTAssertEqual(row.body, "Un premier message ou commentaire vocal")
        XCTAssertEqual(row.leading, .milestone(symbol: "trophy.fill"))
    }

    // MARK: - Gestes du badge « Invités venus »

    func test_quickActions_inviteJoinedBadge_notFriend_writeAndConnect() throws {
        let notification = try decode(#"""
        {"id":"n12","userId":"me","type":"badge_earned","priority":"normal",
         "actor":{"id":"i1","username":"awa","displayName":"Awa","avatar":null},
         "metadata":{"axisKey":"social.invite_joined","threshold":1},
        \#(state)}
        """#)

        XCTAssertEqual(notification.quickActions(isFriend: false), [.write(userId: "i1"), .connect(userId: "i1")])
        XCTAssertEqual(notification.quickActions(isFriend: true), [.write(userId: "i1")])
    }

    func test_quickActions_otherBadge_hasNone() throws {
        let notification = try decode(#"""
        {"id":"n13","userId":"me","type":"badge_earned","priority":"normal",
         "actor":{"id":"i1","username":"awa","displayName":"Awa","avatar":null},
         "metadata":{"axisKey":"content.text_message","threshold":1},
        \#(state)}
        """#)

        XCTAssertEqual(notification.quickActions(isFriend: false), [])
    }
}
