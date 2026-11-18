import XCTest
@testable import MeeshySDK

/// `LocationGhostService` (#19469) — le fantôme global, hors drapeau Sang. La passerelle fait foi
/// (`services/gateway/src/routes/me/location-ghost.ts`).
final class LocationGhostServiceTests: XCTestCase {

    private func makeSUT() -> (service: LocationGhostService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (LocationGhostService(api: api), api)
    }

    func test_setGhost_putsOnlyTheGhostKey_andReadsTheStateTheServerSet() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/location/ghost", json: #"{"success":true,"data":{"ghost":true,"ghostAt":"2026-11-17T08:00:00.000Z"}}"#)

        let state = try await service.setGhost(true)

        XCTAssertEqual(state, LocationGhostState(ghost: true))
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.endpoint, "/me/location/ghost")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["ghost"])
        XCTAssertEqual(api.lastRequest?.bodyJSON?["ghost"] as? Bool, true)
    }

    func test_setGhost_leavingTheGhost_readsAFalseStateWithANullDate() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/location/ghost", json: #"{"success":true,"data":{"ghost":false,"ghostAt":null}}"#)

        let state = try await service.setGhost(false)

        XCTAssertFalse(state.ghost)
        XCTAssertEqual(api.lastRequest?.bodyJSON?["ghost"] as? Bool, false)
    }

    func test_setGhost_anUnreadableAnswer_isAnError_soTheHostUndoesItsGesture() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/location/ghost", json: #"{"success":true,"data":{"ghost":"yes"}}"#)

        do {
            _ = try await service.setGhost(true)
            XCTFail("une réponse illisible ne doit pas passer pour un réglage")
        } catch {}
    }
}
