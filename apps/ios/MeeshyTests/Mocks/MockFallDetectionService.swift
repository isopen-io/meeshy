import Foundation
import MeeshySDK
@testable import Meeshy

/// `FallDetectionServiceProviding` en mémoire : chaque route rend ce qu'on lui a dit et compte ses appels.
final class MockFallDetectionService: FallDetectionServiceProviding, @unchecked Sendable {
    private let lock = NSLock()

    var reportResults: [FallReportOutcome] = []
    var answerOkResult = true
    var consentSettingsResult: Result<FallConsentSettings, Error> = .success(
        FallConsentSettings(consentedAt: nil, consentVersion: nil, currentVersion: "2026-11-19")
    )
    var updateConsentResult: FallConsentOutcome?
    var snapshotResult: Result<[FallState], Error> = .success([])
    var personSettingsResult: Result<FallPersonSettings, Error> = .success(FallPersonSettings(userId: "peer", isShared: true))
    var updatePersonSettingsResult: Result<FallPersonSettings, Error>?

    private var reports: [Date] = []
    private var consentUpdates: [FallConsentUpdate] = []
    private var answers = 0
    private var personUpdates: [Bool] = []

    var reportCalls: [Date] { lock.withLock { reports } }
    var updateConsentCalls: [FallConsentUpdate] { lock.withLock { consentUpdates } }
    var answerOkCount: Int { lock.withLock { answers } }
    var updatePersonSettingsCalls: [Bool] { lock.withLock { personUpdates } }

    func report(detectedAt: Date) async -> FallReportOutcome {
        lock.withLock {
            reports.append(detectedAt)
            return reportResults.isEmpty ? .recorded : reportResults.removeFirst()
        }
    }

    func answerOk() async -> Bool {
        lock.withLock {
            answers += 1
            return answerOkResult
        }
    }

    func consentSettings() async throws -> FallConsentSettings { try consentSettingsResult.get() }

    func updateConsent(_ update: FallConsentUpdate) async -> FallConsentOutcome {
        lock.withLock { consentUpdates.append(update) }
        if let updateConsentResult { return updateConsentResult }
        let version = update.version
        return .saved(FallConsentSettings(consentedAt: version == nil ? nil : Date(), consentVersion: version, currentVersion: "2026-11-19"))
    }

    func snapshot() async throws -> [FallState] { try snapshotResult.get() }

    func personSettings(userId: String) async throws -> FallPersonSettings { try personSettingsResult.get() }

    func updatePersonSettings(userId: String, isShared: Bool) async throws -> FallPersonSettings {
        lock.withLock { personUpdates.append(isShared) }
        if let updatePersonSettingsResult { return try updatePersonSettingsResult.get() }
        return FallPersonSettings(userId: userId, isShared: isShared)
    }
}

/// La source HealthKit, en mémoire : elle compte ses démarrages, ses arrêts, et livre à la demande.
@MainActor
final class FakeFallSampleSource: FallSampleSourcing {
    var isAvailable = true
    var authorizationGranted = true
    private(set) var authorizationRequests = 0
    private(set) var startedAccounts: [String] = []
    private(set) var stopCount = 0
    private var deliver: (@MainActor ([Date]) async -> Bool)?

    nonisolated deinit {}

    func requestAuthorization() async -> Bool {
        authorizationRequests += 1
        return authorizationGranted
    }

    func start(accountId: String, deliver: @escaping @MainActor ([Date]) async -> Bool) {
        startedAccounts.append(accountId)
        self.deliver = deliver
    }

    func stop() {
        stopCount += 1
        deliver = nil
    }

    var isObserving: Bool { deliver != nil }

    /// Ce que HealthKit livrerait : rend `true` quand l'ancre aurait avancé.
    func emit(_ samples: [Date]) async -> Bool {
        guard let deliver else { return false }
        return await deliver(samples)
    }
}

/// La persistance du store des chutes, en mémoire.
final class MemoryFallStatePersistence: FallStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [FallState] = []

    var saved: [FallState] { lock.withLock { stored } }
    func load() -> [FallState] { lock.withLock { stored } }
    func save(_ states: [FallState]) { lock.withLock { stored = states } }
}
