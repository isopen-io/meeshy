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

        public init(from: Float, to: Float, start: TimeInterval, end: TimeInterval) {
            self.from = from
            self.to = to
            self.start = start
            self.end = end
        }
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
        let brand = brandRamps(storyStart: storyStart, storyEnd: storyEnd, introJingleEnd: introJingleEnd,
                               outroJingleStart: outroJingleStart, outroFade: outroFade)
        return [brand.fadeIn, brand.fadeOut].compactMap { $0 }
    }

    /// La même loi sur une piste qui porte déjà l'enveloppe de son auteur
    /// (volume, automation, fondus) : la story monte jusqu'au niveau de
    /// l'auteur et s'éteint depuis le niveau en vigueur ; entre les deux
    /// jingles, les rampes de l'auteur jouent telles quelles. Le résultat est
    /// ordonné, et aucune de ses rampes n'en chevauche une autre.
    public static func storyRamps(over author: [Ramp],
                                  storyStart: TimeInterval,
                                  storyEnd: TimeInterval,
                                  introJingleEnd: TimeInterval?,
                                  outroJingleStart: TimeInterval?,
                                  outroFade: TimeInterval) -> [Ramp] {
        let brand = brandRamps(storyStart: storyStart, storyEnd: storyEnd, introJingleEnd: introJingleEnd,
                               outroJingleStart: outroJingleStart, outroFade: outroFade)
        let envelope = disjoint(author)
        let fadeIn = brand.fadeIn.map { Ramp(from: 0, to: level(of: envelope, at: $0.end), start: $0.start, end: $0.end) }
        let fadeOut = brand.fadeOut.map { Ramp(from: level(of: envelope, at: $0.start), to: 0, start: $0.start, end: $0.end) }
        let between = envelope.compactMap {
            $0.clipped(from: brand.fadeIn?.end ?? -.infinity, to: brand.fadeOut?.start ?? .infinity)
        }
        return [fadeIn].compactMap { $0 } + between + [fadeOut].compactMap { $0 }
    }

    private static func brandRamps(storyStart: TimeInterval,
                                   storyEnd: TimeInterval,
                                   introJingleEnd: TimeInterval?,
                                   outroJingleStart: TimeInterval?,
                                   outroFade: TimeInterval) -> (fadeIn: Ramp?, fadeOut: Ramp?) {
        let fadeIn = introJingleEnd.flatMap { jingleEnd in
            jingleEnd > storyStart ? Ramp(from: 0, to: 1, start: storyStart, end: min(jingleEnd, storyEnd)) : nil
        }
        let floor = fadeIn?.end ?? storyStart
        let fadeOut = outroJingleStart.map { entry -> Ramp in
            let end = min(max(entry, floor), storyEnd)
            return Ramp(from: 1, to: 0, start: max(end - outroFade, floor), end: end)
        }
        return (fadeIn, fadeOut)
    }

    /// Le niveau qu'une enveloppe tient à l'instant `time` : celui de la
    /// dernière rampe entamée, le niveau nominal avant la première.
    private static func level(of envelope: [Ramp], at time: TimeInterval) -> Float {
        envelope.last { $0.start <= time }?.value(at: time) ?? 1
    }

    /// Une rampe qui chevauche la suivante s'arrête là où celle-ci commence.
    private static func disjoint(_ ramps: [Ramp]) -> [Ramp] {
        let sorted = ramps.enumerated()
            .sorted { ($0.element.start, $0.offset) < ($1.element.start, $1.offset) }
            .map(\.element)
        return zip(sorted, sorted.dropFirst().map(Optional.some) + [nil]).map { ramp, next in
            guard let next, next.start < ramp.end else { return ramp }
            return Ramp(from: ramp.from, to: ramp.value(at: next.start), start: ramp.start, end: next.start)
        }
    }

    /// La durée sur laquelle la story s'éteint : le fondu visuel de la carte
    /// d'auteur (son jingle entre quand la story est déjà recouverte), un
    /// retrait court quand le jingle entre avec le logo.
    public static func outroFade(authorCard: Bool, overlap: TimeInterval) -> TimeInterval {
        authorCard ? overlap : logoOutroDuck
    }
}

private extension StoryExportJingleMix.Ramp {
    func value(at time: TimeInterval) -> Float {
        guard end > start else { return to }
        let progress = min(max((time - start) / (end - start), 0), 1)
        return from + (to - from) * Float(progress)
    }

    func clipped(from lower: TimeInterval, to upper: TimeInterval) -> Self? {
        guard start < upper, end > lower || start >= lower else { return nil }
        let clippedStart = max(start, lower)
        let clippedEnd = min(end, upper)
        return Self(from: value(at: clippedStart), to: value(at: clippedEnd), start: clippedStart, end: clippedEnd)
    }
}
