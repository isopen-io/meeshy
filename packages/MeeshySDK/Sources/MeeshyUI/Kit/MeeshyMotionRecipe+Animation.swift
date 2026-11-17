import SwiftUI

/// **K26 — la table de mouvement** : les fonctions que tous les atomes du kit
/// appellent. L'enum `MeeshyMotion` existait déjà (la porte du mouvement réduit,
/// `Theme/Accessibility.swift`) : elle garde son nom et reçoit la table.
public extension MeeshyMotion {

    /// Le décalage d'une cascade, en millisecondes : 80 par rang, rang borné à 3,
    /// un rang négatif vaut 0.
    nonisolated static func delayMilliseconds(index: Int) -> Int {
        MeeshyMotionRecipe.cascadeStepMilliseconds * min(max(index, 0), MeeshyMotionRecipe.cascadeMaxRank)
    }

    /// Le même décalage, en secondes, pour `Animation.delay`.
    nonisolated static func delay(index: Int) -> Double {
        Double(delayMilliseconds(index: index)) / 1000
    }

    /// L'avancement d'un mouvement piloté (`collapse`), de 0 à 1, borné aux deux
    /// bouts. Une plage nulle est atteinte d'emblée.
    nonisolated static func progress(offset: Double, range: ClosedRange<Double> = 0...Double(MeeshyMotionRecipe.collapseRange)) -> Double {
        let span = range.upperBound - range.lowerBound
        guard span > 0, offset.isFinite else { return span > 0 ? 0 : 1 }
        return min(max((offset - range.lowerBound) / span, 0), 1)
    }

    /// Le sens d'un déplacement horizontal : reflété en lecture de droite à gauche.
    nonisolated static func horizontalSign(isRightToLeft: Bool) -> Double {
        isRightToLeft ? -1 : 1
    }

    /// L'animation d'un jeton : son ressort ou sa boucle, le fondu court sous
    /// réduction, `nil` pour un avancement piloté ou une boucle arrêtée.
    nonisolated static func animation(_ token: MeeshyMotionToken, reduce: Bool) -> Animation? {
        let recipe = MeeshyMotionRecipe.resolve(token: token, reduce: reduce)
        if reduce {
            switch recipe.reduced {
            case .fade(let milliseconds): return .easeOut(duration: Double(milliseconds) / 1000)
            case .stop: return nil
            }
        }
        switch token {
        case .morph, .travel, .flip, .rise:
            return .spring(response: recipe.response ?? 0, dampingFraction: recipe.damping ?? 1)
        case .collapse:
            return nil
        case .float:
            return .easeInOut(duration: Double(recipe.durationMilliseconds) / 1000)
                .repeatForever(autoreverses: true)
        case .pulse:
            return .easeOut(duration: Double(recipe.durationMilliseconds) / 1000)
                .repeatForever(autoreverses: false)
        }
    }

    /// L'animation d'une boucle (`pulse`, `float`) selon qu'elle tourne : `nil`
    /// quand elle s'arrête ou qu'elle est réduite, pour que le changement d'état
    /// coupe la répétition au lieu de la relancer.
    nonisolated static func loopAnimation(_ token: MeeshyMotionToken, isRunning: Bool, reduce: Bool) -> Animation? {
        guard isRunning, !reduce else { return nil }
        return animation(token, reduce: false)
    }

    /// Le retour à jouer pour un jeton : celui de la table, ou celui que l'hôte
    /// impose ; `none` et un hôte désactivé ne jouent rien.
    nonisolated static func hapticToPlay(for token: MeeshyMotionToken,
                                         override: MeeshyMotionHaptic? = nil,
                                         isEnabled: Bool = true) -> MeeshyMotionHaptic? {
        guard isEnabled else { return nil }
        let chosen = override ?? MeeshyMotionRecipe.resolve(token: token).haptic
        return chosen == MeeshyMotionHaptic.none ? nil : chosen
    }

    /// Joue un retour, par le seul site d'haptique du SDK.
    @MainActor
    static func play(_ haptic: MeeshyMotionHaptic) {
        switch haptic {
        case .light: HapticFeedback.light()
        case .medium: HapticFeedback.medium()
        case .rigid: HapticFeedback.rigid()
        case .none: break
        }
    }

    /// Joue le retour d'un jeton, une fois.
    @MainActor
    static func play(token: MeeshyMotionToken, override: MeeshyMotionHaptic? = nil, isEnabled: Bool = true) {
        guard let haptic = hapticToPlay(for: token, override: override, isEnabled: isEnabled) else { return }
        play(haptic)
    }
}

public extension View {

    /// Anime ce qui change avec `value` selon le jeton, et le fondu court sous
    /// « Réduire les animations ».
    func meeshyMotion<Value: Equatable>(_ token: MeeshyMotionToken, value: Value) -> some View {
        modifier(MeeshyMotionModifier(token: token, value: value))
    }

    /// L'élément partagé d'un voyage : la même clé des deux côtés.
    func meeshyTravel<ID: Hashable>(id: ID, in namespace: Namespace.ID) -> some View {
        matchedGeometryEffect(id: id, in: namespace)
    }
}

private struct MeeshyMotionModifier<Value: Equatable>: ViewModifier {
    let token: MeeshyMotionToken
    let value: Value

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    func body(content: Content) -> some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        return content.animation(MeeshyMotion.animation(token, reduce: reduce), value: value)
    }
}
