import XCTest
import Combine
@testable import MeeshySDK

/// it.23 — `story:unreacted` est émis par le gateway (à la story room) mais n'avait
/// NI type NI publisher côté SDK (asymétrie avec `story:reacted`). On vérifie que le
/// nouveau payload décode et que le publisher existe (le routage `socket.on` est testé
/// implicitement par la compilation du listener qui le `send`).
final class StoryUnreactedDecodeTests: XCTestCase {

    func test_socketStoryUnreactedData_decodesFromGatewayPayload() throws {
        let json = #"{"storyId":"s1","userId":"u1","emoji":"❤️"}"#.data(using: .utf8)!
        let payload = try JSONDecoder().decode(SocketStoryUnreactedData.self, from: json)
        XCTAssertEqual(payload.storyId, "s1")
        XCTAssertEqual(payload.userId, "u1")
        XCTAssertEqual(payload.emoji, "❤️")
    }

    @MainActor
    func test_socialSocketManager_exposesStoryUnreactedPublisher() {
        // Le publisher doit exister + émettre (sinon `story:unreacted` resterait
        // sans abonné possible — la régression « callback non branché »).
        var received: SocketStoryUnreactedData?
        var bag = Set<AnyCancellable>()
        SocialSocketManager.shared.storyUnreacted
            .sink { received = $0 }
            .store(in: &bag)
        SocialSocketManager.shared.storyUnreacted.send(
            SocketStoryUnreactedData(storyId: "s1", userId: "u1", emoji: "👍"))
        XCTAssertEqual(received?.storyId, "s1")
        XCTAssertEqual(received?.emoji, "👍")
    }
}
