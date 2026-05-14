import Foundation
import MeeshyUI

@MainActor
protocol HapticSurfacing: AnyObject {
    func success()
    func error()
}

@MainActor
final class HapticBridge: HapticSurfacing {
    static let shared = HapticBridge()

    func success() { HapticFeedback.success() }
    func error()   { HapticFeedback.error() }
}
