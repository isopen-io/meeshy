import Foundation
import MeeshyUI

@MainActor
protocol HapticSurfacing: AnyObject {
    func success()
    func error()
}

@MainActor
final class HapticBridge: HapticSurfacing {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = HapticBridge()

    func success() { HapticFeedback.success() }
    func error()   { HapticFeedback.error() }
}
