import Foundation
import ObjectiveC
import os
import MeeshySDK

/// **Sous XCTest, aucune requête ne quitte le processus** (#10854).
///
/// `MeeshyTests` est hébergé par l'app : il hérite de son environnement
/// serveur. Le simulateur pointant la production, une suite écrivait au nom
/// du compte connecté — 213 `POST /reactions` aux ids de fixture, 2 441
/// `POST /conversations` en une semaine. La garde est STRUCTURELLE, posée
/// avant que l'app ne démarre, pour qu'aucun test n'ait à s'en souvenir :
///
/// - HTTP(S) : `URLSession.shared` (`registerClass`) ET toute session bâtie
///   sur `.default` / `.ephemeral` (les deux constructeurs reçoivent
///   `TestHarnessRequestRefusal` en tête de `protocolClasses`). Un test qui
///   pose SON `URLProtocol` dans sa configuration le garde : il remplace la
///   liste, ou s'y insère devant.
/// - Socket.IO : `SocketConfig.sealTransport()` — les trois constructions de
///   socket se heurtent à une base absente et n'ouvrent rien.
///
/// Seule exception, nommée : la phase 3 de `meeshy.sh test`
/// (`ZZEndStateConnectedSessionTests`, login réel voulu) passe
/// `TEST_RUNNER_MEESHY_TEST_LIVE_NETWORK=1`.
nonisolated enum TestHarnessNetworkSeal {
    static let liveNetworkOptInKey = "MEESHY_TEST_LIVE_NETWORK"

    static func shouldSeal(environment: [String: String]) -> Bool {
        AppDatabase.runsUnderTestHarness(environment: environment)
            && environment[liveNetworkOptInKey] != "1"
    }

    private static let installed = OSAllocatedUnfairLock(initialState: false)

    static var isInstalled: Bool { installed.withLock { $0 } }

    static func installIfUnderTestHarness(environment: [String: String] = ProcessInfo.processInfo.environment) {
        guard shouldSeal(environment: environment) else { return }
        let firstInstall = installed.withLock { alreadyInstalled -> Bool in
            defer { alreadyInstalled = true }
            return !alreadyInstalled
        }
        guard firstInstall else { return }
        URLProtocol.registerClass(TestHarnessRequestRefusal.self)
        URLSessionConfiguration.exchangeClassGetter(
            "defaultSessionConfiguration", with: #selector(URLSessionConfiguration.meeshy_sealedDefault)
        )
        URLSessionConfiguration.exchangeClassGetter(
            "ephemeralSessionConfiguration", with: #selector(URLSessionConfiguration.meeshy_sealedEphemeral)
        )
        SocketConfig.sealTransport()
        TestHarnessRequestRefusal.logger.notice("network seal installed — every http(s) request is refused under XCTest")
    }
}

/// Refuse toute requête http(s) qui lui parvient, la COMPTE et la journalise
/// (`log stream --predicate 'category == "test-network-seal"'`).
nonisolated final class TestHarnessRequestRefusal: URLProtocol, @unchecked Sendable {
    static let logger = Logger(subsystem: "me.meeshy.app", category: "test-network-seal")
    private static let refusals = OSAllocatedUnfairLock(initialState: 0)

    static var refusedCount: Int { refusals.withLock { $0 } }

    override class func canInit(with request: URLRequest) -> Bool {
        guard let scheme = request.url?.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }

    override class func canInit(with task: URLSessionTask) -> Bool {
        guard let request = task.currentRequest ?? task.originalRequest else { return false }
        return canInit(with: request)
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.refusals.withLock { $0 += 1 }
        let method = request.httpMethod ?? "GET"
        let target = "\(request.url?.host ?? "?")\(request.url?.path ?? "")"
        Self.logger.notice("refused \(method, privacy: .public) \(target, privacy: .public)")
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
    }

    override func stopLoading() {}
}

extension URLSessionConfiguration {
    nonisolated static func exchangeClassGetter(_ original: String, with replacement: Selector) {
        guard let originalMethod = class_getClassMethod(self, NSSelectorFromString(original)),
              let replacementMethod = class_getClassMethod(self, replacement) else { return }
        method_exchangeImplementations(originalMethod, replacementMethod)
    }

    /// Après l'échange, `meeshy_sealedDefault()` appelle l'implémentation
    /// ORIGINALE de `+defaultSessionConfiguration`.
    @objc nonisolated class func meeshy_sealedDefault() -> URLSessionConfiguration {
        meeshy_sealedDefault().refusingRequests()
    }

    @objc nonisolated class func meeshy_sealedEphemeral() -> URLSessionConfiguration {
        meeshy_sealedEphemeral().refusingRequests()
    }

    nonisolated private func refusingRequests() -> URLSessionConfiguration {
        protocolClasses = [TestHarnessRequestRefusal.self] + (protocolClasses ?? [])
        return self
    }
}
