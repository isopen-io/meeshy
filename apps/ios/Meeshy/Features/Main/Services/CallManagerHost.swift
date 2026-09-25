import Combine
import Foundation
import MeeshySDK

/// Porte la pile d'appel SANS la construire (#7955).
///
/// `CallManager.shared` instancie CallKit, le client WebRTC, la fenêtre PiP et
/// la chaîne de filtres vidéo. Tant que la racine le lisait pour se construire
/// (`CallPresentationLayer`), toute la pile naissait sur le fil principal
/// pendant la PREMIÈRE image du démarrage à froid, hors de tout appel —
/// mesuré : 983 des 1 318 échantillons du fil principal à t = 10 s.
///
/// Ce qui n'a besoin que de SAVOIR (y a-t-il un appel ? dans quel état ?) lit
/// cet hôte : `manager` reste `nil` tant qu'aucun appel n'a réveillé la pile,
/// et « pas de gestionnaire » veut dire « pas d'appel ». Ce qui doit AGIR
/// (appel entrant, sortant, reprise) passe par `require()` ou
/// `CallManager.shared`, qui s'enregistre ici en naissant — l'hôte voit donc
/// la pile quel que soit le chemin qui l'a réveillée, PushKit compris.
@MainActor
final class CallManagerHost: ObservableObject {
    nonisolated deinit {}
    static let shared = CallManagerHost()

    @Published private(set) var manager: CallManager?

    private let factory: @MainActor () -> CallManager
    private var relay: AnyCancellable?

    init(factory: @escaping @MainActor () -> CallManager = { CallManager.shared }) {
        self.factory = factory
    }

    /// Enregistre la pile qui vient de naître et relaie ses changements : les
    /// vues qui observent l'hôte se redessinent exactement comme lorsqu'elles
    /// observaient `CallManager` lui-même.
    @discardableResult
    func adopt(_ candidate: CallManager) -> CallManager {
        guard manager !== candidate else { return candidate }
        relay = candidate.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
        manager = candidate
        return candidate
    }

    /// Réveille la pile — synchrone, pour que PushKit puisse signaler l'appel à
    /// CallKit avant de rendre la main.
    @discardableResult
    func require() -> CallManager {
        if let manager { return manager }
        return adopt(factory())
    }

    var isCallActiveForAudioGuard: Bool {
        manager?.isCallActiveForAudioGuard ?? false
    }

    /// `$callState` de la pile quand elle existe, `.idle` avant — sans la créer.
    var callStatePublisher: AnyPublisher<CallState, Never> {
        $manager
            .map { manager -> AnyPublisher<CallState, Never> in
                manager.map { $0.$callState.eraseToAnyPublisher() }
                    ?? Just(CallState.idle).eraseToAnyPublisher()
            }
            .switchToLatest()
            .eraseToAnyPublisher()
    }
}

/// Réveille la pile d'appel au premier `call:initiated` reçu par le socket
/// (#7955).
///
/// Avant, `CallManager` s'abonnait au socket en naissant — et naissait à la
/// première image. Maintenant qu'il ne naît plus qu'au premier besoin, un appel
/// entrant par le socket (application au premier plan, sans push VoIP) doit
/// encore trouver quelqu'un pour l'entendre : cette porte, armée au montage de
/// la racine, ne coûte qu'un abonnement.
///
/// La décision se prend AU MOMENT de l'émission (le socket livre sur le fil
/// principal) : si la pile existait déjà, son propre abonnement reçoit
/// l'événement et la porte s'efface ; sinon la porte la réveille et lui remet
/// CET événement, que son abonnement, né après l'émission, n'a pas vu.
@MainActor
final class IncomingCallWakeGate {
    nonisolated deinit {}
    static let shared = IncomingCallWakeGate()

    private let offers: @MainActor () -> AnyPublisher<CallOfferData, Never>
    private let isAwake: @MainActor () -> Bool
    private let wake: @MainActor (CallOfferData) -> Void
    private var subscription: AnyCancellable?

    init(
        offers: @escaping @MainActor () -> AnyPublisher<CallOfferData, Never> = {
            MessageSocketManager.shared.callOfferReceived.eraseToAnyPublisher()
        },
        isAwake: @escaping @MainActor () -> Bool = { CallManagerHost.shared.manager != nil },
        wake: @escaping @MainActor (CallOfferData) -> Void = { offer in
            CallManagerHost.shared.require().handleCallOffer(offer)
        }
    ) {
        self.offers = offers
        self.isAwake = isAwake
        self.wake = wake
    }

    var isArmed: Bool { subscription != nil }

    func arm() {
        guard subscription == nil else { return }
        subscription = offers().sink { [weak self] offer in
            guard Thread.isMainThread else {
                DispatchQueue.main.async { self?.receive(offer) }
                return
            }
            MainActor.assumeIsolated { self?.receive(offer) }
        }
    }

    private func receive(_ offer: CallOfferData) {
        guard !isAwake() else { return }
        wake(offer)
    }
}
