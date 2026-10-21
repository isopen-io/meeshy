import Foundation
import ObjectiveC
import os

/// Ferme le processus au réseau : plus aucune requête http(s), plus aucune
/// socket (#10854).
///
/// Le SDK fournit le MÉCANISME, jamais la décision : rien ici ne sait s'il
/// tourne sous test. L'app le pose sous XCTest (`TestHarnessNetworkSeal`),
/// la cible `MeeshyTestSupport` le pose pour chaque bundle de test du package.
///
/// - `URLSession.shared` : `RequestRefusalProtocol` est enregistré.
/// - toute session bâtie sur `.default` / `.ephemeral` : les deux
///   constructeurs le reçoivent en tête de `protocolClasses`. Le moteur de
///   Socket.IO interroge par une session `.default` : ses requêtes tombent
///   ici aussi.
/// - `SocketConfig.sealTransport()` : aucune socket ne s'arme.
///
/// Un appelant qui pose SON `URLProtocol` dans sa configuration le garde : il
/// remplace la liste, ou s'y insère devant. Irréversible pour la vie du
/// processus.
public enum NetworkTransportSeal {
    public typealias RefusalObserver = @Sendable (URLRequest) -> Void

    private static let state = OSAllocatedUnfairLock<RefusalObserver?>(initialState: nil)
    private static let installed = OSAllocatedUnfairLock(initialState: false)
    private static let refusals = OSAllocatedUnfairLock(initialState: 0)

    public static var isInstalled: Bool { installed.withLock { $0 } }

    public static var refusedCount: Int { refusals.withLock { $0 } }

    public static func install(onRefusal: RefusalObserver? = nil) {
        let firstInstall = installed.withLock { alreadyInstalled -> Bool in
            defer { alreadyInstalled = true }
            return !alreadyInstalled
        }
        guard firstInstall else { return }
        state.withLock { $0 = onRefusal }
        URLProtocol.registerClass(RequestRefusalProtocol.self)
        URLSessionConfiguration.meeshy_exchangeClassGetter(
            "defaultSessionConfiguration", with: #selector(URLSessionConfiguration.meeshy_sealedDefault)
        )
        URLSessionConfiguration.meeshy_exchangeClassGetter(
            "ephemeralSessionConfiguration", with: #selector(URLSessionConfiguration.meeshy_sealedEphemeral)
        )
        SocketConfig.sealTransport()
    }

    static func recordRefusal(of request: URLRequest) {
        refusals.withLock { $0 += 1 }
        state.withLock { $0 }?(request)
    }
}

/// Refuse toute requête http(s) qui lui parvient par
/// `URLError.notConnectedToInternet`, et la signale au sceau.
public final class RequestRefusalProtocol: URLProtocol, @unchecked Sendable {
    override public class func canInit(with request: URLRequest) -> Bool {
        guard let scheme = request.url?.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }

    override public class func canInit(with task: URLSessionTask) -> Bool {
        guard let request = task.currentRequest ?? task.originalRequest else { return false }
        return canInit(with: request)
    }

    override public class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override public func startLoading() {
        NetworkTransportSeal.recordRefusal(of: request)
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
    }

    override public func stopLoading() {}
}

extension URLSessionConfiguration {
    static func meeshy_exchangeClassGetter(_ original: String, with replacement: Selector) {
        guard let originalMethod = class_getClassMethod(self, NSSelectorFromString(original)),
              let replacementMethod = class_getClassMethod(self, replacement) else { return }
        method_exchangeImplementations(originalMethod, replacementMethod)
    }

    /// Après l'échange, `meeshy_sealedDefault()` appelle l'implémentation
    /// ORIGINALE de `+defaultSessionConfiguration`.
    @objc class func meeshy_sealedDefault() -> URLSessionConfiguration {
        meeshy_sealedDefault().meeshy_refusingRequests()
    }

    @objc class func meeshy_sealedEphemeral() -> URLSessionConfiguration {
        meeshy_sealedEphemeral().meeshy_refusingRequests()
    }

    private func meeshy_refusingRequests() -> URLSessionConfiguration {
        protocolClasses = [RequestRefusalProtocol.self] + (protocolClasses ?? [])
        return self
    }
}
