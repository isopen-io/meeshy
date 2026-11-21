import Combine
import Foundation
import CallKit
import MeeshySDK

/// La règle pure : on est en appel tant qu'UN appel non terminé est DÉCROCHÉ ou SORTANT — appel du téléphone ou appel
/// Meeshy, CallKit les voit tous. Un appel ENTRANT qui sonne n'en est pas un : le compter dirait « en appel » à tort, et
/// dirait surtout aux Sangs qu'un appel arrive, et quand il est refusé (audit #18753). Aucun identifiant, aucun numéro,
/// aucun UUID n'en sort : un booléen.
nonisolated enum PhoneCallActivity {
    struct Call: Equatable {
        let hasEnded: Bool
        let hasConnected: Bool
        let isOutgoing: Bool
    }

    static func isActive(_ calls: [Call]) -> Bool {
        calls.contains { !$0.hasEnded && ($0.hasConnected || $0.isOutgoing) }
    }
}

extension PhoneCallActivity.Call {
    nonisolated init(_ call: CXCall) {
        self.init(hasEnded: call.hasEnded, hasConnected: call.hasConnected, isOutgoing: call.isOutgoing)
    }
}

/// QUAND rapporter « en appel » (#18753) — une décision de l'app, pas du SDK. Un rapport ne part que connecté, et
/// seulement quand la valeur change ; un rapport échoué se refait à l'observation suivante. Les appels arrivent un par
/// un (`PhoneCallCenter` les fait passer par une file ordonnée) : deux rapports ne se croisent jamais sur le réseau.
@MainActor
final class PhoneCallReporter {

    private let service: PhoneCallServiceProviding
    private let isSignedIn: () -> Bool
    private(set) var lastReported: Bool?

    nonisolated deinit {}

    init(service: PhoneCallServiceProviding, isSignedIn: @escaping () -> Bool) {
        self.service = service
        self.isSignedIn = isSignedIn
    }

    func observe(active: Bool) async {
        guard isSignedIn(), active != lastReported else { return }
        lastReported = active
        let outcome = await service.report(active: active)
        if outcome == .failed, lastReported == active { lastReported = nil }
    }

    /// Le compte change : la valeur rapportée appartenait à l'autre session.
    func reset() {
        lastReported = nil
    }
}

/// Le seul endroit qui lit CallKit. `CXCallObserver` voit les appels du téléphone et ceux de Meeshy ; il ne réveille
/// pas une app suspendue, d'où la relecture au retour au premier plan (`isActive`).
@MainActor
final class CallKitCallActivity {

    static let shared = CallKitCallActivity()

    private let observer = CXCallObserver()
    private let proxy = CallObserverDelegateProxy()
    private let subject = PassthroughSubject<Bool, Never>()

    nonisolated deinit {}

    init() {
        proxy.onChange = { [weak self] active in self?.subject.send(active) }
        observer.setDelegate(proxy, queue: .main)
    }

    /// Chaque changement d'appel, tel que CallKit le rapporte.
    var changes: AnyPublisher<Bool, Never> { subject.eraseToAnyPublisher() }

    /// L'état des appels MAINTENANT.
    var isActive: Bool {
        PhoneCallActivity.isActive(observer.calls.map(PhoneCallActivity.Call.init))
    }
}

/// Le délégué de `CXCallObserver`, servi sur la file principale (`setDelegate(_:queue: .main)`).
nonisolated final class CallObserverDelegateProxy: NSObject, CXCallObserverDelegate {
    var onChange: (@MainActor (Bool) -> Void)?

    func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
        let active = PhoneCallActivity.isActive(callObserver.calls.map(PhoneCallActivity.Call.init))
        let onChange = self.onChange
        MainActor.assumeIsolated { onChange?(active) }
    }
}
