import Foundation
import MeeshySDK

/// LE RATTRAPAGE DU CARNET (#9961, #9962) — chaque étape déjà franchie se photographie, DANS L'ORDRE.
///
/// La loi vit dans le SDK (`GamePhotoCatchUpLaw`, miroir de `packages/shared/utils/game/photo-catch-up.ts`,
/// rejoué sur les vecteurs partagés — #10155). Cette enveloppe en fait des MOMENTS : chaque étape devient
/// un `PhotoMoment` complet par les mêmes constructeurs que la proposition en direct (`GamePhotoMoments`),
/// donc une photo gardée par l'une compte pour l'autre.

/// Une étape franchie : le moment qu'elle photographie, et sa piste.
nonisolated struct PhotoStep: Equatable, Identifiable, Sendable {
    let track: PhotoTrack
    let moment: PhotoMoment

    var id: String { moment.id }
}

/// Une étape franchie SANS photo gardée : ouverte, ou en attente d'une étape plus ancienne de sa piste.
nonisolated struct PhotoCatchUpEntry: Equatable, Identifiable, Sendable {
    let moment: PhotoMoment
    let track: PhotoTrack
    let isOpen: Bool
    /// L'identité de l'étape à photographier d'abord ; `nil` pour l'étape ouverte.
    let blockedBy: String?

    var id: String { moment.id }
}

enum GamePhotoCatchUp {

    /// L'ordre de préséance d'une proposition : un rang passe avant un palier, une Meesh en dernier.
    static let offerPriority: [PhotoTrack] = GamePhotoCatchUpLaw.offerPriority

    /// Toutes les étapes franchies, piste après piste, chacune dans son ordre.
    static func stepsReached(_ standing: PhotoCatchUpStanding) -> [PhotoStep] {
        GamePhotoCatchUpLaw.stepsReached(standing).map { PhotoStep(track: $0.track, moment: moment(of: $0.emblem)) }
    }

    /// Les étapes franchies sans photo gardée : la première de chaque piste est ouverte, les suivantes l'attendent.
    static func catchUp(_ standing: PhotoCatchUpStanding, kept: Set<String>) -> [PhotoCatchUpEntry] {
        GamePhotoCatchUpLaw.catchUp(standing, kept: kept).map { entry in
            PhotoCatchUpEntry(moment: moment(of: entry.step.emblem), track: entry.track, isOpen: entry.isOpen, blockedBy: entry.blockedBy)
        }
    }

    /// La piste d'une identité de moment ; `nil` hors des sept pistes (succès, trophée, ligue, saison).
    static func track(of momentId: String) -> PhotoTrack? {
        GamePhotoCatchUpLaw.track(of: momentId)
    }

    /// LA proposition d'une transition : chaque moment d'une piste est remplacé par l'étape OUVERTE de sa
    /// piste (aucune si la piste est à jour), puis le plus marquant l'emporte. `nil` : rien à proposer.
    static func offer(for ids: [String], standing: PhotoCatchUpStanding, kept: Set<String>) -> String? {
        GamePhotoCatchUpLaw.offer(for: ids, standing: standing, kept: kept)
    }

    /// Le moment complet d'un emblème de la loi : son identité est celle de l'étape.
    static func moment(of emblem: PhotoStepEmblem) -> PhotoMoment {
        switch emblem {
        case .start: GamePhotoMoments.start()
        case .rank(let rank, let division): GamePhotoMoments.rank(rank, division: division)
        case .tier(let tier, let level, let prestige, let times): GamePhotoMoments.tier(tier, level: level, prestige: prestige, times: times)
        case .levelHundred: GamePhotoMoments.levelHundred(prestige: 0)
        case .prestige(let number): GamePhotoMoments.ofEmblemV2(.prestige(number: number))
        case .meesh(let number, let edition): GamePhotoMoments.meesh(number: number, edition: edition)
        case .treasury(let tier): GamePhotoMoments.treasury(tier)
        case .flame(_, let days): GamePhotoMoments.flame(days: days)
        }
    }
}
