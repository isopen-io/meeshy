import Foundation
@testable import MeeshySDK

/// Test double for `NetworkMonitorProviding`.
/// Lets tests force offline mode deterministically without real network events.
final class MockNetworkMonitor: NetworkMonitorProviding, @unchecked Sendable {
    var isOnline: Bool = true
}
