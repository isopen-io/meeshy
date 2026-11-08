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
    private(set) var blockedSettings: [RelationReceptionSetting] = []
    private(set) var grantWrites: [Bool] = []
    private(set) var grantedShares: [RelationShareGrant] = []

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

    func setReceptionBlocked(_ setting: RelationReceptionSetting, userId: String, blocked: Bool) async throws -> RelationPersonSettings {
        blockedSettings.append(setting)
        blockedWrites.append(blocked)
        return try setBlockedResult.get()
    }

    func setShareGranted(_ grant: RelationShareGrant, userId: String, granted: Bool) async throws -> RelationPersonSettings {
        grantedShares.append(grant)
        grantWrites.append(granted)
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

@MainActor
final class FakeTalkieSink: TalkieSink {
    struct Played: Equatable {
        let talkieId: String
        let data: Data
    }

    private(set) var prepared: [String] = []
    private(set) var played: [Played] = []
    private(set) var silenced: [String] = []
    private(set) var released: [String] = []

    nonisolated deinit {}

    func prepare(_ talkieId: String) { prepared.append(talkieId) }
    func play(_ talkieId: String, _ data: Data) { played.append(Played(talkieId: talkieId, data: data)) }
    func silence(_ talkieId: String) { silenced.append(talkieId) }
    func release(_ talkieId: String) { released.append(talkieId) }
}
