import XCTest
@testable import MeeshySDK

/// Les quatre notifications du jeu (#9490) : un type connu du client — sans quoi il décodait en `.system` et son
/// toucher ne menait nulle part —, rangé avec l'engagement, gouverné par SA préférence « Jeu », et dont le toucher
/// ouvre la page qui le restitue (Ligue pour un duo ou un résultat de ligue, Saison pour une étape).
final class GameNotificationTests: XCTestCase {

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    private func duoJSON(type: String = "game_duo_invited", title: String? = "Marie t’invite à un duo") -> String {
        let titleField = title.map { #""title":"\#($0)","# } ?? ""
        return #"""
        {"id":"n1","userId":"me","type":"\#(type)","priority":"normal",\#(titleField)
         "content":"La mission de la semaine se joue à deux.",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-10-06T08:00:00.000Z"},
         "metadata":{"action":"view_details","route":"progression","gameSection":"duo","duoId":"d42","weekKey":"2026-10-05"},
         "actor":{"id":"x42","username":"marie","displayName":"Marie","avatar":null}}
        """#
    }

    private let leagueJSON = #"""
    {"id":"n2","userId":"me","type":"game_league_result","priority":"normal",
     "content":"Tu montes en Jade cette semaine.",
     "state":{"isRead":false,"readAt":null,"createdAt":"2026-10-06T08:00:00.000Z"},
     "metadata":{"action":"view_details","route":"progression","gameSection":"league","weekKey":"2026-10-05","league":"quartz","outcome":"promoted","cup":"gold"}}
    """#

    private let seasonJSON = #"""
    {"id":"n3","userId":"me","type":"game_season_step","priority":"normal",
     "content":"Étape 12 atteinte.",
     "state":{"isRead":true,"readAt":"2026-10-06T09:00:00.000Z","createdAt":"2026-10-06T08:00:00.000Z"},
     "metadata":{"action":"view_details","route":"progression","gameSection":"season","season":3,"step":12,"completed":false}}
    """#

    // MARK: - Types

    func test_rawValues_areTheServerTypes() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "game_duo_invited"), .gameDuoInvited)
        XCTAssertEqual(MeeshyNotificationType(rawValue: "game_duo_accepted"), .gameDuoAccepted)
        XCTAssertEqual(MeeshyNotificationType(rawValue: "game_league_result"), .gameLeagueResult)
        XCTAssertEqual(MeeshyNotificationType(rawValue: "game_season_step"), .gameSeasonStep)
    }

    func test_decoding_keepsTheGameType_insteadOfFallingBackToSystem() throws {
        XCTAssertEqual(try decode(duoJSON()).notificationType, .gameDuoInvited)
        XCTAssertEqual(try decode(leagueJSON).notificationType, .gameLeagueResult)
        XCTAssertEqual(try decode(seasonJSON).notificationType, .gameSeasonStep)
    }

    func test_isGame_isTrueForTheFourTypesOnly() {
        let games = MeeshyNotificationType.allCases.filter(\.isGame)
        XCTAssertEqual(Set(games), [.gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep])
    }

    // MARK: - Métadonnées typées

    func test_metadata_carriesWhereTheTouchLeads_andWhatTheWeekWas() throws {
        let duo = try XCTUnwrap(try decode(duoJSON()).metadata)
        XCTAssertEqual(duo.gameSection, "duo")
        XCTAssertEqual(duo.duoId, "d42")
        XCTAssertEqual(duo.weekKey, "2026-10-05")

        let league = try XCTUnwrap(try decode(leagueJSON).metadata)
        XCTAssertEqual(league.gameSection, "league")
        XCTAssertEqual(league.outcome, "promoted")
        XCTAssertEqual(league.cup, "gold")

        let season = try XCTUnwrap(try decode(seasonJSON).metadata)
        XCTAssertEqual(season.season, 3)
        XCTAssertEqual(season.step, 12)
        XCTAssertEqual(season.completed, false)
    }

    // MARK: - Destination du toucher

    func test_destination_aDuoAndALeagueResultOpenTheLeaguePage_aSeasonStepOpensTheSeason() {
        XCTAssertEqual(MeeshyNotificationType.gameDuoInvited.gameDestination, .league)
        XCTAssertEqual(MeeshyNotificationType.gameDuoAccepted.gameDestination, .league)
        XCTAssertEqual(MeeshyNotificationType.gameLeagueResult.gameDestination, .league)
        XCTAssertEqual(MeeshyNotificationType.gameSeasonStep.gameDestination, .season)
        XCTAssertNil(MeeshyNotificationType.levelUp.gameDestination)
        XCTAssertNil(MeeshyNotificationType.newMessage.gameDestination)
    }

    // MARK: - Présentation

    func test_presentation_everyGameTypeHasItsOwnIconAndTheEngagementAccent() {
        let icons = Set([MeeshyNotificationType.gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep].map(\.systemIcon))
        XCTAssertFalse(icons.contains("bell.fill"), "pas l'icône du système")
        XCTAssertEqual(MeeshyNotificationType.gameLeagueResult.accentHex, MeeshyNotificationType.levelUp.accentHex)
    }

    func test_formattedTitle_withServerTitle_showsWhatTheGatewayServed() throws {
        XCTAssertEqual(try decode(duoJSON()).formattedTitle, "Marie t’invite à un duo")
    }

    func test_formattedTitle_withoutServerTitle_aDuoNamesTheFriend() throws {
        XCTAssertEqual(try decode(duoJSON(title: nil)).formattedTitle, "Marie t’invite à un duo")
        XCTAssertEqual(try decode(duoJSON(type: "game_duo_accepted", title: nil)).formattedTitle, "Marie a accepté ton duo")
    }

    func test_formattedTitle_leagueAndSeasonHaveNoActor_theClientNamesTheSurface() throws {
        XCTAssertEqual(try decode(leagueJSON).formattedTitle, "Ta ligue de la semaine")
        XCTAssertEqual(try decode(seasonJSON).formattedTitle, "Ta saison")
    }

    func test_formattedBody_isTheServedSentence() throws {
        XCTAssertEqual(try decode(leagueJSON).formattedBody, "Tu montes en Jade cette semaine.")
        XCTAssertEqual(try decode(duoJSON()).formattedBody, "La mission de la semaine se joue à deux.")
    }

    func test_row_leagueAndSeasonWearTheSignature_aDuoKeepsItsFriendsAvatar() throws {
        XCTAssertEqual(try decode(leagueJSON).rowPresentation().leading, .signature)
        XCTAssertEqual(try decode(seasonJSON).rowPresentation().leading, .signature)
        XCTAssertEqual(try decode(duoJSON()).rowPresentation().leading, .avatar)
    }

    func test_quickActions_areAbsent_theTapOpensThePage() throws {
        XCTAssertEqual(try decode(duoJSON()).quickActions, [])
        XCTAssertEqual(try decode(leagueJSON).quickActions, [])
    }

    // MARK: - Bannière in-app

    func test_inAppBanner_leagueResultWithoutActor_namesTheSurface_andShowsTheServedSentence() throws {
        let event = try JSONDecoder().decode(SocketNotificationEvent.self, from: Data("""
        {"id":"n9","userId":"me","type":"game_league_result","content":"Tu montes en Jade cette semaine."}
        """.utf8))

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Ta ligue de la semaine", "jamais « Quelqu'un »")
        XCTAssertEqual(banner.body, "Tu montes en Jade cette semaine.")
    }

    func test_inAppBanner_aDuoInvitationNamesTheFriend() throws {
        let event = try JSONDecoder().decode(SocketNotificationEvent.self, from: Data("""
        {"id":"n8","userId":"me","type":"game_duo_invited","title":"Marie","subtitle":"t’invite à un duo",
         "content":"La mission de la semaine se joue à deux.",
         "actor":{"id":"x42","username":"marie","displayName":"Marie"}}
        """.utf8))

        let banner = event.bannerPresentation()
        XCTAssertEqual(banner.headline, "Marie t’invite à un duo")
        XCTAssertEqual(banner.body, "La mission de la semaine se joue à deux.")
    }

    // MARK: - Préférence « Jeu »

    func test_preference_followsGameEnabled_notTheOtherSwitches() {
        var prefs = UserNotificationPreferences.defaults
        prefs.contactRequestEnabled = false
        prefs.systemEnabled = false
        XCTAssertTrue(prefs.isTypeEnabled(.gameLeagueResult))

        prefs.gameEnabled = false
        for type in [MeeshyNotificationType.gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep] {
            XCTAssertFalse(prefs.isTypeEnabled(type), "\(type)")
            XCTAssertFalse(prefs.allowsNotification(type: type), "\(type)")
            XCTAssertFalse(prefs.allowsInAppBanner(type: type), "\(type)")
        }
        XCTAssertTrue(prefs.isTypeEnabled(.levelUp), "l'engagement ordinaire n'est pas le jeu")
    }

    func test_gameEnabled_absentFromPayload_decodesTrue_andRoundTrips() throws {
        XCTAssertTrue(UserNotificationPreferences.defaults.gameEnabled)
        let empty = try JSONDecoder().decode(UserNotificationPreferences.self, from: Data("{}".utf8))
        XCTAssertTrue(empty.gameEnabled, "absent = reçu")

        var prefs = UserNotificationPreferences.defaults
        prefs.gameEnabled = false
        let data = try JSONEncoder().encode(prefs)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["gameEnabled"] as? Bool, false)
        XCTAssertFalse(try JSONDecoder().decode(UserNotificationPreferences.self, from: data).gameEnabled)
    }

    // MARK: - Chemin push

    func test_pushPayload_carriesTheFriendAsSender() {
        let payload = NotificationPayload(userInfo: ["type": "game_duo_accepted", "senderId": "x42", "senderUsername": "marie"])
        XCTAssertEqual(MeeshyNotificationType(rawValue: payload.type ?? ""), .gameDuoAccepted)
        XCTAssertEqual(payload.senderId, "x42")
    }
}
