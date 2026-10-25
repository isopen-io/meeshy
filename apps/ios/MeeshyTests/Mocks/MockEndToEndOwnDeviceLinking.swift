import Foundation
@_spi(Testing) import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Un double de l'appairage de mes appareils (#13009) : des `Result` à
/// rejouer et un compteur par appel.
nonisolated final class MockEndToEndOwnDeviceLinking: EndToEndOwnDeviceLinking, @unchecked Sendable {
    private let lock = NSLock()

    var devicesResult: Result<[EndToEndOwnDevice], any Error> = .success([])
    var codeResult: Result<E2EEPairingCode, any Error> = .success(E2EEPairingCode(deviceId: 2, displayable: String(repeating: "0123456789", count: 6), qrPayload: "meeshy-device-link:v1:AAAA"))
    var candidateResult: Result<E2EEPairingCandidate?, any Error> = .success(nil)
    var approveError: (any Error)?
    var revokeError: (any Error)?
    var retireError: (any Error)?

    /// Vrai : `candidate` attend `releaseCandidate()` — pour deux lectures simultanées.
    var holdsCandidate = false
    private var held: CheckedContinuation<Void, Never>?
    private var asked: CheckedContinuation<Void, Never>?
    private var wasAsked = false

    private(set) var listCallCount = 0
    private(set) var codeRequests: [UInt32] = []
    private(set) var scannedPayloads: [String] = []
    private(set) var approved: [E2EEPairingCandidate] = []
    private(set) var revoked: [UInt32] = []
    private(set) var retired: [UInt32] = []

    func linkedDevices(of userId: String) async throws -> [EndToEndOwnDevice] {
        lock.withLock { listCallCount += 1 }
        return try devicesResult.get()
    }

    func pairingCode(towards deviceId: UInt32, as userId: String) async throws -> E2EEPairingCode {
        lock.withLock { codeRequests.append(deviceId) }
        return try codeResult.get()
    }

    func candidate(matching payload: String, as userId: String) async throws -> E2EEPairingCandidate? {
        lock.withLock { scannedPayloads.append(payload) }
        if holdsCandidate {
            await withCheckedContinuation { continuation in
                lock.withLock {
                    held = continuation
                    wasAsked = true
                    asked?.resume()
                    asked = nil
                }
            }
        }
        return try candidateResult.get()
    }

    func waitUntilACandidateIsAsked() async {
        await withCheckedContinuation { continuation in
            lock.withLock {
                if wasAsked { continuation.resume() } else { asked = continuation }
            }
        }
    }

    func releaseCandidate() {
        lock.withLock {
            held?.resume()
            held = nil
        }
    }

    func approve(_ candidate: E2EEPairingCandidate, as userId: String) async throws {
        if let approveError { throw approveError }
        lock.withLock { approved.append(candidate) }
    }

    func revokeApproval(of deviceId: UInt32, as userId: String) async throws {
        if let revokeError { throw revokeError }
        lock.withLock { revoked.append(deviceId) }
    }

    func retire(deviceId: UInt32) async throws {
        if let retireError { throw retireError }
        lock.withLock { retired.append(deviceId) }
    }
}
