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
/// Une transition ne propose qu'UN moment (#9961, #9962), le plus marquant, et jamais une étape qui en
/// saute une autre : la Meesh 50 sans photo de la 40 propose la 40 (`GamePhotoCatchUp.offer`). Une
/// proposition encore en attente d'un geste n'en laisse pas entrer une seconde.
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
    /// Ce qui a déjà été PROPOSÉ dans la séance — une étape rattrapée à la place d'un moment compris.
    private var offered = Set<String>()

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
        let standing = PhotoCatchUpStanding(game: game)
        Task { [notebook] in
            let entries = await notebook.list()
            let kept = Set(entries.filter { $0.status == .kept }.map(\.momentId))
            let known = Set(entries.map(\.momentId))
            guard let chosen = GamePhotoCoordinator.offer(among: moments, standing: standing, kept: kept),
                  !known.contains(chosen.id),
                  !self.offered.contains(chosen.id),
                  self.offers.isEmpty else { return }
            self.offered.insert(chosen.id)
            self.offers.append(chosen)
        }
    }

    /// LA proposition d'une transition (#9961, #9962) : un seul moment, le plus marquant, et jamais une étape
    /// qui en saute une autre — l'étape OUVERTE de sa piste est proposée à sa place.
    static func offer(among moments: [PhotoMoment], standing: PhotoCatchUpStanding, kept: Set<String>) -> PhotoMoment? {
        guard let id = GamePhotoCatchUp.offer(for: moments.map(\.id), standing: standing, kept: kept) else { return nil }
        return moments.first { $0.id == id }
            ?? GamePhotoCatchUp.stepsReached(standing).first { $0.id == id }?.moment
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

    /// Toute fermeture passe ici, la croix comme la feuille qui retombe : le déroulé
    /// ouvert est CLOS d'abord, ce qui arrête sa caméra.
    func close() {
        active?.close()
        active = nil
    }
}
