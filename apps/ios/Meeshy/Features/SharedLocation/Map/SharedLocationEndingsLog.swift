import Combine
import Foundation
import MeeshySDK

/// LES PARTAGES QUI VIENNENT DE S'ARRÊTER (#18872, planche Carte-Proches, « Pas sur la carte ») : tenus en mémoire, un
/// journal par magasin de positions, donc par compte. Il suit le magasin dès sa naissance, carte ouverte ou non, et
/// n'en garde que qui et depuis quand ; il oublie après la plus longue durée d'un partage, et au changement de compte.
@MainActor
final class SharedLocationEndingsLog: ObservableObject {

    @Published private(set) var endings = SharedLocationEndings()

    private var previous: [String: SharedLocationEntry]
    private var cancellable: AnyCancellable?

    nonisolated deinit {}

    init(live: SharedLocationsLive, now: @escaping () -> Date = Date.init) {
        previous = live.byUser
        cancellable = live.$byUser
            .dropFirst()
            .sink { [weak self] byUser in
                guard let self else { return }
                endings = endings.advancing(from: previous, to: byUser, now: now())
                previous = byUser
            }
    }

    private static var current: (live: ObjectIdentifier, log: SharedLocationEndingsLog)?

    /// Le journal du magasin du compte connecté : un autre compte repart d'un journal vide.
    static func log(for live: SharedLocationsLive) -> SharedLocationEndingsLog {
        let key = ObjectIdentifier(live)
        if let current, current.live == key { return current.log }
        let log = SharedLocationEndingsLog(live: live)
        current = (key, log)
        return log
    }
}
