import SwiftUI

// MARK: - Ligne de références

/// La ligne de références : une rangée de segments séparés par « · », chacun
/// bouton de SA feuille ; ni fond, ni capsule. Absente si vide. Tout tient :
/// elle est posée selon `alignment`, sans estompe. Elle déborde : elle défile,
/// et ses bords s'estompent par la loi de K04 (`MeeshyFadingScrollView`).
/// `Equatable` sur les valeurs (les actions n'y comptent que par leur présence).
public struct MeeshyContextReferenceLine: View, Equatable {
    private let label: String
    private let visible: [MeeshyContextReference]
    private let alignment: MeeshyContextAlignment
    private let surface: MeeshyContextSurface
    private let tint: Color?
    private let haptic: MeeshyContextHaptic

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled

    public init(
        label: String,
        references: [MeeshyContextReference],
        alignment: MeeshyContextAlignment = .center,
        surface: MeeshyContextSurface = .media,
        tint: Color? = nil,
        haptic: MeeshyContextHaptic = .light
    ) {
        assert(!label.isEmpty, "MeeshyContextReferenceLine : le nom accessible est obligatoire")
        self.label = label
        self.visible = MeeshyContextLinesRule.visibleItems(references, text: \.text)
        self.alignment = alignment
        self.surface = surface
        self.tint = tint
        self.haptic = haptic
    }

    public var body: some View {
        if !visible.isEmpty {
            ViewThatFits(in: .horizontal) {
                row.frame(maxWidth: .infinity, alignment: alignment == .center ? .center : .leading)
                MeeshyFadingScrollView(axis: .horizontal, fade: MeeshyContextLinesRecipe.fadeWidth) { row }
            }
            .opacity(isEnabled ? 1 : MeeshyContextLinesRecipe.disabledOpacity)
            .dynamicTypeSize(...MeeshyContextLinesRecipe.maxDynamicTypeSize)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        }
    }

    private var row: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            ForEach(Array(visible.enumerated()), id: \.element.id) { index, reference in
                if index > 0 {
                    Text(verbatim: "·")
                        .foregroundStyle(separatorInk)
                        .accessibilityHidden(true)
                }
                segment(reference)
            }
        }
        .font(MeeshyFont.relative(MeeshyContextLinesRecipe.referenceTextSize, weight: .semibold))
        .foregroundStyle(textInk)
        .fixedSize()
    }

    private func segment(_ reference: MeeshyContextReference) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if let systemImage = reference.systemImage {
                Image(systemName: systemImage).accessibilityHidden(true)
            }
            Text(reference.text).lineLimit(1)
        }
        .contentShape(MeeshyContextHitShape(edge: .bottom))
        .modifier(MeeshyContextGesture(
            label: reference.spokenLabel, hint: reference.hint, haptic: haptic, fades: true,
            longPressLabel: nil, action: reference.action, onLongPress: nil
        ))
    }

    private var baseInk: Color {
        if let tint { return tint }
        return surface == .media ? MeeshyColors.onMedia : MeeshyColors.textPrimary(isDark: colorScheme == .dark)
    }

    private var textInk: Color {
        if tint == nil, surface == .media { return MeeshyColors.onMediaSecondary }
        return baseInk.opacity(MeeshyContextLinesRecipe.textOpacity)
    }

    private var separatorInk: Color {
        if tint == nil, surface == .media { return MeeshyColors.onMediaMuted }
        return baseInk.opacity(MeeshyContextLinesRecipe.waveOpacity)
    }

    public static func == (lhs: MeeshyContextReferenceLine, rhs: MeeshyContextReferenceLine) -> Bool {
        lhs.label == rhs.label && lhs.visible == rhs.visible && lhs.alignment == rhs.alignment
            && lhs.surface == rhs.surface && lhs.tint == rhs.tint && lhs.haptic == rhs.haptic
    }
}

// MARK: - Puce

/// Les VALEURS de la puce : ce que `==` compare.
struct MeeshyContextChipSpec: Equatable {
    let label: String
    let title: String?
    let systemImage: String?
    let detail: String?
    let showsChevron: Bool
    let isExpanded: Bool?
    let tone: MeeshyGlassTone?
    let glassTint: Color?
    let tint: Color?
    let updatesFrequently: Bool
    let isPressed: Bool?
    let hint: String?
    let haptic: MeeshyContextHaptic
    let longPressLabel: String?
    let hasAction: Bool
    let hasLongPress: Bool
    let isVisible: Bool
}

/// La puce : un verre posé sur le contenu (glyphe ou `leading`, valeur,
/// détail, chevron). Le verre vient de K01, interactif quand elle se touche ;
/// K24 ne le dessine pas. Le lecteur d'écran dit « nom, valeur », le nom ne
/// s'échange jamais contre la valeur. Un libellé qui ne tient pas laisse un
/// disque à glyphe. `Equatable` sur les valeurs.
public struct MeeshyContextChip<Leading: View>: View {
    private let spec: MeeshyContextChipSpec
    private let leading: Leading?
    private let action: (() -> Void)?
    private let onLongPress: (() -> Void)?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var hostTone

    init(spec: MeeshyContextChipSpec, leading: Leading?, action: (() -> Void)?, onLongPress: (() -> Void)?) {
        assert(!spec.label.isEmpty, "MeeshyContextChip : le nom accessible est obligatoire")
        self.spec = spec
        self.leading = leading
        self.action = action
        self.onLongPress = onLongPress
    }

    public var body: some View {
        if spec.isVisible {
            fitted
                .modifier(MeeshyContextGesture(
                    label: spec.label, hint: spec.hint, haptic: spec.haptic, fades: false,
                    longPressLabel: spec.longPressLabel, action: action, onLongPress: onLongPress
                ))
                .accessibilityValue(MeeshyContextLinesRule.chipValue(title: spec.title ?? "", detail: spec.detail))
                .accessibilityAddTraits(traits)
                .opacity(isEnabled ? 1 : MeeshyContextLinesRecipe.disabledOpacity)
                .dynamicTypeSize(...MeeshyContextLinesRecipe.maxDynamicTypeSize)
        }
    }

    private var traits: AccessibilityTraits {
        var result: AccessibilityTraits = []
        if spec.updatesFrequently { result.formUnion(.updatesFrequently) }
        if spec.isExpanded == true { result.formUnion(.isSelected) }
        return result
    }

    private var hasGlyph: Bool { leading != nil || spec.systemImage != nil }

    private var fitted: some View {
        ViewThatFits(in: .horizontal) {
            pill
            if hasGlyph { disc }
        }
    }

    private var pill: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            glyph
            if let title = spec.title {
                Text(title).lineLimit(1)
            }
            if let detail = spec.detail {
                Text(detail)
                    .monospacedDigit()
                    .fixedSize()
                    .opacity(MeeshyContextLinesRule.chipDetailOpacity(tone: resolvedTone))
            }
            if spec.showsChevron {
                Image(systemName: "chevron.down")
                    .font(MeeshyFont.relative(MeeshyContextLinesRecipe.chevronSize, weight: .semibold))
                    .rotationEffect(.degrees(spec.isExpanded == true ? 180 : 0))
                    .meeshyAnimation(.easeOut(duration: MeeshyContextLinesRecipe.fadeDuration), value: spec.isExpanded)
                    .accessibilityHidden(true)
            }
        }
        .font(MeeshyFont.relative(MeeshyContextLinesRecipe.chipTextSize, weight: .semibold))
        .foregroundStyle(ink)
        .padding(.horizontal, MeeshySpacing.md)
        .frame(height: MeeshyContextLinesRecipe.chipHeight)
        .meeshyGlass(in: Capsule(), tone: spec.tone, tint: spec.glassTint, isInteractive: spec.hasAction, isPressed: spec.isPressed)
        .contentShape(MeeshyContextHitShape(edge: .vertical))
    }

    private var disc: some View {
        glyph
            .foregroundStyle(ink)
            .frame(width: MeeshyContextLinesRecipe.chipHeight, height: MeeshyContextLinesRecipe.chipHeight)
            .meeshyGlass(in: Circle(), tone: spec.tone, tint: spec.glassTint, isInteractive: spec.hasAction, isPressed: spec.isPressed)
            .contentShape(MeeshyContextHitShape(edge: .vertical))
    }

    @ViewBuilder
    private var glyph: some View {
        if let leading {
            leading.accessibilityHidden(true)
        } else if let systemImage = spec.systemImage {
            Image(systemName: systemImage)
                .font(MeeshyFont.relative(MeeshyContextLinesRecipe.chipGlyphSize, weight: .semibold))
                .accessibilityHidden(true)
        }
    }

    private var resolvedTone: MeeshyGlassTone { spec.tone ?? hostTone }

    /// L'encre : `tint` la remplace ; sinon celle du thème sous le ton `theme`,
    /// celle des médias sous les trois tons de la planche.
    private var ink: Color {
        if let tint = spec.tint { return tint }
        return resolvedTone == .theme ? MeeshyColors.textPrimary(isDark: colorScheme == .dark) : MeeshyColors.onMedia
    }
}

public extension MeeshyContextChip where Leading == MeeshyContextNoLeading {
    init(
        label: String,
        title: String,
        systemImage: String? = nil,
        detail: String? = nil,
        showsChevron: Bool? = nil,
        isExpanded: Bool? = nil,
        tone: MeeshyGlassTone? = nil,
        glassTint: Color? = nil,
        tint: Color? = nil,
        updatesFrequently: Bool = false,
        isPressed: Bool? = nil,
        hint: String? = nil,
        haptic: MeeshyContextHaptic = .light,
        onLongPress: (() -> Void)? = nil,
        longPressLabel: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.init(
            spec: MeeshyContextChipSpec(
                label: label, title: MeeshyContextLinesRule.visibleText(title), systemImage: systemImage,
                detail: MeeshyContextLinesRule.visibleText(detail),
                showsChevron: MeeshyContextLinesRule.showsChevron(hasAction: action != nil, requested: showsChevron),
                isExpanded: isExpanded, tone: tone, glassTint: glassTint, tint: tint,
                updatesFrequently: updatesFrequently, isPressed: isPressed, hint: hint, haptic: haptic,
                longPressLabel: longPressLabel, hasAction: action != nil, hasLongPress: onLongPress != nil,
                isVisible: MeeshyContextLinesRule.showsChip(title: title, glyph: systemImage)
            ),
            leading: nil, action: action, onLongPress: onLongPress
        )
    }
}

public extension MeeshyContextChip {
    /// `leading` remplace le glyphe (point rouge du chrono, émoji d'un cercle,
    /// drapeau) : la puce est alors toujours dessinée.
    init(
        label: String,
        title: String,
        detail: String? = nil,
        showsChevron: Bool? = nil,
        isExpanded: Bool? = nil,
        tone: MeeshyGlassTone? = nil,
        glassTint: Color? = nil,
        tint: Color? = nil,
        updatesFrequently: Bool = false,
        isPressed: Bool? = nil,
        hint: String? = nil,
        haptic: MeeshyContextHaptic = .light,
        onLongPress: (() -> Void)? = nil,
        longPressLabel: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder leading: () -> Leading
    ) {
        self.init(
            spec: MeeshyContextChipSpec(
                label: label, title: MeeshyContextLinesRule.visibleText(title), systemImage: nil,
                detail: MeeshyContextLinesRule.visibleText(detail),
                showsChevron: MeeshyContextLinesRule.showsChevron(hasAction: action != nil, requested: showsChevron),
                isExpanded: isExpanded, tone: tone, glassTint: glassTint, tint: tint,
                updatesFrequently: updatesFrequently, isPressed: isPressed, hint: hint, haptic: haptic,
                longPressLabel: longPressLabel, hasAction: action != nil, hasLongPress: onLongPress != nil,
                isVisible: true
            ),
            leading: leading(), action: action, onLongPress: onLongPress
        )
    }
}

extension MeeshyContextChip: Equatable where Leading: Equatable {
    public static func == (lhs: MeeshyContextChip, rhs: MeeshyContextChip) -> Bool {
        lhs.spec == rhs.spec && lhs.leading == rhs.leading
    }
}
