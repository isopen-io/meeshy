import Foundation
import Combine

// =============================================================================
// L'ANNEAU DU CŒUR SUR CHAQUE GESTE DÉJÀ FAIT — directive porteur 2026-10-01 :
// « remettre dans la lecture des story les effets qu'il y avait sur l'icône son,
// le cœur […] ainsi que le contour du cœur sur tous les autres éléments lorsqu'on
// a commenté, partagé etc. »
//
// Le rail de la story les avait jusqu'au chrome commun (#8878, 19b9d089) :
// `StoryActionButton` dessinait derrière son glyphe le même symbole agrandi
// (×1,22) dans une teinte d'accent, avec une ombre de cette teinte (55 %, rayon 7)
// et un rebond au changement d'état. Le cœur posé prenait la couleur de l'avatar
// de l'auteur. L'adoption de `FullscreenActionButton` a remplacé tout cela par une
// simple teinte indigo du glyphe — et le cœur par l'émoji « + ».
//
// Ce fichier porte la LOI (quelle action reçoit quel contour) et la MÉMOIRE de
// session des gestes que la passerelle ne sert pas : sur une story, le fil sert
// `currentUserReactions` (la réaction du lecteur), mais NI son commentaire, NI son
// envoi, NI sa republication (`isRepostedByMe` n'est posé que par
// `withViewerPostState`, que `getStories` n'appelle pas).
// =============================================================================

/// Un geste du lecteur sur une story, retenu pour la session.
nonisolated enum StoryViewerParticipationMark: Hashable, Sendable {
    case commented
    case sent
    case reposted
}

/// Ce que le lecteur a déjà fait de la story affichée.
nonisolated struct StoryViewerParticipation: Equatable, Sendable {
    var hasReacted: Bool = false
    var hasCommented: Bool = false
    var hasSent: Bool = false
    var hasReposted: Bool = false

    static let none = StoryViewerParticipation()

    init(hasReacted: Bool = false, hasCommented: Bool = false, hasSent: Bool = false, hasReposted: Bool = false) {
        self.hasReacted = hasReacted
        self.hasCommented = hasCommented
        self.hasSent = hasSent
        self.hasReposted = hasReposted
    }

    init(marks: Set<StoryViewerParticipationMark>, hasReacted: Bool) {
        self.init(hasReacted: hasReacted,
                  hasCommented: marks.contains(.commented),
                  hasSent: marks.contains(.sent),
                  hasReposted: marks.contains(.reposted))
    }
}

/// Les actions du rail qui portent un contour.
nonisolated enum StoryRailEmphasisAction: Hashable, Sendable, CaseIterable {
    case sound, react, forward, repost, comments, translations
}

/// **Le contour d'une action du rail** — et sa teinte, résolue par la vue.
nonisolated enum StoryRailContour: Equatable, Sendable {
    /// Aucun contour.
    case none
    /// L'état est EN COURS : le son ouvert, la barre de réactions ouverte, le fil ou
    /// les langues ouverts — `indigo400`, l'ancien `activeGlow`.
    case live
    /// Le lecteur a déjà FAIT ce geste — la couleur de l'avatar de l'auteur, l'ancien
    /// `accentOutlineColor` du cœur, désormais porté par chaque action.
    case participated

    /// Ce qui est ouvert ou allumé à l'instant, lu par le rail.
    nonisolated struct Live: Equatable, Sendable {
        var soundOn: Bool = false
        var reactionBarOpen: Bool = false
        var commentsOpen: Bool = false
        var languagesOpen: Bool = false

        init(soundOn: Bool = false, reactionBarOpen: Bool = false, commentsOpen: Bool = false, languagesOpen: Bool = false) {
            self.soundOn = soundOn
            self.reactionBarOpen = reactionBarOpen
            self.commentsOpen = commentsOpen
            self.languagesOpen = languagesOpen
        }
    }

    /// Un geste fait l'emporte sur un état ouvert : l'anneau de l'auteur DIT quelque
    /// chose de durable, l'indigo seulement « en ce moment ».
    static func resolve(_ action: StoryRailEmphasisAction,
                        live: Live,
                        participation: StoryViewerParticipation) -> StoryRailContour {
        switch action {
        case .sound:
            return live.soundOn ? .live : .none
        case .react:
            return participated(participation.hasReacted, orLive: live.reactionBarOpen)
        case .forward:
            return participation.hasSent ? .participated : .none
        case .repost:
            return participation.hasReposted ? .participated : .none
        case .comments:
            return participated(participation.hasCommented, orLive: live.commentsOpen)
        case .translations:
            return live.languagesOpen ? .live : .none
        }
    }

    private static func participated(_ done: Bool, orLive isLive: Bool) -> StoryRailContour {
        if done { return .participated }
        return isLive ? .live : .none
    }

}

/// **La mémoire de session des gestes du lecteur sur les stories.** Notée aux sites
/// où le geste part — le POST d'un commentaire (`StoryInteractionService`), l'envoi
/// d'une story depuis la feuille de partage (`SharePickerView`), la publication d'une
/// republication (`StoryRepublishComposer`) — et lue par le rail.
@MainActor
protocol StoryViewerParticipationRecording: AnyObject {
    func note(_ mark: StoryViewerParticipationMark, storyId: String)
}

@MainActor
final class StoryViewerParticipationStore: ObservableObject, StoryViewerParticipationRecording {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage hors
    // d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = StoryViewerParticipationStore()

    @Published private(set) var marks: [String: Set<StoryViewerParticipationMark>] = [:]

    /// Un geste déjà noté ne publie rien : aucun rail ne se redessine pour rien.
    func note(_ mark: StoryViewerParticipationMark, storyId: String) {
        guard !storyId.isEmpty, marks[storyId]?.contains(mark) != true else { return }
        marks[storyId, default: []].insert(mark)
    }

    func participation(for storyId: String?, hasReacted: Bool) -> StoryViewerParticipation {
        StoryViewerParticipation(marks: storyId.flatMap { marks[$0] } ?? [], hasReacted: hasReacted)
    }
}
