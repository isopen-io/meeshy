import Foundation
import MeeshySDK
@testable import Meeshy

final class MockBringService: BringProviding, @unchecked Sendable {
    init() {}

    var availabilityResult: Result<BringAvailability, Error> = .failure(NSError(domain: "MockBringService", code: 0))
    var sendOutcome: BringSendOutcome = .failed
    var stopError: Error?
    var settingsResult: Result<RelationPersonSettings, Error> = .failure(NSError(domain: "MockBringService", code: 0))
    var setBlockedResult: Result<RelationPersonSettings, Error> = .failure(NSError(domain: "MockBringService", code: 0))

    private(set) var sentTo: [String] = []
    private(set) var stopped: [String] = []
    private(set) var blockedWrites: [Bool] = []

    func availability(userId: String) async throws -> BringAvailability {
        try availabilityResult.get()
    }

    func send(userId: String) async -> BringSendOutcome {
        sentTo.append(userId)
        return sendOutcome
    }

    func stop(bringId: String) async throws {
        stopped.append(bringId)
        if let stopError { throw stopError }
    }

    func personSettings(userId: String) async throws -> RelationPersonSettings {
        try settingsResult.get()
    }

    func setBringBlocked(userId: String, blocked: Bool) async throws -> RelationPersonSettings {
        blockedWrites.append(blocked)
        return try setBlockedResult.get()
    }
}

@MainActor
final class FakeBringRinger: BringRinging {
    private(set) var starts = 0
    private(set) var stops = 0
    var isRinging: Bool { starts > stops }

    nonisolated deinit {}

    func startRinging() { starts += 1 }
    func stopRinging() { stops += 1 }
}
