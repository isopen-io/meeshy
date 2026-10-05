import Foundation
import Combine
import MeeshySDK

/// LES PROPOSITIONS DE PHOTO (#9382) — Mee propose APRÈS la célébration, pendant
/// que l'écran est ouvert : la Flamme qui franchit 7 jours, la dixième Meesh, le
/// rang gagné. Miroir de `apps/web/src/routes/progression-photo.ts`. Trois
/// garde-fous :
///
///  - jamais à l'OUVERTURE : un état n'est pas une célébration, et rouvrir
///    l'écran ne rejoue pas une proposition ;
///  - jamais deux fois le même moment dans la séance ;
///  - jamais un moment que le carnet connaît déjà (gardé, ou en attente d'après
///    un « plus tard ») — le carnet n'est lu qu'à ce moment-là.
///
/// Et jamais pendant qu'un geste est EN VOL (`settled` faux) : la lecture montrée
/// est l'optimiste, un geste refusé ne se photographie pas.
///
/// `start` ouvre le déroulé pour un moment donné — une proposition, la photo de
/// départ (fin de l'intégration), ou le moment qu'une carte du guide vient de dire.
@MainActor
final class GamePhotoCoordinator: ObservableObject {
    nonisolated deinit {}

    /// Les propositions en attente d'un geste.
    @Published private(set) var offers: [PhotoMoment] = []
    /// Le déroulé ouvert.
    @Published private(set) var active: GamePhotoSession?

    private let notebook: GamePhotoNotebooking
    private let makeSession: (PhotoMoment) -> GamePhotoSession
    private var previous: GameBlock?
    private var proposed = Set<String>()

    init(notebook: GamePhotoNotebooking, makeSession: @escaping (PhotoMoment) -> GamePhotoSession) {
        self.notebook = notebook
        self.makeSession = makeSession
    }

    func observe(game: GameBlock, settled: Bool) {
        guard settled else { return }
        let before = previous
        previous = game
        guard let before else { return }
        let moments = GamePhotoMoments.ofTransition(from: before, to: game).filter { !proposed.contains($0.id) }
        guard !moments.isEmpty else { return }
        moments.forEach { proposed.insert($0.id) }
        Task { [notebook] in
            let known = Set(await notebook.list().map(\.momentId))
            let fresh = moments.filter { !known.contains($0.id) }
            guard !fresh.isEmpty else { return }
            offers.append(contentsOf: fresh)
        }
    }

    func start(_ moment: PhotoMoment) {
        offers.removeAll { $0.id == moment.id }
        active = makeSession(moment)
    }

    /// « Plus tard » sur une proposition : le moment attend sept jours au carnet.
    func later(_ moment: PhotoMoment) {
        offers.removeAll { $0.id == moment.id }
        Task { [notebook] in _ = await notebook.postpone(moment) }
    }

    func close() {
        active = nil
    }
}
