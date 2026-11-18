import SwiftUI

/// **K26 — mouvement 08 « Entrées en cascade »** (#19625, planche `Sys-Mouvement`
/// § 08) : à l'arrivée sur une face, ses blocs montent l'un après l'autre. Le pas
/// d'un bloc se lit dans la table : 80 ms par rang, rang borné à 3, ressort `rise` ;
/// le bloc part 18 pt plus bas, transparent, à l'échelle 0,97. Sous « Réduire les
/// animations », ni retard ni déplacement : le fondu court de la table.
public nonisolated struct MeeshyCascadeStep: Sendable, Equatable {
    /// La hauteur d'où un bloc monte, en points.
    public static let riseLift: Double = 18
    /// L'échelle d'où un bloc grandit.
    public static let riseStartScale: Double = 0.97

    public let delayMilliseconds: Int
    public let lift: Double
    public let startScale: Double
    public let isReduced: Bool

    public var delay: Double { Double(delayMilliseconds) / 1000 }

    /// L'animation qui amène le bloc au repos : le ressort `rise` retardé de son
    /// rang, ou le fondu court sans retard sous réduction.
    public var animation: Animation? {
        guard !isReduced else { return MeeshyMotion.animation(.rise, reduce: true) }
        return MeeshyMotion.animation(.rise, reduce: false)?.delay(delay)
    }

    public static func resolve(rank: Int, reduce: Bool) -> MeeshyCascadeStep {
        guard !reduce else {
            return MeeshyCascadeStep(delayMilliseconds: 0, lift: 0, startScale: 1, isReduced: true)
        }
        return MeeshyCascadeStep(delayMilliseconds: MeeshyMotion.delayMilliseconds(index: rank),
                                 lift: riseLift, startScale: riseStartScale, isReduced: false)
    }
}

public extension View {

    /// Monte ce bloc à son rang dans la cascade de la face qui s'ouvre : une fois
    /// par apparition, rejouée quand la face revient (sa page renaît).
    func meeshyCascade(rank: Int) -> some View {
        modifier(MeeshyCascadeModifier(rank: rank))
    }
}

private struct MeeshyCascadeModifier: ViewModifier {
    let rank: Int

    @State private var hasRisen = false

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    func body(content: Content) -> some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        let step = MeeshyCascadeStep.resolve(rank: rank, reduce: reduce)
        return content
            .opacity(hasRisen ? 1 : 0)
            .scaleEffect(hasRisen ? 1 : step.startScale)
            .offset(y: hasRisen ? 0 : step.lift)
            .onAppear {
                guard !hasRisen else { return }
                meeshyWithAnimation(step.animation, reduced: step.animation, reduceMotion: reduce) {
                    hasRisen = true
                }
            }
    }
}
