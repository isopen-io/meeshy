import Foundation
import MeeshySDK

/// Une part de la composition qu'« Imager » rend, depuis le DÉBUT : 1/4 est le
/// premier quart, 4/4 le tout.
public nonisolated enum ImagerQuarter: Int, CaseIterable, Sendable {
    case one = 1, two, three, four
}

public nonisolated struct ImagerLengthChoice: Equatable, Sendable {
    public let quarter: ImagerQuarter
    public let duration: TimeInterval

    public init(quarter: ImagerQuarter, duration: TimeInterval) {
        self.quarter = quarter
        self.duration = duration
    }
}

/// Ce qu'un export fait de la composition rendue : la ranger, la remettre à une
/// autre appli, ou l'imager.
public nonisolated enum StoryExportMode: Sendable {
    case save, share, imager

    /// « Enregistrer » et « Partager » rendent TOUJOURS tout ; seule « Imager »
    /// propose une longueur.
    public func lengthChoices(total: TimeInterval) -> [ImagerLengthChoice] {
        self == .imager ? ImagerLength.choices(total: total) : []
    }
}

/// **La longueur qu'« Imager » rend** (#13871, décision porteur ;
/// miroir d'`ImagerLength.kt` et de `scene-export-length.ts`) : au-delà d'une
/// minute, 1/4 · 2/4 · 3/4 · 4/4 de la composition, TOUJOURS depuis son début ;
/// sous la minute, aucun choix.
///
/// La coupe ÉPINGLE la durée de la slide où elle tombe (`timelineDuration`,
/// l'autorité que `computedTotalDuration()` lit en premier) : le moteur rend
/// alors la même scène, rognée, son compris, et l'habillage de marque reste
/// entier autour d'elle.
public nonisolated enum ImagerLength {
    public static let threshold: TimeInterval = 60

    public static func choices(total: TimeInterval) -> [ImagerLengthChoice] {
        let total = max(total, 0)
        guard total > threshold else { return [] }
        return ImagerQuarter.allCases.map { ImagerLengthChoice(quarter: $0, duration: part(total, $0)) }
    }

    public static func renderedDuration(total: TimeInterval, quarter: ImagerQuarter?) -> TimeInterval {
        let total = max(total, 0)
        guard let quarter, total > threshold else { return total }
        return part(total, quarter)
    }

    public static func total(of slides: [StorySlide]) -> TimeInterval {
        slides.reduce(0) { $0 + $1.computedTotalDuration() }
    }

    /// Les slides à rendre pour la part choisie, dans l'ordre : celles qui
    /// tiennent entières, puis celle où la coupe tombe, épinglée à ce qui en reste.
    public static func cut(_ slides: [StorySlide], quarter: ImagerQuarter?) -> [StorySlide] {
        let total = total(of: slides)
        let kept = renderedDuration(total: total, quarter: quarter)
        guard kept < total else { return slides }
        var remaining = kept
        var result: [StorySlide] = []
        for slide in slides where remaining > minimumSlice {
            let duration = slide.computedTotalDuration()
            guard duration > remaining else {
                result.append(slide)
                remaining -= duration
                continue
            }
            var pinned = slide
            pinned.effects.timelineDuration = remaining
            result.append(pinned)
            remaining = 0
        }
        return result
    }

    private static let minimumSlice: TimeInterval = 0.05

    private static func part(_ total: TimeInterval, _ quarter: ImagerQuarter) -> TimeInterval {
        (total * Double(quarter.rawValue) / 4 * 1000).rounded() / 1000
    }
}
