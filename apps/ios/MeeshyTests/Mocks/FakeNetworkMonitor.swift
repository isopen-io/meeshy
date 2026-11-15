import Foundation
import Combine
@testable import MeeshySDK

/// Test double for `NetworkMonitorProviding`. Lets tests force the
/// online/offline state deterministically without driving the real
/// `NWPathMonitor` underneath `NetworkMonitor.shared`.
///
/// Mirrors `MockNetworkMonitor` (timeline SDK tests) but lives under the
/// app's MeeshyTests target so `ConversationViewModel` tests can inject
/// it without crossing the SDK boundary.
final class FakeNetworkMonitor: NetworkMonitorProviding, @unchecked Sendable {
    var isOnline: Bool

    /// Les transitions hors-ligne/en-ligne que le double ÉMET. Le publisher
    /// par défaut du protocole (`Empty`) n'émettait jamais : aucun test ne
    /// pouvait exercer la fermeture d'un `sink`, ni le fil sur lequel elle
    /// est appelée. Le vrai `NetworkMonitor` livre depuis
    /// `DispatchQueue.global(qos: .utility)` — un test qui veut ce fil-là
    /// appelle `send` depuis cette file.
    let offlineTransitions = PassthroughSubject<Bool, Never>()

    var isOfflinePublisher: AnyPublisher<Bool, Never> {
        offlineTransitions.eraseToAnyPublisher()
    }

    init(isOnline: Bool = true) {
        self.isOnline = isOnline
    }
}
