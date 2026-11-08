import Combine
import XCTest
@testable import MeeshySDK

private final class NowPlayingRegistrar: SocketEventRegistering {
    private var receivers: [String: ([Any]) -> Void] = [:]

    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void) {
        receivers[event] = receive
    }

    func deliver(_ event: String, _ payload: [String: Any]) {
        receivers[event]?([payload])
    }
}

/// `now-playing:changed` et `now-playing:cleared`, sur la room `user:<id>` (#13934, #16755) : ce qui arrive est ce que
/// la passerelle a servi À CE LECTEUR, et rien de plus.
final class NowPlayingSocketEventsTests: XCTestCase {

    private func installed() -> NowPlayingRegistrar {
        let registrar = NowPlayingRegistrar()
        registrar.install(MessageSocketRoutes.all(for: .shared))
        return registrar
    }

    private func expectValue<P: Publisher>(
        of publisher: P,
        where matches: @escaping (P.Output) -> Bool,
        after trigger: () -> Void
    ) async where P.Failure == Never {
        let published = expectation(description: "publication")
        let subscription = publisher.sink { if matches($0) { published.fulfill() } }
        trigger()
        await fulfillment(of: [published], timeout: 2)
        subscription.cancel()
    }

    private func decoded(_ json: String) -> NowPlayingChanged? {
        try? JSONDecoder().decode(NowPlayingChanged.self, from: Data(json.utf8))
    }

    func test_theWireNamesAreTheServerOnes() {
        XCTAssertEqual(SocketEvent.nowPlayingChanged.rawValue, "now-playing:changed")
        XCTAssertEqual(SocketEvent.nowPlayingCleared.rawValue, "now-playing:cleared")
    }

    func test_aSangReceivesTitleAndSource() async {
        let registrar = installed()
        let id = "u-\(UUID().uuidString)"
        await expectValue(of: NowPlayingEvents.changed, where: {
            $0.userId == id && $0.category == .music && $0.title == "Clair de lune" && $0.source == "Spotify"
        }) {
            registrar.deliver("now-playing:changed", [
                "userId": id, "category": "music", "title": "Clair de lune", "source": "Spotify",
                "updatedAt": "2026-11-08T10:00:00.000Z", "expiresAt": "2026-11-08T10:15:00.000Z",
            ])
        }
    }

    func test_aProcheReceivesTheCategoryAlone() async {
        let registrar = installed()
        let id = "u-\(UUID().uuidString)"
        await expectValue(of: NowPlayingEvents.changed, where: {
            $0.userId == id && $0.category == .video && $0.title == nil && $0.source == nil
        }) {
            registrar.deliver("now-playing:changed", [
                "userId": id, "category": "video",
                "updatedAt": "2026-11-08T10:00:00.000Z", "expiresAt": "2026-11-08T10:15:00.000Z",
            ])
        }
    }

    func test_clearedIsDelivered() async {
        let registrar = installed()
        let id = "u-\(UUID().uuidString)"
        await expectValue(of: NowPlayingEvents.cleared, where: { $0.userId == id }) {
            registrar.deliver("now-playing:cleared", ["userId": id])
        }
    }

    func test_aFieldBeyondTheContractNeverTravels_andASourceWithoutTitleIsDropped() {
        let extra = decoded("""
        {"userId":"u","category":"music","app":"com.spotify","position":42,
         "updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-08T10:15:00.000Z"}
        """)
        XCTAssertEqual(extra?.title, nil)
        XCTAssertEqual(extra?.source, nil)
        let orphan = decoded("""
        {"userId":"u","category":"music","source":"Spotify",
         "updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-08T10:15:00.000Z"}
        """)
        XCTAssertNotNil(orphan)
        XCTAssertNil(orphan?.source)
    }

    func test_anOverlongTitleIsNotShown_andAnUnknownCategoryIsRefused() {
        let long = String(repeating: "a", count: NowPlayingContract.titleMax + 1)
        let overlong = decoded("""
        {"userId":"u","category":"music","title":"\(long)","source":"Spotify",
         "updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-08T10:15:00.000Z"}
        """)
        XCTAssertNil(overlong?.title)
        XCTAssertNil(overlong?.source)
        XCTAssertNil(decoded("""
        {"userId":"u","category":"podcast","updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-08T10:15:00.000Z"}
        """))
    }

    func test_theLifetimeIsBoundedByTheContract() {
        let absurd = decoded("""
        {"userId":"u","category":"music","updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-09T10:00:00.000Z"}
        """)
        XCTAssertEqual(absurd?.lifetime, NowPlayingContract.ttl)
    }

    func test_anUnreadableSnapshotItemIsSkipped_notTheWholeSnapshot() throws {
        let snapshot = try JSONDecoder().decode(NowPlayingSnapshot.self, from: Data("""
        {"items":[
          {"userId":"a","category":"music","updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-08T10:15:00.000Z"},
          {"userId":"b","category":"podcast","updatedAt":"2026-11-08T10:00:00.000Z","expiresAt":"2026-11-08T10:15:00.000Z"}
        ]}
        """.utf8))
        XCTAssertEqual(snapshot.items.map(\.userId), ["a"])
    }
}
