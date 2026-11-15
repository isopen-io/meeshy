import Foundation
@testable import Meeshy

/// Un double d'AlarmKit : il note ce qu'on lui demande et répond ce qu'on lui a dit.
actor MockBringAlarmScheduler: BringAlarmScheduling {
    private(set) var scheduled: [BringAlarmPlan.Request] = []
    private(set) var cancelled: [String] = []
    private(set) var authorizationRequests = 0
    private var state: BringAlarmAuthorization
    private let grants: BringAlarmAuthorization

    init(state: BringAlarmAuthorization = .authorized, grants: BringAlarmAuthorization = .authorized) {
        self.state = state
        self.grants = grants
    }

    func authorization() -> BringAlarmAuthorization { state }

    func requestAuthorization() -> BringAlarmAuthorization {
        authorizationRequests += 1
        state = grants
        return state
    }

    func schedule(_ request: BringAlarmPlan.Request) -> Bool {
        scheduled.append(request)
        return true
    }

    func cancel(bringId: String) {
        cancelled.append(bringId)
    }
}
