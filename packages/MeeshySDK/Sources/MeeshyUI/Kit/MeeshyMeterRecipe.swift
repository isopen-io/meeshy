import SwiftUI

/// La forme d'une jauge : continue, à crans (un petit quota), ou sans valeur.
public nonisolated enum MeeshyMeterForm: Sendable, Equatable {
    case continuous
    case stepped(count: Int)
    case indeterminate
}

/// Un SENS : le genre n'est jamais le seul porteur, un mot ou la valeur écrite le double.
public nonisolated enum MeeshyMeterKind: String, Sendable, Equatable, CaseIterable {
    case accent
    case ok
    case warn
    case err
}

/// Les hauteurs de la piste : 5 en barre dense, 8 par défaut, 12 quand elle est le sujet.
public nonisolated enum MeeshyMeterSize: Int, Sendable, Equatable, CaseIterable {
    case s5 = 5
    case s8 = 8
    case s12 = 12
}

/// **La loi de la fraction** : bornée de 0 à 1, un non-nombre vaut 0, un total
/// nul, négatif ou infini ne rend aucune vue. Jamais de division par zéro,
/// jamais de remplissage qui déborde la piste.
public nonisolated enum MeeshyMeterFraction {
    public static func resolve(value: Double, total: Double) -> Double? {
        guard total.isFinite, total > 0 else { return nil }
        guard value.isFinite else { return 0 }
        return min(max(value / total, 0), 1)
    }
}

/// **La recette de K42 en VALEURS** : hauteur, rayon, crans, genre effectif,
/// repères, valeur dite, animation d'entrée. Aucune couleur : le genre est un rôle.
public nonisolated struct MeeshyMeterRecipe: Sendable, Equatable {

    public static let maximumSegments = 12
    public static let denseStepGap: Double = 3
    public static let stepGap: Double = 4

    public let form: MeeshyMeterForm
    public let kind: MeeshyMeterKind
    public let height: Double
    public let cornerRadius: Double
    public let fillFraction: Double?
    public let segmentCount: Int
    public let filledSegmentCount: Int
    public let stepGap: Double
    public let isDesaturated: Bool
    public let isRendered: Bool

    public static func resolve(form: MeeshyMeterForm,
                               kind: MeeshyMeterKind,
                               fullKind: MeeshyMeterKind?,
                               size: MeeshyMeterSize,
                               fraction: Double?,
                               isStale: Bool) -> MeeshyMeterRecipe {
        let height = Double(size.rawValue)
        let isFull = fraction == 1
        let isIndeterminate = form == .indeterminate
        let count = segments(of: form)
        return MeeshyMeterRecipe(
            form: form,
            kind: isStale || !isFull ? kind : (fullKind ?? kind),
            height: height,
            cornerRadius: height / 2,
            fillFraction: isIndeterminate ? nil : fraction,
            segmentCount: count,
            filledSegmentCount: count > 0 ? filledSegments(fraction: fraction ?? 0, count: count) : 0,
            stepGap: height >= 8 ? stepGap : denseStepGap,
            isDesaturated: isStale,
            isRendered: isIndeterminate || fraction != nil
        )
    }

    private static func segments(of form: MeeshyMeterForm) -> Int {
        guard case .stepped(let count) = form else { return 0 }
        return min(max(count, 1), maximumSegments)
    }

    /// Les crans allumés : chaque cran est une étape faite, pas un pourcentage.
    public static func filledSegments(fraction: Double, count: Int) -> Int {
        guard count > 0, fraction.isFinite else { return 0 }
        let filled = Int((min(max(fraction, 0), 1) * Double(count) + 1e-9).rounded(.down))
        return min(filled, count)
    }

    /// Les repères : des fractions de 0 à 1, ignorés en `stepped`.
    public static func visibleMarks(_ marks: [Double], form: MeeshyMeterForm) -> [Double] {
        if case .stepped = form { return [] }
        return marks.filter { $0.isFinite }.map { min(max($0, 0), 1) }
    }

    /// La valeur dite : le texte de l'hôte (« 23 sur 50 »), sinon le pourcentage
    /// écrit par la langue. La vraie valeur dès le premier rendu.
    public static func spokenValue(spoken: String?, fraction: Double?, locale: Locale) -> String {
        if let spoken, !spoken.isEmpty { return spoken }
        let percent = Int(((fraction ?? 0) * 100).rounded())
        return MeeshyProgressRingRecipe.percentText(percent, locale: locale)
    }

    /// La fraction montrée : zéro avant l'apparition quand l'entrée se joue, la
    /// valeur posée d'emblée sous mouvement réduit ou sans entrée.
    public static func shownFraction(_ fraction: Double?,
                                     hasAppeared: Bool,
                                     animatesOnAppear: Bool,
                                     reduce: Bool) -> Double {
        let posed = hasAppeared || !animatesOnAppear || reduce
        return posed ? (fraction ?? 0) : 0
    }

    /// L'entrée d'une valeur : jouée une fois, jamais sous mouvement réduit.
    public static func entryAnimation(reduce: Bool, animatesOnAppear: Bool) -> Animation? {
        guard animatesOnAppear, !reduce else { return nil }
        return MeeshyMotion.animation(.morph, reduce: false)
    }
}
