import XCTest
import UIKit
@testable import Meeshy

/// #16418 — la note de consentement vocal disparaît dès le consentement donné :
/// le consentement se RELIT, sans réseau bloquant, et une relecture dépassée par
/// un octroi ne ressuscite pas la note.
@MainActor
final class VoiceConsentRefresherTests: XCTestCase {

    func test_refresh_knownGranted_publishesFalseAtOnce_withoutNetwork() {
        let gate = StubVoiceConsentGate(knownGranted: true, missing: true)
        let sut = VoiceConsentRefresher(gate: gate)
        var published: [Bool] = []

        let task = sut.refresh { published.append($0) }

        XCTAssertNil(task)
        XCTAssertEqual(published, [false])
        XCTAssertEqual(gate.fetchCount, 0)
    }

    func test_refresh_unknown_publishesTheFetchedAnswer() async {
        let gate = StubVoiceConsentGate(knownGranted: false, missing: true)
        let sut = VoiceConsentRefresher(gate: gate)
        var published: [Bool] = []

        await sut.refresh { published.append($0) }?.value

        XCTAssertEqual(published, [true])
    }

    func test_refresh_afterConsentGiven_clearsTheNotice() async {
        let gate = StubVoiceConsentGate(knownGranted: false, missing: true)
        let sut = VoiceConsentRefresher(gate: gate)
        var published: [Bool] = []
        await sut.refresh { published.append($0) }?.value

        gate.missing = false
        await sut.refresh { published.append($0) }?.value

        XCTAssertEqual(published, [true, false])
    }

    func test_refresh_supersededByAGrant_doesNotPublish() async {
        let gate = StubVoiceConsentGate(knownGranted: false, missing: true)
        let sut = VoiceConsentRefresher(gate: gate)
        var published: [Bool] = []

        let task = sut.refresh { published.append($0) }
        sut.supersede()
        await task?.value

        XCTAssertTrue(published.isEmpty, "un « manquant » lu avant l'octroi ne rallume pas la note")
    }

    func test_observeForeground_rereadsOnEachReturn_withASingleSubscription() {
        let center = NotificationCenter()
        let sut = VoiceConsentRefresher(gate: StubVoiceConsentGate(knownGranted: true, missing: false))
        var returns = 0
        sut.observeForeground(center) { returns += 1 }
        sut.observeForeground(center) { returns += 100 }

        center.post(name: UIApplication.willEnterForegroundNotification, object: nil)
        let drained = expectation(description: "main queue drained")
        DispatchQueue.main.async { drained.fulfill() }
        wait(for: [drained], timeout: 1)

        XCTAssertEqual(returns, 1)
    }
}

private final class StubVoiceConsentGate: VoiceConsentGateProviding {
    let knownGranted: Bool
    var missing: Bool
    private(set) var fetchCount = 0

    init(knownGranted: Bool, missing: Bool) {
        self.knownGranted = knownGranted
        self.missing = missing
    }

    var isKnownGranted: Bool { knownGranted }

    func fetchMissing() async -> Bool {
        fetchCount += 1
        return missing
    }

    func grant() async throws {}
}
