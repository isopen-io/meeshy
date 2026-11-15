import Combine
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ComposerMentionControllerBoxTests: XCTestCase {

    private func candidate(_ id: String, _ username: String) -> MentionCandidate {
        MentionCandidate(id: id, username: username, displayName: username.capitalized, avatarURL: nil)
    }

    func test_loadCandidates_readsTheCacheOnly_withoutWarming() async {
        let contacts = MockMentionContacts(cached: [candidate("c1", "alice")])
        let box = ComposerMentionControllerBox(contacts: contacts)

        await box.loadCandidates()

        XCTAssertEqual(contacts.loadCachedCallCount, 1)
        XCTAssertEqual(contacts.refreshCallCount, 0, "le montage lit le cache ; le réseau attend le `@`")
    }

    func test_controller_bareAt_servesTheCachedContactsImmediately() async {
        let contacts = MockMentionContacts(cached: [candidate("c1", "alice")])
        let box = ComposerMentionControllerBox(contacts: contacts)
        await box.loadCandidates()

        box.controller.handleQuery(in: "@")

        XCTAssertEqual(box.controller.suggestions.map(\.username), ["alice"])
    }

    func test_box_forwardsControllerObjectWillChange_toItsOwnPublisher() {
        let box = ComposerMentionControllerBox(contacts: MockMentionContacts())
        var received = 0
        let cancellable = box.objectWillChange.sink { _ in received += 1 }

        box.controller.handleQuery(in: "@")

        XCTAssertGreaterThan(received, 0, "sans relais, la bande n'apparaît qu'à la frappe suivante")
        cancellable.cancel()
    }
}
