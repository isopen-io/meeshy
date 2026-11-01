import Foundation
import MeeshySDK

/// **Le jingle de la marque s'entend EN ENTIER, et jamais sous le son de la story.**
///
/// Le jingle d'ouverture dure `MeeshyBrandJingle.duration` (2,2 s) et finit
/// par sa propre extinction ; l'interlude d'identité, lui, ne tient que 1,2 s
/// avant de se fondre dans la story. L'ancien mixage éteignait le jingle sur ce
/// fondu (1,2 → 1,7 s) : la note qui résout le motif était coupée, et le son
/// de la story entrait à plein volume par-dessus. Et la carte de fin sans
/// auteur faisait entrer le jingle de fermeture pendant que la story jouait
/// encore à plein.
///
/// La loi : les jingles jouent tels qu'ils ont été synthétisés ; c'est le son
/// de la STORY qui leur fait place. Il monte de 0 à 1 pendant la queue du
/// jingle d'ouverture, et il est éteint quand le jingle de fermeture entre.
/// Valeurs pures, en secondes de la composition finale — miroirs : web
/// `storyAudioEnvelope` (`scene-export-branding-plan.ts`), Android
/// `StoryExportBrandingPlan.storyAudioRamps`.
public enum StoryExportJingleMix {

    /// Le temps que met le son de la story à s'éteindre avant le jingle d'une
    /// carte de fin SANS auteur, qui entre avec le logo, sur la story encore visible.
    public static let logoOutroDuck: TimeInterval = 0.5

    /// Une rampe de volume ; `start == end` est une marche.
    public struct Ramp: Equatable, Sendable {
        public let from: Float
        public let to: Float
        public let start: TimeInterval
        public let end: TimeInterval
    }

    /// L'enveloppe du son de la story.
    /// - Parameters:
    ///   - storyStart: l'instant où la story commence dans la composition.
    ///   - storyEnd: l'instant où elle finit.
    ///   - introJingleEnd: la fin du jingle d'ouverture, `nil` sans interlude.
    ///   - outroJingleStart: l'entrée du jingle de fermeture, `nil` sans carte de fin.
    ///   - outroFade: la durée sur laquelle la story s'éteint avant lui.
    public static func storyRamps(storyStart: TimeInterval,
                                  storyEnd: TimeInterval,
                                  introJingleEnd: TimeInterval?,
                                  outroJingleStart: TimeInterval?,
                                  outroFade: TimeInterval) -> [Ramp] {
        let fadeIn = introJingleEnd.flatMap { jingleEnd in
            jingleEnd > storyStart ? Ramp(from: 0, to: 1, start: storyStart, end: min(jingleEnd, storyEnd)) : nil
        }
        let floor = fadeIn?.end ?? storyStart
        let fadeOut = outroJingleStart.map { entry -> Ramp in
            let end = min(max(entry, floor), storyEnd)
            return Ramp(from: 1, to: 0, start: max(end - outroFade, floor), end: end)
        }
        return [fadeIn, fadeOut].compactMap { $0 }
    }

    /// La durée sur laquelle la story s'éteint : le fondu visuel de la carte
    /// d'auteur (son jingle entre quand la story est déjà recouverte), un
    /// retrait court quand le jingle entre avec le logo.
    public static func outroFade(authorCard: Bool, overlap: TimeInterval) -> TimeInterval {
        authorCard ? overlap : logoOutroDuck
    }
}
