import Combine
import Foundation
import MeeshySDK
@testable import Meeshy

/// `BatteryServiceProviding` en mémoire : chaque route rend ce qu'on lui a dit et compte ses appels.
final class MockBatteryService: BatteryServiceProviding, @unchecked Sendable {
    private let lock = NSLock()

    var snapshotResult: Result<[BatteryReaderState], Error> = .success([])
    var stateResult: Result<BatteryReaderState?, Error> = .success(nil)
    var pullResult: BatteryPullOutcome = .requested(at: Date(timeIntervalSince1970: 0))
    var personSettingsResult: Result<BatteryPersonSettings, Error> = .success(
        BatteryPersonSettings(userId: "peer", isShared: false, receive: .all)
    )
    var updatePersonSettingsResult: Result<BatteryPersonSettings, Error>?
    var emitterSettingsResult: Result<BatteryEmitterSettings, Error> = .success(BatteryEmitterSettings(sharingEnabled: true))
    var updateEmitterSettingsResult: Result<BatteryEmitterSettings, Error>?
    var reportResult: BatteryReportOutcome = .tracked

    private(set) var pullCallCount = 0
    private(set) var updatePersonSettingsCalls: [BatteryPersonSettingsUpdate] = []
    private(set) var updateEmitterSettingsCalls: [Bool] = []

    func snapshot() async throws -> [BatteryReaderState] { try snapshotResult.get() }

    func state(userId: String) async throws -> BatteryReaderState? { try stateResult.get() }

    func pull(userId: String) async -> BatteryPullOutcome {
        lock.withLock { pullCallCount += 1 }
        return pullResult
    }

    func personSettings(userId: String) async throws -> BatteryPersonSettings { try personSettingsResult.get() }

    func updatePersonSettings(userId: String, _ update: BatteryPersonSettingsUpdate) async throws -> BatteryPersonSettings {
        lock.withLock { updatePersonSettingsCalls.append(update) }
        if let updatePersonSettingsResult { return try updatePersonSettingsResult.get() }
        let current = try personSettingsResult.get()
        return BatteryPersonSettings(userId: userId, isShared: update.isShared ?? current.isShared, receive: update.receive ?? current.receive)
    }

    func emitterSettings() async throws -> BatteryEmitterSettings { try emitterSettingsResult.get() }

    func updateEmitterSettings(sharingEnabled: Bool) async throws -> BatteryEmitterSettings {
        lock.withLock { updateEmitterSettingsCalls.append(sharingEnabled) }
        if let updateEmitterSettingsResult { return try updateEmitterSettingsResult.get() }
        return BatteryEmitterSettings(sharingEnabled: sharingEnabled)
    }

    func report(_ report: BatteryReport) async -> BatteryReportOutcome { reportResult }
}

/// `BatteryReportingProviding` qui ne lit aucun appareil.
@MainActor
final class MockBatteryReporter: BatteryReportingProviding {
    var isAvailable = true
    var reportNowResult: BatteryReportOutcome = .tracked
    private(set) var startCallCount = 0
    private(set) var stopCallCount = 0
    private(set) var reportNowCallCount = 0

    nonisolated deinit {}

    func start() { startCallCount += 1 }
    func stop() { stopCallCount += 1 }

    func reportNow() async -> BatteryReportOutcome {
        reportNowCallCount += 1
        return reportNowResult
    }
}

/// La persistance du store, en mémoire.
final class MemoryBatteryStatePersistence: BatteryStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [BatteryReaderState] = []

    func load() -> [BatteryReaderState] { lock.withLock { stored } }
    func save(_ states: [BatteryReaderState]) { lock.withLock { stored = states } }
}

/// La mémoire de l'offre de partage, en mémoire.
@MainActor
final class MemoryBatteryConsent: BatteryConsentRemembering {
    private(set) var offered: Set<String> = []

    nonisolated deinit {}

    func wasOffered(viewerId: String, peerId: String) -> Bool { offered.contains("\(viewerId)|\(peerId)") }
    func markOffered(viewerId: String, peerId: String) { offered.insert("\(viewerId)|\(peerId)") }
}
