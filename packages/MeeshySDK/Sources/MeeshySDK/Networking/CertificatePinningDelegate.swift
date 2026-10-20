import Foundation
import Security
import os

// MARK: - Certificate Pinning

private let pinLogger = MeeshyLog.logger(.tlsPinning, subsystem: .sdk)

final class CertificatePinningDelegate: NSObject, URLSessionDelegate, Sendable {

    // Log at most once per process lifetime that pinning is unconfigured. A
    // check-then-set race is acceptable here: the worst outcome is two log
    // entries, never a crash. `nonisolated(unsafe)` is required because Swift 6
    // treats mutable static stored properties as data-race-unsafe by default.
    private nonisolated(unsafe) static var didWarnUnconfigured = false

    private let pinSetProvider: @Sendable () -> Set<String>
    private let pinnedHostProvider: @Sendable () -> String

    /// Production initializer — reads pins + host from ``MeeshyConfig``.
    override convenience init() {
        self.init(
            pinSetProvider: { MeeshyConfig.shared.certificatePins },
            pinnedHostProvider: {
                URL(string: MeeshyConfig.shared.apiBaseURL)?.host ?? "gate.meeshy.me"
            }
        )
    }

    /// Designated initializer — exposed so tests can supply deterministic
    /// providers and assert pin-set wiring.
    init(
        pinSetProvider: @escaping @Sendable () -> Set<String>,
        pinnedHostProvider: @escaping @Sendable () -> String
    ) {
        self.pinSetProvider = pinSetProvider
        self.pinnedHostProvider = pinnedHostProvider
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        let pinnedHost = pinnedHostProvider()
        guard let serverTrust = challenge.protectionSpace.serverTrust,
              challenge.protectionSpace.host == pinnedHost else {
            return (.performDefaultHandling, nil)
        }

        let policies = [SecPolicyCreateSSL(true, pinnedHost as CFString)]
        SecTrustSetPolicies(serverTrust, policies as CFArray)

        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            pinLogger.fault("TLS chain rejected for \(pinnedHost, privacy: .public) — system validation failed")
            return (.cancelAuthenticationChallenge, nil)
        }

        let pinSet = pinSetProvider()
        let chain = (SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate]) ?? []
        switch CertificatePinning.evaluate(chain: chain, against: pinSet) {
        case .unconfigured:
            #if !DEBUG
            if !Self.didWarnUnconfigured {
                Self.didWarnUnconfigured = true
                pinLogger.fault("TLS pinning not configured for \(pinnedHost, privacy: .public) — system chain only. Populate MeeshyConfig.certificatePins before production to prevent MITM.")
            }
            #endif
            return (.useCredential, URLCredential(trust: serverTrust))
        case .matched:
            return (.useCredential, URLCredential(trust: serverTrust))
        case .mismatch:
            pinLogger.fault("SPKI pin mismatch for \(pinnedHost, privacy: .public) — refusing to connect (no chain cert matched \(pinSet.count, privacy: .public) pins)")
            return (.cancelAuthenticationChallenge, nil)
        case .chainUnreadable:
            pinLogger.fault("SPKI pin check could not read chain for \(pinnedHost, privacy: .public) — refusing to connect")
            return (.cancelAuthenticationChallenge, nil)
        }
    }
}
