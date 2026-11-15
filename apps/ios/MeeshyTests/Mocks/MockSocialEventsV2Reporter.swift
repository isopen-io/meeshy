import Foundation
import MeeshySDK
@testable import Meeshy

/// Un rapporteur v2 qui RETIENT ce qu'on lui confie, sans file ni réseau.
@MainActor
final class MockSocialEventsV2Reporter: SocialEventsV2Reporting {
    nonisolated deinit {}

    private(set) var emitted: [SocialEventV2] = []
    private(set) var flushCount = 0

    func emit(_ event: SocialEventV2) { emitted.append(event) }
    func flushNow() async { flushCount += 1 }

    var actions: [String] { emitted.map(\.action) }

    func payloads<T>(_ extract: (SocialEventV2Payload) -> T?) -> [T] {
        emitted.compactMap { extract($0.payload) }
    }
}
