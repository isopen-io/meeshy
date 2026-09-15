import SwiftUI

nonisolated enum LaunchSplashTiming {
    static let floor: Duration = .milliseconds(400)
    static let ceiling: Duration = .seconds(2)
    static let fade: Duration = .milliseconds(300)
}

nonisolated enum LaunchBootStep: String, Sendable, Equatable {
    case cache
    case outbox
    case settingsQueue
    case session
    case conversationList
}

@MainActor
final class LaunchSplashController: ObservableObject {
    enum Phase: Equatable {
        case covering
        case fading
        case gone
    }

    enum Reveal: Equatable {
        case ready
        case ceiling(pendingStep: LaunchBootStep?)
    }

    @Published private(set) var phase: Phase = .covering
    private(set) var reveal: Reveal?

    init(elapsed: (() -> Duration)? = nil,
         sleep: ((Duration) async throws -> Void)? = nil) {}

    func reach(_ step: LaunchBootStep) {}

    func markReady() async {}

    func holdUntilCeiling() async {}
}
