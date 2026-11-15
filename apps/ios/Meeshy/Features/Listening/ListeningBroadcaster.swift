import Combine
import Foundation
import MeeshySDK

/// L'ÉMETTEUR DE MON ÉCOUTE SUR iOS (#16803, sous-lot `proche-sang-ecoute@ios` de #13934) — pour toute la durée de
/// l'app. Il nourrit `ListeningBroadcastLaw` de ce qui se passe (morceau, choix, premier plan, socket, battement) et
/// fait partir ce qu'elle rend, dans l'ordre, par `NowPlayingEmitting`.
///
/// Le serveur garde l'état complet scellé et le TRONQUE lecteur par lecteur : cet émetteur n'a ni la liste des
/// lecteurs, ni leur niveau, et n'en a pas besoin. Ce qu'il garantit, c'est que rien ne part sans le choix de
/// l'utilisateur, et que rien n'est affirmé qu'il ne peut plus observer.
@MainActor
final class ListeningBroadcaster {

    private(set) var law = ListeningBroadcastLaw()
    private let emitter: NowPlayingEmitting
    private let now: () -> Date
    private let lane = OrderedEventLane()
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        emitter: NowPlayingEmitting,
        tracks: AnyPublisher<ListeningTrack?, Never>,
        enabled: AnyPublisher<Bool, Never>,
        visible: AnyPublisher<Bool, Never>,
        connected: AnyPublisher<Bool, Never>,
        ticks: AnyPublisher<Void, Never>,
        now: @escaping () -> Date = { Date() }
    ) {
        self.emitter = emitter
        self.now = now
        enabled.removeDuplicates()
            .sink { [weak self] next in self?.apply { $0.setEnabled(next, now: $1) } }
            .store(in: &cancellables)
        visible.removeDuplicates()
            .sink { [weak self] next in self?.apply { $0.setVisible(next, now: $1) } }
            .store(in: &cancellables)
        tracks.removeDuplicates()
            .sink { [weak self] track in self?.apply { $0.play(track, now: $1) } }
            .store(in: &cancellables)
        connected.removeDuplicates().dropFirst().filter { $0 }
            .sink { [weak self] _ in self?.apply { $0.reconnected(now: $1) } }
            .store(in: &cancellables)
        ticks
            .sink { [weak self] _ in self?.apply { $0.tick(now: $1) } }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    /// Attendre que tout ce qui est parti ait reçu son accusé (témoins).
    func drain() async {
        await lane.barrier()
    }

    private func apply(_ step: (inout ListeningBroadcastLaw, Date) -> ListeningBroadcastAction) {
        switch step(&law, now()) {
        case .none:
            return
        case .clear:
            let emitter = emitter
            lane.submit { await emitter.clearNowPlaying() }
        case .publish(let update):
            let emitter = emitter
            lane.submit { [weak self] in
                let outcome = await emitter.publishNowPlaying(update)
                await self?.settle(update, outcome)
            }
        }
    }

    private func settle(_ update: NowPlayingUpdate, _ outcome: NowPlayingPublishOutcome) {
        law.settle(update, outcome)
    }
}
