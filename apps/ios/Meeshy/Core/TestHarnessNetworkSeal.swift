import Foundation
import os
import MeeshySDK

/// **Sous XCTest, aucune requête ne quitte le processus** (#10854).
///
/// `MeeshyTests` est hébergé par l'app : il hérite de son environnement
/// serveur. Le simulateur pointant la production, une suite écrivait au nom
/// du compte connecté — 213 `POST /reactions` aux ids de fixture, 2 441
/// `POST /conversations` en une semaine. La garde est STRUCTURELLE, posée
/// avant que l'app ne démarre, pour qu'aucun test n'ait à s'en souvenir.
///
/// Le MÉCANISME est `NetworkTransportSeal` (SDK, partagé avec les bundles de
/// test du package par `MeeshyTestSupport`) — `URLSession.shared`, toute
/// session `.default` / `.ephemeral`, et `SocketConfig.sealTransport()`.
/// L'app n'en garde que la DÉCISION : sous XCTest, sauf levée nommée.
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

    static var isInstalled: Bool { NetworkTransportSeal.isInstalled }

    static func installIfUnderTestHarness(environment: [String: String] = ProcessInfo.processInfo.environment) {
        guard shouldSeal(environment: environment) else { return }
        NetworkTransportSeal.install { request in
            let method = request.httpMethod ?? "GET"
            let target = "\(request.url?.host ?? "?")\(request.url?.path ?? "")"
            logger.notice("refused \(method, privacy: .public) \(target, privacy: .public)")
        }
        logger.notice("network seal installed — every http(s) request is refused under XCTest")
    }

    /// `log stream --predicate 'category == "test-network-seal"'`
    private static let logger = MeeshyLog.logger(.testNetworkSeal)
}
