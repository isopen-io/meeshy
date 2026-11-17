import SwiftUI

/// **Le bouton libellé (K40)** : toute action nommée est une capsule libellée,
/// pleine, de verre, à contour ou en texte, partout la même. Il porte un verbe et
/// répond au doigt ; il ne sait pas ce que le verbe déclenche.
///
/// Agnostique : le titre est déjà traduit, l'action est une fermeture, la teinte
/// une couleur opaque de l'hôte. Le verre vient de K01 (`meeshyGlass`), jamais
/// dessiné ici. Les formes `round` et `hold` rapportent un toucher ou un maintien,
/// rien d'autre.
public struct MeeshyButton<Trailing: View>: View {
    private let title: String
    private let systemImage: String?
    private let kind: MeeshyButtonKind
    private let size: MeeshyButtonSize
    private let shape: MeeshyButtonShape
    private let width: MeeshyButtonWidth
    private let tint: Color?
    private let isDestructive: Bool
    private let isPending: Bool
    private let isDeferred: Bool
    private let disabledReason: String?
    private let holdState: MeeshyButtonHoldState
    private let onHoldChange: ((Bool) -> Void)?
    private let action: () -> Void
    private let trailing: Trailing

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }
    @State private var holdLaw = MeeshyButtonHoldLaw()
    @GestureState private var isTouching = false

    public init(_ title: String,
                systemImage: String? = nil,
                kind: MeeshyButtonKind = .primary,
                size: MeeshyButtonSize = .s50,
                shape: MeeshyButtonShape = .capsule,
                width: MeeshyButtonWidth = .fit,
                tint: Color? = nil,
                isDestructive: Bool = false,
                isPending: Bool = false,
                isDeferred: Bool = false,
                disabledReason: String? = nil,
                holdState: MeeshyButtonHoldState = .idle,
                onHoldChange: ((Bool) -> Void)? = nil,
                action: @escaping () -> Void,
                @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.systemImage = systemImage
        self.kind = kind
        self.size = size
        self.shape = shape
        self.width = width
        self.tint = tint
        self.isDestructive = isDestructive
        self.isPending = isPending
        self.isDeferred = isDeferred
        self.disabledReason = disabledReason
        self.holdState = holdState
        self.onHoldChange = onHoldChange
        self.action = action
        self.trailing = trailing()
    }

    public var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            control
            if let reason = MeeshyButtonWords.hint(disabledReason: disabledReason, isEnabled: isEnabled) {
                Text(verbatim: reason)
                    .meeshyScaledFont(MeeshyFont.smallSize)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder
    private var control: some View {
        if shape == .hold {
            holdControl
        } else {
            Button(action: perform) {
                MeeshyButtonLabel(title: title, systemImage: systemImage, width: width, kind: kind,
                                  size: size, shape: shape, tint: tint, isDestructive: isDestructive,
                                  isPending: isPending, isDeferred: isDeferred, hasTrailing: hasTrailing,
                                  trailing: trailing)
            }
            .buttonStyle(MeeshyButtonStyle(kind: kind, size: size, shape: shape, tint: tint,
                                           isDestructive: isDestructive, isPending: isPending,
                                           isDeferred: isDeferred, reduceMotion: reduceMotion))
            .allowsHitTesting(isEnabled && !isPending)
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isButton)
            .modifier(MeeshyButtonSpokenState(
                isPending: isPending, isDeferred: isDeferred,
                hint: MeeshyButtonWords.hint(disabledReason: disabledReason, isEnabled: isEnabled)
            ))
        }
    }

    private var hasTrailing: Bool { Trailing.self != EmptyView.self }

    private func perform() {
        guard isEnabled, !isPending else { return }
        MeeshyMotion.play(token: .morph)
        action()
    }

    private var holdControl: some View {
        let recipe = recipeValue(isPressed: holdState == .held || holdState == .live)
        let diameter = recipe.diameter ?? MeeshyButtonRecipe.holdDiameter
        return MeeshyButtonLabel(title: title, systemImage: systemImage, width: .fit, kind: kind, size: size,
                                 shape: .hold, tint: tint, isDestructive: isDestructive, isPending: isPending,
                                 isDeferred: false, hasTrailing: false, trailing: EmptyView())
            .modifier(MeeshyButtonSurfaceModifier(recipe: recipe, tint: tint, shape: .hold, width: .fit,
                                                  isPressed: holdState == .held || holdState == .live))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .updating($isTouching) { _, touching, _ in touching = true }
                    .onChanged { value in
                        let inside = MeeshyButtonHoldLaw.isInside(x: Double(value.location.x),
                                                                  y: Double(value.location.y),
                                                                  diameter: diameter)
                        report(holdLaw.track(isInside: inside, isEnabled: isEnabled && !isPending))
                    }
                    .onEnded { _ in report(holdLaw.endTouch()) }
            )
            .adaptiveOnChange(of: isTouching) { _, touching in
                guard !touching else { return }
                report(holdLaw.endTouch())
            }
            .onDisappear { report(holdLaw.endTouch()) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isButton)
            .modifier(MeeshyButtonSpokenState(
                isPending: isPending, isDeferred: false,
                hint: MeeshyButtonWords.hint(disabledReason: disabledReason, isEnabled: isEnabled)
            ))
            .accessibilityAction {
                report(holdLaw.toggle(isEnabled: isEnabled && !isPending))
            }
    }

    private func report(_ held: Bool?) {
        guard let held else { return }
        onHoldChange?(held)
    }

    private func recipeValue(isPressed: Bool) -> MeeshyButtonRecipe {
        MeeshyButtonRecipe.resolve(kind: kind, size: size, shape: shape, isPressed: isPressed,
                                   isEnabled: isEnabled, isPending: isPending, isDeferred: isDeferred,
                                   isDestructive: isDestructive, reduceMotion: reduceMotion)
    }
}

extension MeeshyButton where Trailing == EmptyView {
    public init(_ title: String,
                systemImage: String? = nil,
                kind: MeeshyButtonKind = .primary,
                size: MeeshyButtonSize = .s50,
                shape: MeeshyButtonShape = .capsule,
                width: MeeshyButtonWidth = .fit,
                tint: Color? = nil,
                isDestructive: Bool = false,
                isPending: Bool = false,
                isDeferred: Bool = false,
                disabledReason: String? = nil,
                holdState: MeeshyButtonHoldState = .idle,
                onHoldChange: ((Bool) -> Void)? = nil,
                action: @escaping () -> Void) {
        self.init(title, systemImage: systemImage, kind: kind, size: size, shape: shape, width: width,
                  tint: tint, isDestructive: isDestructive, isPending: isPending, isDeferred: isDeferred,
                  disabledReason: disabledReason, holdState: holdState, onHoldChange: onHoldChange,
                  action: action, trailing: { EmptyView() })
    }
}

/// Le style : l'appui (échelle 0,94, teinte assombrie) et la matière. Il lit
/// `isPressed` du bouton système, donc l'action part au relâcher dans la cible.
private struct MeeshyButtonStyle: ButtonStyle {
    let kind: MeeshyButtonKind
    let size: MeeshyButtonSize
    let shape: MeeshyButtonShape
    let tint: Color?
    let isDestructive: Bool
    let isPending: Bool
    let isDeferred: Bool
    let reduceMotion: Bool

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let recipe = MeeshyButtonRecipe.resolve(kind: kind, size: size, shape: shape,
                                                isPressed: configuration.isPressed, isEnabled: isEnabled,
                                                isPending: isPending, isDeferred: isDeferred,
                                                isDestructive: isDestructive, reduceMotion: reduceMotion)
        return configuration.label
            .modifier(MeeshyButtonSurfaceModifier(recipe: recipe, tint: tint, shape: shape, width: .fit,
                                                  isPressed: configuration.isPressed))
    }
}

/// La matière du bouton : le fond du genre, l'échelle de l'appui, la cible de 44.
private struct MeeshyButtonSurfaceModifier: ViewModifier {
    let recipe: MeeshyButtonRecipe
    let tint: Color?
    let shape: MeeshyButtonShape
    let width: MeeshyButtonWidth
    let isPressed: Bool

    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let isDark = colorScheme == .dark
        let ink = MeeshyButtonColors.ink(recipe.ink, tint: tint, isDark: isDark)
        return sized(content.foregroundStyle(ink))
            .modifier(MeeshyButtonFill(recipe: recipe, tint: tint, isPressed: isPressed, ink: ink, isDark: isDark))
            .opacity(recipe.contentOpacity)
            .scaleEffect(CGFloat(recipe.scale))
            .contentShape(Capsule().inset(by: CGFloat(-(recipe.tapHeight - recipe.height) / 2)))
    }

    @ViewBuilder
    private func sized<Body: View>(_ body: Body) -> some View {
        if let diameter = recipe.diameter {
            body.frame(width: CGFloat(diameter), height: CGFloat(diameter))
        } else {
            body.frame(minHeight: CGFloat(recipe.height))
        }
    }
}

private struct MeeshyButtonFill: ViewModifier {
    let recipe: MeeshyButtonRecipe
    let tint: Color?
    let isPressed: Bool
    let ink: Color
    let isDark: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        switch recipe.surface {
        case .glass:
            content.meeshyGlass(in: Capsule(), isInteractive: true, isPressed: isPressed)
        case .clear:
            content.overlay(
                Capsule().strokeBorder(ink, lineWidth: recipe.outlineWidth)
            )
        default:
            content
                .background(Capsule().fill(MeeshyButtonColors.fill(recipe.surface, tint: tint, isDark: isDark)))
                .brightness(recipe.isDarkened ? -0.08 : 0)
        }
    }
}

/// Le contenu : glyphe (ou indicateur à sa place), libellé, emplacement de fin.
/// La largeur ne bouge pas de l'état de repos à l'état occupé.
private struct MeeshyButtonLabel<Trailing: View>: View {
    let title: String
    let systemImage: String?
    let width: MeeshyButtonWidth
    let kind: MeeshyButtonKind
    let size: MeeshyButtonSize
    let shape: MeeshyButtonShape
    let tint: Color?
    let isDestructive: Bool
    let isPending: Bool
    let isDeferred: Bool
    let hasTrailing: Bool
    let trailing: Trailing

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    var body: some View {
        let recipe = MeeshyButtonRecipe.resolve(kind: kind, size: size, shape: shape, isPressed: false,
                                                isEnabled: isEnabled, isPending: isPending,
                                                isDeferred: isDeferred, isDestructive: isDestructive,
                                                reduceMotion: reduceMotion)
        HStack(spacing: MeeshyButtonRecipe.glyphGap) {
            leading(recipe: recipe)
            if shape == .capsule {
                Text(verbatim: title)
                    .meeshyScaledFont(CGFloat(recipe.fontSize), weight: .bold)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            if hasTrailing {
                trailing.accessibilityHidden(true)
            }
            if recipe.showsDeferredClock {
                Image(systemName: "clock.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: MeeshyIconSize.xs, height: MeeshyIconSize.xs)
                    .accessibilityHidden(true)
            }
        }
        .padding(.leading, CGFloat(recipe.horizontalMargin))
        .padding(.trailing, CGFloat(recipe.horizontalMargin - (hasTrailing ? MeeshyButtonRecipe.trailingMarginReduction : 0)))
        .frame(maxWidth: width == .fill ? .infinity : nil)
    }

    @ViewBuilder
    private func leading(recipe: MeeshyButtonRecipe) -> some View {
        if recipe.showsIndicator {
            ProgressView()
                .controlSize(.small)
                .frame(width: CGFloat(recipe.glyphSize), height: CGFloat(recipe.glyphSize))
                .accessibilityHidden(true)
        } else if let systemImage {
            Image(systemName: systemImage)
                .resizable()
                .scaledToFit()
                .frame(width: CGFloat(recipe.glyphSize), height: CGFloat(recipe.glyphSize))
                .accessibilityHidden(true)
        }
    }
}

private struct MeeshyButtonSpokenState: ViewModifier {
    let isPending: Bool
    let isDeferred: Bool
    let hint: String?

    func body(content: Content) -> some View {
        let value = MeeshyButtonWords.spokenValue(isPending: isPending, isDeferred: isDeferred)
        content
            .accessibilityValue(value ?? "")
            .accessibilityHint(hint ?? "")
    }
}

/// Les couleurs des rôles du bouton : la seule traduction rôle vers couleur.
enum MeeshyButtonColors {
    static func fill(_ surface: MeeshyButtonSurface, tint: Color?, isDark: Bool) -> Color {
        switch surface {
        case .brand: return MeeshyColors.brandPrimary
        case .accent: return tint ?? MeeshyColors.brandDeep
        case .tintedSoft: return (tint ?? MeeshyColors.brandPrimary).opacity(MeeshyOpacity.light + 0.01)
        case .dangerSoft: return MeeshyColors.error.opacity(0.13)
        case .glass, .clear: return .clear
        }
    }

    static func ink(_ ink: MeeshyButtonInk, tint: Color?, isDark: Bool) -> Color {
        switch ink {
        case .onBrand, .onAccent, .onGlass: return MeeshyColors.onMedia
        case .tint: return tint ?? (isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600)
        case .neutral: return tint ?? MeeshyColors.textPrimary(isDark: isDark)
        case .danger: return isDark ? MeeshyColors.error : MeeshyColors.errorInk
        }
    }
}

/// La paire : deux boutons sur une ligne, même hauteur, parts 1,6 et 1 ; elle
/// s'empile (le principal en haut) aux très grandes polices.
public struct MeeshyButtonPair<Primary: View, Secondary: View>: View {
    private let primary: Primary
    private let secondary: Secondary

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(@ViewBuilder primary: () -> Primary, @ViewBuilder secondary: () -> Secondary) {
        self.primary = primary()
        self.secondary = secondary()
    }

    public var body: some View {
        MeeshyButtonPairLayout(isAccessibilitySize: dynamicTypeSize.isAccessibilitySize) {
            primary
            secondary
        }
    }
}

/// La paire mesure ses deux libellés : en ligne aux parts 1,6 et 1 quand chacun
/// tient dans sa part, empilée (le principal en haut, pleine largeur) sinon.
private struct MeeshyButtonPairLayout: Layout {
    let isAccessibilitySize: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 2 else { return .zero }
        let total = width(of: proposal, subviews: subviews)
        if stacks(total: total, subviews: subviews) {
            let heights = subviews.map { $0.sizeThatFits(ProposedViewSize(width: total, height: nil)).height }
            return CGSize(width: total, height: heights.reduce(0, +) + CGFloat(MeeshyButtonPairLaw.spacing))
        }
        let widths = MeeshyButtonPairLaw.widths(total: Double(total))
        let heights = [
            subviews[0].sizeThatFits(ProposedViewSize(width: CGFloat(widths.primary), height: nil)).height,
            subviews[1].sizeThatFits(ProposedViewSize(width: CGFloat(widths.secondary), height: nil)).height,
        ]
        return CGSize(width: total, height: heights.max() ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else { return }
        if stacks(total: bounds.width, subviews: subviews) {
            let primaryHeight = subviews[0].sizeThatFits(ProposedViewSize(width: bounds.width, height: nil)).height
            let secondaryHeight = subviews[1].sizeThatFits(ProposedViewSize(width: bounds.width, height: nil)).height
            subviews[0].place(at: CGPoint(x: bounds.minX, y: bounds.minY), anchor: .topLeading,
                              proposal: ProposedViewSize(width: bounds.width, height: primaryHeight))
            subviews[1].place(at: CGPoint(x: bounds.minX,
                                          y: bounds.minY + primaryHeight + CGFloat(MeeshyButtonPairLaw.spacing)),
                              anchor: .topLeading,
                              proposal: ProposedViewSize(width: bounds.width, height: secondaryHeight))
            return
        }
        let widths = MeeshyButtonPairLaw.widths(total: Double(bounds.width))
        let primaryWidth = CGFloat(widths.primary)
        let secondaryWidth = CGFloat(widths.secondary)
        subviews[0].place(at: CGPoint(x: bounds.minX, y: bounds.minY), anchor: .topLeading,
                          proposal: ProposedViewSize(width: primaryWidth, height: bounds.height))
        subviews[1].place(at: CGPoint(x: bounds.minX + primaryWidth + CGFloat(MeeshyButtonPairLaw.spacing),
                                      y: bounds.minY),
                          anchor: .topLeading,
                          proposal: ProposedViewSize(width: secondaryWidth, height: bounds.height))
    }

    private func idealWidths(_ subviews: Subviews) -> (primary: Double, secondary: Double) {
        (Double(subviews[0].sizeThatFits(.unspecified).width), Double(subviews[1].sizeThatFits(.unspecified).width))
    }

    private func width(of proposal: ProposedViewSize, subviews: Subviews) -> CGFloat {
        if let width = proposal.width, width.isFinite { return width }
        let ideal = idealWidths(subviews)
        return CGFloat(MeeshyButtonPairLaw.neededWidth(primaryIdeal: ideal.primary, secondaryIdeal: ideal.secondary))
    }

    private func stacks(total: CGFloat, subviews: Subviews) -> Bool {
        let ideal = idealWidths(subviews)
        return MeeshyButtonPairLaw.stacks(isAccessibilitySize: isAccessibilitySize, total: Double(total),
                                          primaryIdeal: ideal.primary, secondaryIdeal: ideal.secondary)
    }
}
