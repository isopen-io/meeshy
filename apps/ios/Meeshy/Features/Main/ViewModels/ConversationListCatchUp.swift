import Foundation
import Combine

/// #16457 — le rattrapage de la liste (delta depuis le dernier point) qui n'a
/// pas réussi se rejoue au front montant suivant du socket. Le delta du
/// lancement à froid échoue souvent juste après un redémarrage (réseau pas
/// prêt), et la PREMIÈRE connexion d'une session n'émet pas `didReconnect` :
/// sans cette règle, rien ne le rejouait. Un rattrapage réussi ne se double pas ;
/// un front montant survenu pendant un rattrapage en vol est rejoué s'il échoue.
@MainActor
final class ConversationListCatchUp {
    private let sync: @MainActor () async -> Bool
    private(set) var isPending = true
    private var isRunning = false
    private var edgeDuringRun = false
    private var edgeTask: Task<Void, Never>?

    nonisolated deinit {}

    init(sync: @escaping @MainActor () async -> Bool) {
        self.sync = sync
    }

    func run() async {
        guard !isRunning else {
            edgeDuringRun = true
            return
        }
        isRunning = true
        edgeDuringRun = false
        let succeeded = await sync()
        isRunning = false
        isPending = !succeeded
        guard isPending, edgeDuringRun else { return }
        await run()
    }

    func retriesOnRisingEdge(_ isConnected: AnyPublisher<Bool, Never>) -> AnyCancellable {
        isConnected
            .removeDuplicates()
            .scan((was: false, now: false)) { previous, now in (was: previous.now, now: now) }
            .filter { !$0.was && $0.now }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self, self.isPending || self.isRunning else { return }
                self.edgeTask = Task { @MainActor [weak self] in await self?.run() }
            }
    }
}
