import SwiftUI

/// Le haptique d'un curseur : un tic aux crans (neutre, bornes, remise), jamais par pas.
public nonisolated enum MeeshyLabeledSliderHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none
}

/// La loi d'un curseur continu : bornage, calage sur le pas, fraction et ajustement.
/// Pure, sans vue : `step` est la TAILLE du pas, `nil` pour une valeur continue.
public nonisolated struct MeeshyLabeledSliderRule: Sendable, Equatable {
    public let range: ClosedRange<Double>
    public let step: Double?

    /// Le balayage du lecteur d'écran et Page préc. / suiv. : 5 % de l'étendue.
    public static let coarseFraction = 0.05
    /// Une flèche sur une valeur continue : 1 % de l'étendue.
    public static let fineFraction = 0.01

    public init(range: ClosedRange<Double>, step: Double? = nil) {
        self.range = range
        self.step = step.flatMap { $0 > 0 ? $0 : nil }
    }

    private var span: Double { range.upperBound - range.lowerBound }

    public func snap(_ value: Double) -> Double {
        let bounded = min(max(value, range.lowerBound), range.upperBound)
        guard let step else { return bounded }
        let detent = range.lowerBound + ((bounded - range.lowerBound) / step).rounded() * step
        return min(max(detent, range.lowerBound), range.upperBound)
    }

    /// La part de la piste remplie, depuis le bord de GAUCHE : en RTL, le miroir.
    public func fraction(of value: Double, isRTL: Bool = false) -> Double {
        guard span > 0 else { return 0 }
        let base = (snap(value) - range.lowerBound) / span
        return isRTL ? 1 - base : base
    }

    /// La valeur sous une fraction lue depuis le bord de GAUCHE.
    public func value(atFraction fraction: Double, isRTL: Bool = false) -> Double {
        let bounded = min(max(fraction, 0), 1)
        return snap(range.lowerBound + (isRTL ? 1 - bounded : bounded) * span)
    }

    /// Une flèche : le pas (1 % de l'étendue si continu). `coarse` : 5 % de
    /// l'étendue, arrondi au pas, un pas au moins.
    public func adjusted(_ value: Double, up: Bool, coarse: Bool) -> Double {
        let delta = coarse ? coarseDelta : (step ?? span * Self.fineFraction)
        return snap(value + (up ? delta : -delta))
    }

    private var coarseDelta: Double {
        guard let step else { return span * Self.coarseFraction }
        return max((span * Self.coarseFraction / step).rounded(), 1) * step
    }

    /// Le tic : la valeur franchit (ou rejoint) le neutre, ou atteint une borne.
    public func detentCrossed(from previous: Double, to next: Double, neutral: Double?) -> Bool {
        let crossesNeutral = neutral.map { neutre -> Bool in
            let before = previous - neutre
            let after = next - neutre
            return before * after < 0 || (after == 0 && before != 0)
        } ?? false
        let reachesBound = (previous < range.upperBound && next >= range.upperBound)
            || (previous > range.lowerBound && next <= range.lowerBound)
        return crossesNeutral || reachesBound
    }

    public func shouldEmit(previous: Double, next: Double) -> Bool {
        snap(previous) != snap(next)
    }
}

/// Ce qu'un geste ou une commande demande, dans l'ordre : dire à l'hôte qu'on
/// édite, poser une valeur, jouer le tic.
public nonisolated enum MeeshyLabeledSliderEffect: Sendable, Equatable {
    case editing(Bool)
    case value(Double)
    case haptic
}

/// Une commande au clavier ou au lecteur d'écran. Les flèches horizontales
/// s'inversent en RTL ; Page et le balayage valent 5 % ; Suppr remet au neutre.
public nonisolated enum MeeshyLabeledSliderCommand: String, Sendable, Equatable, CaseIterable {
    case arrowLeft
    case arrowRight
    case arrowUp
    case arrowDown
    case pageUp
    case pageDown
    case home
    case end
    case reset
}

/// L'interaction d'un curseur en VALEURS : chaque geste rend ses effets, la vue
/// les joue. Désactivé, rien ne part — ni valeur, ni édition, ni haptique.
public nonisolated struct MeeshyLabeledSliderInteraction: Sendable, Equatable {
    public let rule: MeeshyLabeledSliderRule
    public let neutral: Double?
    public let haptic: MeeshyLabeledSliderHaptic
    public let isEnabled: Bool

    public init(rule: MeeshyLabeledSliderRule, neutral: Double?, haptic: MeeshyLabeledSliderHaptic, isEnabled: Bool) {
        self.rule = rule
        self.neutral = neutral.map { rule.snap($0) }
        self.haptic = haptic
        self.isEnabled = isEnabled
    }

    /// Le doigt glisse : `true` au premier contact, puis la valeur calée,
    /// seulement si elle change.
    public func drag(from current: Double, toFraction fraction: Double, isRTL: Bool, isEditing: Bool) -> [MeeshyLabeledSliderEffect] {
        guard isEnabled else { return [] }
        let next = rule.value(atFraction: fraction, isRTL: isRTL)
        let begin: [MeeshyLabeledSliderEffect] = isEditing ? [] : [.editing(true)]
        guard rule.shouldEmit(previous: current, next: next) else { return begin }
        return begin + [.value(next)] + tic(from: current, to: next)
    }

    /// Le doigt se lève, le geste est annulé ou le curseur disparaît doigt posé.
    public func release(isEditing: Bool) -> [MeeshyLabeledSliderEffect] {
        isEditing ? [.editing(false)] : []
    }

    /// Un toucher bref sur la piste : le pouce y va, en un pas d'annulation.
    public func jump(from current: Double, toFraction fraction: Double, isRTL: Bool) -> [MeeshyLabeledSliderEffect] {
        commit(from: current, to: rule.value(atFraction: fraction, isRTL: isRTL), forcedTic: false)
    }

    public func perform(_ command: MeeshyLabeledSliderCommand, from current: Double, isRTL: Bool) -> [MeeshyLabeledSliderEffect] {
        switch command {
        case .arrowRight: return commit(from: current, to: rule.adjusted(current, up: !isRTL, coarse: false), forcedTic: false)
        case .arrowLeft: return commit(from: current, to: rule.adjusted(current, up: isRTL, coarse: false), forcedTic: false)
        case .arrowUp: return commit(from: current, to: rule.adjusted(current, up: true, coarse: false), forcedTic: false)
        case .arrowDown: return commit(from: current, to: rule.adjusted(current, up: false, coarse: false), forcedTic: false)
        case .pageUp: return commit(from: current, to: rule.adjusted(current, up: true, coarse: true), forcedTic: false)
        case .pageDown: return commit(from: current, to: rule.adjusted(current, up: false, coarse: true), forcedTic: false)
        case .home: return commit(from: current, to: rule.range.lowerBound, forcedTic: false)
        case .end: return commit(from: current, to: rule.range.upperBound, forcedTic: false)
        case .reset: return neutral.map { commit(from: current, to: $0, forcedTic: true) } ?? []
        }
    }

    /// L'action « remise au neutre » n'existe qu'avec un neutre et un nom non vide.
    public func resetActionName(_ resetLabel: String?) -> String? {
        guard neutral != nil, let resetLabel, !resetLabel.isEmpty else { return nil }
        return resetLabel
    }

    private func commit(from current: Double, to target: Double, forcedTic: Bool) -> [MeeshyLabeledSliderEffect] {
        guard isEnabled, target != current else { return [] }
        let feedback = forcedTic ? playable : tic(from: current, to: target)
        return [.editing(true), .value(target)] + feedback + [.editing(false)]
    }

    private func tic(from previous: Double, to next: Double) -> [MeeshyLabeledSliderEffect] {
        rule.detentCrossed(from: previous, to: next, neutral: neutral) ? playable : []
    }

    private var playable: [MeeshyLabeledSliderEffect] {
        haptic == .light ? [.haptic] : []
    }
}
