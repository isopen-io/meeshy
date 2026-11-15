import XCTest
@testable import MeeshySDK

/// #10321 (d) — une story rejouée depuis sa file porte la MÊME clé
/// d'idempotence : la passerelle reconnaît le rejeu et ne republie pas.
final class ClientMutationIdDerivedTests: XCTestCase {

    func test_storySlide_sameItemAndSlide_yieldsTheSameKey() {
        let first = ClientMutationId.storySlide(queueItemId: "item-1", slideId: "slide-a")
        let replay = ClientMutationId.storySlide(queueItemId: "item-1", slideId: "slide-a")

        XCTAssertEqual(first, replay)
    }

    func test_storySlide_anotherSlideOrItem_yieldsAnotherKey() {
        let key = ClientMutationId.storySlide(queueItemId: "item-1", slideId: "slide-a")

        XCTAssertNotEqual(key, ClientMutationId.storySlide(queueItemId: "item-1", slideId: "slide-b"))
        XCTAssertNotEqual(key, ClientMutationId.storySlide(queueItemId: "item-2", slideId: "slide-a"))
    }

    func test_derived_matchesTheGatewayContract() {
        let key = ClientMutationId.derived(from: "n'importe quelle graine")

        XCTAssertTrue(ClientMutationId.isValid(key), "la passerelle refuse une clé hors de `^cmid_<uuid>$` : \(key)")
    }
}
