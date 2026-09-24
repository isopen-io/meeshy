import Foundation
import MeeshySDK
@testable import Meeshy

final class MockOnboardingService: OnboardingServiceProviding, @unchecked Sendable {
    struct Recorded: Equatable {
        let step: OnboardingStepId
        let outcome: OnboardingStepOutcome
    }

    var fetchStateResult: Result<APIOnboardingState, Error> = .failure(URLError(.badServerResponse))
    var recordResult: Result<Void, Error> = .success(())
    var finishResult: Result<Void, Error> = .success(())

    private(set) var fetchStateCallCount = 0
    private(set) var recorded: [Recorded] = []
    private(set) var finishCallCount = 0

    func fetchState() async throws -> APIOnboardingState {
        fetchStateCallCount += 1
        return try fetchStateResult.get()
    }

    func record(step: OnboardingStepId, outcome: OnboardingStepOutcome) async throws -> APIOnboardingState {
        recorded.append(Recorded(step: step, outcome: outcome))
        try recordResult.get()
        return try fetchStateResult.get()
    }

    func finish() async throws -> APIOnboardingState {
        finishCallCount += 1
        try finishResult.get()
        return try fetchStateResult.get()
    }

    func reset() {
        fetchStateResult = .failure(URLError(.badServerResponse))
        recordResult = .success(())
        finishResult = .success(())
        fetchStateCallCount = 0
        recorded = []
        finishCallCount = 0
    }
}

@MainActor
final class MockOnboardingNotificationPermission: OnboardingNotificationPermitting {
    nonisolated deinit {}

    var status: OnboardingNotificationStatus = .notDetermined
    var requestResult = true
    private(set) var requestCallCount = 0

    func currentStatus() async -> OnboardingNotificationStatus {
        status
    }

    func request() async -> Bool {
        requestCallCount += 1
        return requestResult
    }

    func reset() {
        status = .notDetermined
        requestResult = true
        requestCallCount = 0
    }
}

final class MockOnboardingSettledStore: OnboardingSettledStoring, @unchecked Sendable {
    private(set) var settledUserIds: Set<String> = []

    func isSettled(userId: String) -> Bool {
        settledUserIds.contains(userId)
    }

    func markSettled(userId: String) {
        settledUserIds.insert(userId)
    }
}
