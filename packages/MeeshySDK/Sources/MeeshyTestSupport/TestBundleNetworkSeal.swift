import Foundation
import MeeshySDK

/// Chaque bundle de test du package est scellé au réseau (#10854).
///
/// Le constructeur C de `MeeshyTestSupportLoader` appelle ce point d'entrée
/// quand dyld charge le bundle — avant la première classe de test, sans
/// qu'aucune ait à s'en souvenir. Seule levée nommée :
/// `TEST_RUNNER_MEESHY_TEST_LIVE_NETWORK=1`, comme pour l'app.
public enum TestBundleNetworkSeal {
    public static let liveNetworkOptInKey = "MEESHY_TEST_LIVE_NETWORK"

    public static func shouldSeal(environment: [String: String]) -> Bool {
        environment[liveNetworkOptInKey] != "1"
    }

    static func installUnlessOptedOut(environment: [String: String] = ProcessInfo.processInfo.environment) {
        guard shouldSeal(environment: environment) else { return }
        NetworkTransportSeal.install { request in
            let method = request.httpMethod ?? "GET"
            let target = "\(request.url?.host ?? "?")\(request.url?.path ?? "")"
            print("[network-seal] refused \(method) \(target)")
        }
    }
}

@_cdecl("meeshy_test_support_install")
public func meeshyTestSupportInstall() {
    TestBundleNetworkSeal.installUnlessOptedOut()
}
