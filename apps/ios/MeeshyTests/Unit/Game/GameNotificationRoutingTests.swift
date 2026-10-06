import XCTest
@testable import Meeshy
import MeeshySDK

/// Le toucher d'une notification du jeu (#9490) ouvre la page qui la restitue : la Ligue (son duo y est posé)
/// pour un duo et un résultat de ligue, la Saison pour une étape — depuis le push, la bannière et la liste, sur
/// iPhone comme sur iPad.
///
/// Les aiguillages vivent dans des méthodes `private` de vues SwiftUI lourdes : même convention que
/// `ContactRecentlyActiveRoutingTests`, ce sont des gardes de SOURCE, qui reconnaissent la branche par ce qu'elle FAIT.
final class GameNotificationRoutingTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_thePageOpenedByEachGameType() {
        XCTAssertEqual(GamePage.opened(by: .gameDuoInvited), .league)
        XCTAssertEqual(GamePage.opened(by: .gameDuoAccepted), .league)
        XCTAssertEqual(GamePage.opened(by: .gameLeagueResult), .league)
        XCTAssertEqual(GamePage.opened(by: .gameSeasonStep), .season)
        XCTAssertNil(GamePage.opened(by: .levelUp), "l'engagement ordinaire ouvre Progression, pas une page du jeu")
        XCTAssertNil(GamePage.opened(by: .newMessage))
    }

    func test_everyNavigationSwitch_routesTheFourGameTypesToTheirPage() throws {
        let four = ".gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep"
        let iphone = try source("Meeshy/Features/Main/Views/RootView.swift")
        XCTAssertEqual(iphone.components(separatedBy: "case \(four):").count - 1, 1, "l'aiguillage iPhone (push, liste, bannière)")
        XCTAssertTrue(iphone.contains("router.push(.gamePage(GamePage.opened(by: ctx.type)"))

        let ipad = try source("Meeshy/Features/Main/Views/iPadRootView+Navigation.swift")
        XCTAssertEqual(ipad.components(separatedBy: "case \(four):").count - 1, 3, "liste, bannière in-app et push : trois gestionnaires iPad")
        XCTAssertEqual(ipad.components(separatedBy: "rightPanelRoute = .gamePage(GamePage.opened(by:").count - 1, 3)
    }

    func test_aMissionWindowNotification_opensTheMissionsSectionOfProgression_notAGamePage() throws {
        XCTAssertNil(GamePage.opened(by: .gameMissionWindow), "la section des missions n'est pas une page du jeu")

        let iphone = try source("Meeshy/Features/Main/Views/RootView.swift")
        XCTAssertEqual(iphone.components(separatedBy: "case .gameMissionWindow:").count - 1, 1, "l'aiguillage iPhone")
        XCTAssertTrue(iphone.contains("router.pendingGameAnchor = .missions"))

        let ipad = try source("Meeshy/Features/Main/Views/iPadRootView+Navigation.swift")
        XCTAssertEqual(ipad.components(separatedBy: "case .gameMissionWindow:").count - 1, 3, "liste, bannière in-app et push")
        XCTAssertEqual(ipad.components(separatedBy: "router.pendingGameAnchor = .missions").count - 1, 3)

        let progression = try source("Meeshy/Features/Main/Views/ProgressionView.swift")
        XCTAssertTrue(progression.contains("consumePendingGameAnchor()"), "Progression ramasse l'ancre, UNE fois")
    }

    @MainActor
    func test_theRouterHandsOverThePendingAnchorOnlyOnce() {
        let router = Router()
        XCTAssertNil(router.consumePendingGameAnchor())
        router.pendingGameAnchor = .missions
        XCTAssertEqual(router.consumePendingGameAnchor(), .missions)
        XCTAssertNil(router.consumePendingGameAnchor(), "ramassée une fois, elle ne rejoue pas")
    }

    func test_theNotificationExtensionRendersADuoWithTheAvatarOfTheFriend() throws {
        let extensionSource = try source("MeeshyNotificationExtension/NotificationService.swift")
        XCTAssertTrue(extensionSource.contains("\"game_duo_invited\""))
        XCTAssertTrue(extensionSource.contains("\"game_duo_accepted\""))
    }
}
