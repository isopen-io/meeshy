import Foundation
import Combine
@testable import MeeshySDK

/// Test double for `NetworkMonitorProviding`. Lets tests force the
/// online/offline state deterministically without driving the real
/// `NWPathMonitor` underneath `NetworkMonitor.shared`.
///
/// Mirrors `MockNetworkMonitor` (timeline SDK tests) but lives under the
/// app's MeeshyTests target so `ConversationViewModel` tests can inject
/// it without crossing the SDK boundary.
final class FakeNetworkMonitor: NetworkMonitorProviding, @unchecked Sendable {
    var isOnline: Bool

    init(isOnline: Bool = true) {
        self.isOnline = isOnline
    }
}
