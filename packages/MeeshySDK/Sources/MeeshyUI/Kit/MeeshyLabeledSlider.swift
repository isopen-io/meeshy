import SwiftUI

/// Le haptique d'un curseur : un tic aux crans (neutre, bornes, remise), jamais par pas.
public nonisolated enum MeeshyLabeledSliderHaptic: Sendable, Equatable, CaseIterable {
    case light
    case none
}

/// La loi d'un curseur continu : bornage, calage sur le pas, fraction et ajustement.
/// Pure, sans vue : `step` est la TAILLE du pas, `nil` pour une valeur continue.
public nonisolated struct MeeshyLabeledSliderRule: Sendable, Equatable {
    public let range: ClosedRange<Double>
    public let step: Double?

    public init(range: ClosedRange<Double>, step: Double? = nil) {
        self.range = range
        self.step = step
    }

    private var span: Double { range.upperBound - range.lowerBound }

    public func snap(_ value: Double) -> Double {
        let bornee = min(max(value, range.lowerBound), range.upperBound)
        guard let step, step > 0 else { return bornee }
        let cran = range.lowerBound + ((bornee - range.lowerBound) / step).rounded() * step
        return min(max(cran, range.lowerBound), range.upperBound)
    }

    public func fraction(of value: Double, isRTL: Bool = false) -> Double {
        guard span > 0 else { return 0 }
        let base = (snap(value) - range.lowerBound) / span
        return isRTL ? 1 - base : base
    }

    public func value(atFraction fraction: Double, isRTL: Bool = false) -> Double {
        let borne = min(max(fraction, 0), 1)
        return snap(range.lowerBound + (isRTL ? 1 - borne : borne) * span)
    }

    /// Le pas d'une flèche (1 % de l'étendue si continu) ; `coarse` marque le balayage (5 %, arrondi au pas, un pas au moins).
    public func adjusted(_ value: Double, up: Bool, coarse: Bool) -> Double {
        let unite = step ?? span / 100
        let delta: Double
        switch (coarse, step) {
        case (false, _): delta = unite
        case (true, let pas?) where pas > 0: delta = max((span * 0.05 / pas).rounded(), 1) * pas
        case (true, _): delta = span * 0.05
        }
        return snap(value + (up ? delta : -delta))
    }

    public func detentCrossed(from previous: Double, to next: Double, neutral: Double?) -> Bool {
        let neutreFranchi = neutral.map { (neutre: Double) -> Bool in
            let avant = previous - neutre
            let apres = next - neutre
            return avant * apres < 0 || (apres == 0 && avant != 0)
        } ?? false
        let bornes = (previous < range.upperBound && next >= range.upperBound)
            || (previous > range.lowerBound && next <= range.lowerBound)
        return neutreFranchi || bornes
    }

    public func shouldEmit(previous: Double, next: Double) -> Bool {
        snap(previous) != snap(next)
    }
}

/// La recette en valeurs d'un curseur : toutes ses mesures propres, nulle part ailleurs.
public nonisolated struct MeeshyLabeledSliderRecipe: Sendable, Equatable {
    public let trackHeight: CGFloat
    public let thumbDiameter: CGFloat
    public let hitHeight: CGFloat
    public let thumbScale: Double
    public let haloOpacity: Double
    public let shadowRadius: CGFloat
    public let shadowOffsetY: CGFloat
    public let contentOpacity: Double
    public let valueOpacity: Double
    public let ink: Color
    public let fill: Color

    public static func resolve(
        tone: MeeshyGlassTone,
        isEnabled: Bool,
        isPressed: Bool,
        isOffNeutral: Bool,
        tint: Color?,
        reduceMotion: Bool
    ) -> MeeshyLabeledSliderRecipe {
        let tenu = isPressed && isEnabled
        return MeeshyLabeledSliderRecipe(
            trackHeight: 4,
            thumbDiameter: 20,
            hitHeight: MeeshyControlSize.tapTarget,
            thumbScale: tenu && !reduceMotion ? 1.2 : 1,
            haloOpacity: tenu ? 0.32 : 0,
            shadowRadius: 6,
            shadowOffsetY: 2,
            contentOpacity: isEnabled ? 1 : 0.4,
            valueOpacity: isOffNeutral ? 1 : 0.85,
            ink: tone == .theme ? .primary : MeeshyColors.onMedia,
            fill: tint ?? MeeshyColors.onMedia
        )
    }
}

/// Une piste fine et son pouce, sans en-tête visible : l'élément d'accessibilité
/// porte le libellé, la valeur lue et l'action de remise.
public struct MeeshySliderTrack: View {
    @Binding private var value: Double
    private let rule: MeeshyLabeledSliderRule
    private let label: String
    private let valueText: String
    private let neutral: Double?
    private let resetLabel: String?
    private let tint: Color?
    private let haptic: MeeshyLabeledSliderHaptic
    private let onEditingChanged: ((Bool) -> Void)?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.meeshyGlassTone) private var tone
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    @State private var isPressed = false

    public init(
        _ label: String,
        value: Binding<Double>,
        in range: ClosedRange<Double>,
        step: Double? = nil,
        valueText: String,
        neutral: Double? = nil,
        resetLabel: String? = nil,
        tint: Color? = nil,
        haptic: MeeshyLabeledSliderHaptic = .light,
        onEditingChanged: ((Bool) -> Void)? = nil
    ) {
        _value = value
        self.rule = MeeshyLabeledSliderRule(range: range, step: step)
        self.label = label
        self.valueText = valueText
        self.neutral = neutral
        self.resetLabel = resetLabel
        self.tint = tint
        self.haptic = haptic
        self.onEditingChanged = onEditingChanged
    }

    public var body: some View {
        let mesure = recipe
        GeometryReader { geometry in
            piste(mesure: mesure, largeur: geometry.size.width, hauteur: geometry.size.height)
                .contentShape(Rectangle())
                .gesture(glisse(largeur: geometry.size.width))
        }
        .frame(height: mesure.hitHeight)
        .opacity(mesure.contentOpacity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
        .accessibilityValue(Text(valueText))
        .accessibilityAdjustableAction { direction in
            let avant = value
            onEditingChanged?(true)
            value = rule.adjusted(value, up: direction == .increment, coarse: false)
            tic(de: avant, a: value)
            onEditingChanged?(false)
        }
        .modifier(MeeshyLabeledSliderResetAction(resetLabel: neutral == nil ? nil : resetLabel, reset: remise))
    }

    private func piste(mesure: MeeshyLabeledSliderRecipe, largeur: CGFloat, hauteur: CGFloat) -> some View {
        let centre = Self.thumbInset + CGFloat(rule.fraction(of: value, isRTL: isRTL)) * max(largeur - 2 * Self.thumbInset, 0)
        return ZStack(alignment: .leading) {
            Capsule().fill(MeeshyColors.mediaHairline).frame(height: mesure.trackHeight)
            Capsule().fill(mesure.fill)
                .frame(width: max(centre, 0), height: mesure.trackHeight)
                .frame(maxWidth: .infinity, alignment: isRTL ? .trailing : .leading)
            pouce(mesure: mesure)
                .position(x: isRTL ? largeur - centre : centre, y: hauteur / 2)
        }
        .frame(width: largeur, height: hauteur)
    }

    private func pouce(mesure: MeeshyLabeledSliderRecipe) -> some View {
        ZStack {
            Circle()
                .fill(MeeshyColors.onMedia.opacity(mesure.haloOpacity))
                .frame(width: mesure.hitHeight * 0.8, height: mesure.hitHeight * 0.8)
            Circle()
                .fill(MeeshyColors.onMedia)
                .frame(width: mesure.thumbDiameter, height: mesure.thumbDiameter)
                .shadow(color: .black.opacity(0.35), radius: mesure.shadowRadius, x: 0, y: mesure.shadowOffsetY)
                .scaleEffect(mesure.thumbScale)
        }
        .animation(MeeshyAnimation.springFast, value: mesure.thumbScale)
        .accessibilityHidden(true)
    }

    private func glisse(largeur: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { geste in
                if !isPressed {
                    isPressed = true
                    onEditingChanged?(true)
                }
                let avant = value
                let utile = max(largeur - 2 * Self.thumbInset, 1)
                let suivante = rule.value(atFraction: Double((geste.location.x - Self.thumbInset) / utile), isRTL: isRTL)
                guard rule.shouldEmit(previous: avant, next: suivante) else { return }
                value = suivante
                tic(de: avant, a: suivante)
            }
            .onEnded { _ in
                isPressed = false
                onEditingChanged?(false)
            }
    }

    private func remise() {
        guard let neutral, value != neutral else { return }
        onEditingChanged?(true)
        value = neutral
        jouerTic()
        onEditingChanged?(false)
    }

    private func tic(de avant: Double, a suivante: Double) {
        guard rule.detentCrossed(from: avant, to: suivante, neutral: neutral) else { return }
        jouerTic()
    }

    private func jouerTic() {
        guard haptic == .light else { return }
        HapticFeedback.light()
    }

    private var isRTL: Bool { layoutDirection == .rightToLeft }

    private var recipe: MeeshyLabeledSliderRecipe {
        MeeshyLabeledSliderRecipe.resolve(
            tone: tone,
            isEnabled: isEnabled,
            isPressed: isPressed,
            isOffNeutral: neutral.map { value != $0 } ?? true,
            tint: tint,
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
        )
    }

    private static let thumbInset: CGFloat = 10
}

/// L'action « Remise au neutre » n'existe que si le curseur a un neutre et un nom d'action.
private struct MeeshyLabeledSliderResetAction: ViewModifier {
    let resetLabel: String?
    let reset: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if let resetLabel {
            content.accessibilityAction(named: Text(resetLabel)) { reset() }
        } else {
            content
        }
    }
}

/// Le curseur d'un réglage continu : le nom à gauche, la valeur lue à droite,
/// la piste et son pouce dessous. Il ne choisit ni le ton ni le verre : l'hôte les fixe.
public struct MeeshyLabeledSlider: View {
    private let label: String
    private let valueText: String
    private let showsValue: Bool
    private let track: MeeshySliderTrack
    private let value: Binding<Double>
    private let neutral: Double?
    private let haptic: MeeshyLabeledSliderHaptic
    private let onEditingChanged: ((Bool) -> Void)?

    @Environment(\.meeshyGlassTone) private var tone

    public init(
        _ label: String,
        value: Binding<Double>,
        in range: ClosedRange<Double>,
        step: Double? = nil,
        valueText: String,
        showsValue: Bool = true,
        neutral: Double? = nil,
        resetLabel: String? = nil,
        tint: Color? = nil,
        haptic: MeeshyLabeledSliderHaptic = .light,
        onEditingChanged: ((Bool) -> Void)? = nil
    ) {
        self.label = label
        self.valueText = valueText
        self.showsValue = showsValue
        self.value = value
        self.neutral = neutral
        self.haptic = haptic
        self.onEditingChanged = onEditingChanged
        self.track = MeeshySliderTrack(
            label,
            value: value,
            in: range,
            step: step,
            valueText: valueText,
            neutral: neutral,
            resetLabel: resetLabel,
            tint: tint,
            haptic: haptic,
            onEditingChanged: onEditingChanged
        )
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.sm) {
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(ink)
                    .lineLimit(2)
                if showsValue {
                    Spacer(minLength: MeeshySpacing.sm)
                    Text(valueText)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular).monospacedDigit())
                        .foregroundStyle(ink.opacity(0.85))
                        .lineLimit(1)
                        .contentShape(Rectangle())
                        .onTapGesture(count: 2, perform: remettre)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityHidden(true)
            track
        }
    }

    private var ink: Color { tone == .theme ? .primary : MeeshyColors.onMedia }

    private func remettre() {
        guard let neutral, value.wrappedValue != neutral else { return }
        onEditingChanged?(true)
        value.wrappedValue = neutral
        if haptic == .light { HapticFeedback.light() }
        onEditingChanged?(false)
    }
}
