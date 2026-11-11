import SwiftUI

/// Ce que l'hôte passe à un curseur, en valeurs : la base de son égalité.
nonisolated struct MeeshyLabeledSliderSpec: Sendable, Equatable {
    let label: String
    let valueText: String
    let rule: MeeshyLabeledSliderRule
    let neutral: Double?
    let resetLabel: String?
    let tint: Color?
    let haptic: MeeshyLabeledSliderHaptic

    func interaction(isEnabled: Bool) -> MeeshyLabeledSliderInteraction {
        MeeshyLabeledSliderInteraction(rule: rule, neutral: neutral, haptic: haptic, isEnabled: isEnabled)
    }

    func isOffNeutral(_ value: Double) -> Bool {
        neutral.map { rule.snap(value) != rule.snap($0) } ?? false
    }
}

/// Joue les effets d'une interaction : l'hôte reçoit l'édition et la valeur,
/// le tic passe par `HapticFeedback`.
enum MeeshyLabeledSliderEffects {
    static func play(_ effects: [MeeshyLabeledSliderEffect], value: Binding<Double>, onEditingChanged: ((Bool) -> Void)?) {
        for effect in effects {
            switch effect {
            case .editing(let isEditing): onEditingChanged?(isEditing)
            case .value(let next): value.wrappedValue = next
            case .haptic: HapticFeedback.light()
            }
        }
    }
}

private struct MeeshyLabeledSliderForcesPressedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Fige le pouce tenu : la tuile « pressé » du catalogue, rien d'autre.
    var meeshyLabeledSliderForcesPressed: Bool {
        get { self[MeeshyLabeledSliderForcesPressedKey.self] }
        set { self[MeeshyLabeledSliderForcesPressedKey.self] = newValue }
    }
}

/// Une piste fine et son pouce, sans en-tête visible : l'élément d'accessibilité
/// porte le nom, la valeur lue et l'action de remise.
///
/// - Glisser à l'horizontale règle ; un toucher bref y porte le pouce ; un glissé
///   vertical reste à l'hôte.
/// - `onEditingChanged(true)` au début du geste, `(false)` au lever, à
///   l'annulation, à la disparition doigt posé, et autour de chaque ajustement
///   au clavier ou au lecteur d'écran.
/// - Désactivé (`.disabled`) : contenu à 40 %, ni geste ni haptique.
///
/// `Equatable` sur les valeurs (fermeture hors comparaison) : un hôte qui se
/// re-rend à paramètres égaux ne re-rend pas la piste.
public struct MeeshySliderTrack: View {
    let spec: MeeshyLabeledSliderSpec
    @Binding var value: Double
    let onEditingChanged: ((Bool) -> Void)?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var tone
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    @Environment(\.meeshyLabeledSliderForcesPressed) private var forcesPressed
    @State private var isPressed = false
    @State private var isHovered = false
    @State private var hasKeyboardFocus = false
    @State private var ignoresDrag = false
    @GestureState private var isTouching = false

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
        self.init(
            spec: MeeshyLabeledSliderSpec(
                label: label, valueText: valueText, rule: MeeshyLabeledSliderRule(range: range, step: step),
                neutral: neutral, resetLabel: resetLabel, tint: tint, haptic: haptic
            ),
            value: value,
            onEditingChanged: onEditingChanged
        )
    }

    init(spec: MeeshyLabeledSliderSpec, value: Binding<Double>, onEditingChanged: ((Bool) -> Void)?) {
        assert(!spec.label.isEmpty, "MeeshyLabeledSlider : le nom accessible est obligatoire et non vide")
        self.spec = spec
        _value = value
        self.onEditingChanged = onEditingChanged
    }

    public var body: some View {
        let recipe = currentRecipe
        return GeometryReader { geometry in
            MeeshySliderTrackDrawing(
                fraction: spec.rule.fraction(of: value, isRTL: isRTL),
                isRTL: isRTL,
                width: geometry.size.width,
                recipe: recipe,
                isDark: colorScheme == .dark,
                showsFocusRing: hasKeyboardFocus && isEnabled
            )
            .meeshyAnimation(settleAnimation, value: value)
            .contentShape(Rectangle())
            .gesture(trackGesture(width: geometry.size.width))
            .environment(\.layoutDirection, .leftToRight)
        }
        .frame(height: recipe.hitHeight)
        .opacity(recipe.contentOpacity)
        .onHover { isHovered = $0 }
        .adaptiveOnChange(of: isTouching) { _, touching in
            if !touching { release() }
        }
        .onDisappear(perform: release)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(spec.label))
        .accessibilityValue(Text(spec.valueText))
        .accessibilityAdjustableAction { direction in
            perform(direction == .increment ? .pageUp : .pageDown)
        }
        .modifier(MeeshyLabeledSliderResetAction(name: interaction.resetActionName(spec.resetLabel)) { perform(.reset) })
        .modifier(MeeshyLabeledSliderKeys(isEnabled: isEnabled, onCommand: perform) { hasKeyboardFocus = $0 })
    }

    /// Jamais d'animation pendant le glissé : le pouce suit le doigt dans la même image.
    private var settleAnimation: Animation? {
        isPressed ? nil : .easeOut(duration: MeeshyLabeledSliderRecipe.settleDuration)
    }

    private func trackGesture(width: CGFloat) -> some Gesture {
        let drag = DragGesture(minimumDistance: MeeshyLabeledSliderRecipe.dragThreshold)
            .updating($isTouching) { _, touching, _ in touching = true }
            .onChanged { geste in follow(geste, width: width) }
            .onEnded { _ in release() }
        let tap = SpatialTapGesture()
            .onEnded { touch in
                play(interaction.jump(from: value, toFraction: Self.fraction(at: touch.location.x, width: width), isRTL: isRTL))
            }
        return drag.exclusively(before: tap)
    }

    private func follow(_ geste: DragGesture.Value, width: CGFloat) {
        if !isPressed, !ignoresDrag, abs(geste.translation.height) > abs(geste.translation.width) {
            ignoresDrag = true
        }
        guard !ignoresDrag else { return }
        let effects = interaction.drag(
            from: value, toFraction: Self.fraction(at: geste.location.x, width: width), isRTL: isRTL, isEditing: isPressed
        )
        if !effects.isEmpty, !isPressed { isPressed = true }
        play(effects)
    }

    private func release() {
        if ignoresDrag { ignoresDrag = false }
        guard isPressed else { return }
        isPressed = false
        play(interaction.release(isEditing: true))
    }

    private func perform(_ command: MeeshyLabeledSliderCommand) {
        play(interaction.perform(command, from: value, isRTL: isRTL))
    }

    private func play(_ effects: [MeeshyLabeledSliderEffect]) {
        MeeshyLabeledSliderEffects.play(effects, value: $value, onEditingChanged: onEditingChanged)
    }

    private static func fraction(at x: CGFloat, width: CGFloat) -> Double {
        let usable = max(width - 2 * MeeshyLabeledSliderRecipe.thumbInset, 1)
        return Double((x - MeeshyLabeledSliderRecipe.thumbInset) / usable)
    }

    private var interaction: MeeshyLabeledSliderInteraction { spec.interaction(isEnabled: isEnabled) }

    private var isRTL: Bool { layoutDirection == .rightToLeft }

    private var currentRecipe: MeeshyLabeledSliderRecipe {
        MeeshyLabeledSliderRecipe.resolve(
            tone: tone,
            isEnabled: isEnabled,
            isPressed: isPressed || forcesPressed,
            isOffNeutral: spec.isOffNeutral(value),
            tint: spec.tint,
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion),
            isHovered: isHovered
        )
    }
}

extension MeeshySliderTrack: Equatable {
    public static func == (lhs: MeeshySliderTrack, rhs: MeeshySliderTrack) -> Bool {
        lhs.spec == rhs.spec && lhs.value == rhs.value
    }
}

/// Le dessin de la piste, en coordonnées de GAUCHE à droite (le miroir RTL est
/// déjà dans `fraction`) : ne bougent que des transformations — la translation
/// du remplissage et du pouce, l'échelle du pouce, l'opacité du halo.
private struct MeeshySliderTrackDrawing: View {
    let fraction: Double
    let isRTL: Bool
    let width: CGFloat
    let recipe: MeeshyLabeledSliderRecipe
    let isDark: Bool
    let showsFocusRing: Bool

    var body: some View {
        let centre = MeeshyLabeledSliderRecipe.thumbInset
            + CGFloat(fraction) * max(width - 2 * MeeshyLabeledSliderRecipe.thumbInset, 0)
        return ZStack(alignment: .leading) {
            rail(centre: centre)
            thumb
                .offset(x: centre - MeeshyLabeledSliderRecipe.haloDiameter / 2)
        }
        .frame(width: width, height: recipe.hitHeight, alignment: .leading)
    }

    private func rail(centre: CGFloat) -> some View {
        Capsule()
            .fill(recipe.emptyTrackColor(isDark: isDark))
            .frame(width: width, height: MeeshyLabeledSliderRecipe.trackHeight)
            .overlay(alignment: .leading) {
                Capsule()
                    .fill(recipe.fillColor(isDark: isDark))
                    .offset(x: isRTL ? centre : centre - width)
            }
            .clipShape(Capsule())
    }

    private var thumb: some View {
        ZStack {
            Circle()
                .fill(recipe.haloColor(isDark: isDark))
                .frame(width: MeeshyLabeledSliderRecipe.haloDiameter, height: MeeshyLabeledSliderRecipe.haloDiameter)
            Circle()
                .fill(recipe.inkColor(isDark: isDark))
                .frame(width: MeeshyLabeledSliderRecipe.thumbDiameter, height: MeeshyLabeledSliderRecipe.thumbDiameter)
                .shadow(
                    color: recipe.shadowColor,
                    radius: MeeshyLabeledSliderRecipe.shadowRadius,
                    x: 0,
                    y: MeeshyLabeledSliderRecipe.shadowOffsetY
                )
                .scaleEffect(recipe.thumbScale)
            if showsFocusRing {
                Circle()
                    .strokeBorder(recipe.inkColor(isDark: isDark), lineWidth: MeeshyLabeledSliderRecipe.focusRingWidth)
                    .frame(width: MeeshyLabeledSliderRecipe.focusRingDiameter, height: MeeshyLabeledSliderRecipe.focusRingDiameter)
            }
        }
        .frame(width: MeeshyLabeledSliderRecipe.haloDiameter, height: MeeshyLabeledSliderRecipe.haloDiameter)
        .meeshyAnimation(MeeshyAnimation.springFast, value: recipe.thumbScale)
        .meeshyAnimation(MeeshyAnimation.springFast, value: recipe.haloOpacity)
    }
}

/// L'action « remise au neutre » n'existe que si le curseur a un neutre et un nom d'action.
private struct MeeshyLabeledSliderResetAction: ViewModifier {
    let name: String?
    let reset: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if let name {
            content.accessibilityAction(named: Text(name), reset)
        } else {
            content
        }
    }
}

/// Le clavier (iOS 17+, iPad) : flèches, Page préc. / suiv., Début / Fin, Suppr.
/// Le focus ne s'offre pas à un curseur désactivé ; l'anneau est dessiné par la piste.
private struct MeeshyLabeledSliderKeys: ViewModifier {
    let isEnabled: Bool
    let onCommand: (MeeshyLabeledSliderCommand) -> Void
    let onFocusChange: (Bool) -> Void

    @FocusState private var isFocused: Bool

    init(isEnabled: Bool, onCommand: @escaping (MeeshyLabeledSliderCommand) -> Void, onFocusChange: @escaping (Bool) -> Void) {
        self.isEnabled = isEnabled
        self.onCommand = onCommand
        self.onFocusChange = onFocusChange
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content
                .focusable(isEnabled, interactions: .edit)
                .focused($isFocused)
                .focusEffectDisabled()
                .onKeyPress(keys: Self.keys) { press in
                    guard let command = Self.command(for: press.key) else { return .ignored }
                    onCommand(command)
                    return .handled
                }
                .adaptiveOnChange(of: isFocused) { _, focused in onFocusChange(focused) }
        } else {
            content
        }
    }

    @available(iOS 17.0, macOS 14.0, *)
    private static var keys: Set<KeyEquivalent> {
        [
            .leftArrow, .rightArrow, .upArrow, .downArrow, .pageUp, .pageDown, .home, .end, .delete, .deleteForward,
        ]
    }

    @available(iOS 17.0, macOS 14.0, *)
    private static func command(for key: KeyEquivalent) -> MeeshyLabeledSliderCommand? {
        switch key {
        case .leftArrow: return .arrowLeft
        case .rightArrow: return .arrowRight
        case .upArrow: return .arrowUp
        case .downArrow: return .arrowDown
        case .pageUp: return .pageUp
        case .pageDown: return .pageDown
        case .home: return .home
        case .end: return .end
        case .delete, .deleteForward: return .reset
        default: return nil
        }
    }
}

/// L'en-tête : le nom au bord de début, la valeur lue au bord de fin. Masqué
/// au lecteur d'écran — la piste porte le nom et la valeur. Sans valeur
/// visible, aucune place n'est gardée.
private struct MeeshyLabeledSliderHeader: View, Equatable {
    let label: String
    let valueText: String?
    let ink: Color
    let valueColor: Color
    let reset: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.sm) {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundStyle(ink)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let valueText {
                Text(valueText)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize).monospacedDigit())
                    .foregroundStyle(valueColor)
                    .lineLimit(1)
                    .fixedSize()
                    .modifier(MeeshyLabeledSliderValueReset(reset: reset))
            }
        }
        .accessibilityHidden(true)
    }

    static func == (lhs: MeeshyLabeledSliderHeader, rhs: MeeshyLabeledSliderHeader) -> Bool {
        lhs.label == rhs.label && lhs.valueText == rhs.valueText && lhs.ink == rhs.ink
            && lhs.valueColor == rhs.valueColor && (lhs.reset == nil) == (rhs.reset == nil)
    }
}

/// Deux touchers sur la valeur la remettent au neutre — seulement s'il existe.
private struct MeeshyLabeledSliderValueReset: ViewModifier {
    let reset: (() -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let reset {
            content
                .contentShape(Rectangle())
                .onTapGesture(count: 2, perform: reset)
        } else {
            content
        }
    }
}

/// Le curseur d'un réglage continu : le nom à gauche, la valeur lue à droite,
/// la piste et son pouce dessous. Il ne choisit ni le ton ni le verre : l'hôte
/// les fixe (`\.meeshyGlassTone`), et le conteneur lui revient.
///
/// `Equatable` sur les valeurs (fermeture hors comparaison) : les autres
/// curseurs d'une grille ne se re-rendent pas pendant qu'on en glisse un.
public struct MeeshyLabeledSlider: View {
    let spec: MeeshyLabeledSliderSpec
    let showsValue: Bool
    let value: Binding<Double>
    let onEditingChanged: ((Bool) -> Void)?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
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
        self.spec = MeeshyLabeledSliderSpec(
            label: label, valueText: valueText, rule: MeeshyLabeledSliderRule(range: range, step: step),
            neutral: neutral, resetLabel: resetLabel, tint: tint, haptic: haptic
        )
        self.showsValue = showsValue
        self.value = value
        self.onEditingChanged = onEditingChanged
    }

    public var body: some View {
        let recipe = MeeshyLabeledSliderRecipe.resolve(
            tone: tone, isEnabled: isEnabled, isPressed: false,
            isOffNeutral: spec.isOffNeutral(value.wrappedValue), tint: spec.tint
        )
        let isDark = colorScheme == .dark
        return VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            MeeshyLabeledSliderHeader(
                label: spec.label,
                valueText: showsValue ? spec.valueText : nil,
                ink: recipe.inkColor(isDark: isDark),
                valueColor: recipe.valueColor(isDark: isDark),
                reset: resetAction
            )
            .equatable()
            .opacity(recipe.contentOpacity)
            MeeshySliderTrack(spec: spec, value: value, onEditingChanged: onEditingChanged)
                .equatable()
        }
    }

    private var resetAction: (() -> Void)? {
        guard spec.neutral != nil else { return nil }
        return reset
    }

    private func reset() {
        let effects = spec.interaction(isEnabled: isEnabled).perform(.reset, from: value.wrappedValue, isRTL: false)
        MeeshyLabeledSliderEffects.play(effects, value: value, onEditingChanged: onEditingChanged)
    }
}

extension MeeshyLabeledSlider: Equatable {
    public static func == (lhs: MeeshyLabeledSlider, rhs: MeeshyLabeledSlider) -> Bool {
        lhs.spec == rhs.spec && lhs.showsValue == rhs.showsValue && lhs.value.wrappedValue == rhs.value.wrappedValue
    }
}
