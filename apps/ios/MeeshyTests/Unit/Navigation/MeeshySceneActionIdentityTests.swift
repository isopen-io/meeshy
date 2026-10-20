import XCTest
@testable import Meeshy

/// Ouvrir une conversation figeait l'app (0x8BADF00D, 2026-10-20) : le champ du
/// composer publiait une action neuve, jamais égale à la précédente, à chaque
/// rendu ; la barre de menus se reconstruisait, le composer se réévaluait, et
/// une nouvelle action repartait.
@MainActor
final class MeeshySceneActionIdentityTests: XCTestCase {

    func test_actionsOfTheSameOwner_areEqual_soARenderPublishesNoChange() {
        let relay = ComposerSendRelay()
        XCTAssertEqual(MeeshySceneAction(owner: relay, perform: {}),
                       MeeshySceneAction(owner: relay, perform: {}))
    }

    func test_actionsOfTwoComposers_differ_soTheMenuFollowsTheFocusedOne() {
        XCTAssertNotEqual(MeeshySceneAction(owner: ComposerSendRelay(), perform: {}),
                          MeeshySceneAction(owner: ComposerSendRelay(), perform: {}))
    }

    func test_anActionWithoutOwner_isNeverEqual() {
        XCTAssertNotEqual(MeeshySceneAction(perform: {}), MeeshySceneAction(perform: {}))
    }

    func test_theRelay_sendsWithTheLatestClosure() {
        let relay = ComposerSendRelay()
        var sent: [String] = []
        relay.send = { sent.append("ancien") }
        let published = relay.action
        relay.send = { sent.append("récent") }
        published.perform()
        XCTAssertEqual(sent, ["récent"])
    }
}
