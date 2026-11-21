import SwiftUI

/// **K26 — les recettes nommées APPLIQUÉES** (#19528). `MeeshyMotionRecipe.named`
/// dit quels jetons une recette compose ; ces fonctions la jouent : `reveal`
/// (le squelette cède au contenu, fondu croisé sans saut ; réduit : échange sec),
/// `shimmer` (le reflet en boucle ; réduit : aplat fixe) et `celebrate` (rebond
/// et particules, une fois ; réduit : repli fixe, sans particule).
public extension MeeshyMotion {

    /// L'animation d'une recette nommée : le ressort ou la boucle de son premier
    /// jeton, `nil` sous réduction (échange sec, aplat fixe, repli fixe).
    nonisolated static func animation(named name: MeeshyMotionNamed, reduce: Bool) -> Animation? {
        guard !reduce else { return nil }
        switch name {
        case .reveal: return animation(.rise, reduce: false)
        case .shimmer: return animation(.pulse, reduce: false)
        case .celebrate: return animation(.morph, reduce: false)
        }
    }

    /// Les particules d'une recette : la célébration seule en porte, et aucune
    /// sous réduction.
    nonisolated static func showsParticles(_ name: MeeshyMotionNamed, reduce: Bool) -> Bool {
        name == .celebrate && !reduce
    }

    /// Le second temps d'une recette (le halo après la médaille, la zone après
    /// la précédente) : le rang 1 de la cascade, aucun retard sous réduction.
    nonisolated static func followUpDelay(reduce: Bool) -> Double {
        reduce ? 0 : delay(index: 1)
    }
}

/// Joue `body` dans la transaction d'un jeton de K26 : son ressort hors
/// réduction, son fondu court sous réduction (marqué pour traverser
/// `meeshyMotionRoot()`), rien pour un avancement piloté ou une boucle.
public func meeshyWithMotion<Result>(
    _ token: MeeshyMotionToken,
    reduceMotion: Bool,
    _ body: () throws -> Result
) rethrows -> Result {
    try meeshyWithAnimation(
        MeeshyMotion.animation(token, reduce: false),
        reduced: MeeshyMotion.animation(token, reduce: true),
        reduceMotion: reduceMotion,
        body
    )
}

/// **`motion.reveal`** : le squelette et le contenu occupent la MÊME place (pile
/// alignée en haut) et se croisent en fondu sous le ressort `rise` ; aucun saut
/// de mise en page. Sous « Réduire les animations », l'échange est sec.
public struct MeeshyRevealZone<Content: View, Placeholder: View>: View {
    private let isRevealed: Bool
    private let content: Content
    private let placeholder: Placeholder

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(
        isRevealed: Bool,
        @ViewBuilder content: () -> Content,
        @ViewBuilder placeholder: () -> Placeholder
    ) {
        self.isRevealed = isRevealed
        self.content = content()
        self.placeholder = placeholder()
    }

    public var body: some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        return ZStack(alignment: .top) {
            if isRevealed {
                content.transition(.opacity)
            } else {
                placeholder.transition(.opacity)
            }
        }
        .animation(MeeshyMotion.animation(named: .reveal, reduce: reduce), value: isRevealed)
    }
}
