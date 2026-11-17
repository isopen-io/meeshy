import SwiftUI
import MeeshySDK

/// Le retour du toucher d'une pastille : un tic, ou rien (l'hôte joue le sien).
public nonisolated enum MeeshyCircleScaleHaptic: Sendable, Equatable {
    case onChange
    case none
}

/// **L'échelle de proximité (K33)** : un niveau parmi N se lit par l'INTENSITÉ
/// d'une seule teinte, du contour du plus bas au plein du plus haut. Trois formes
/// d'une même loi : des pastilles à compte, la pilule d'un niveau, des anneaux.
///
/// Agnostique : des titres déjà traduits, un rang, une teinte. Elle ne décide ni du
/// niveau ni de ce qu'il ouvre (la loi d'accès reste à l'app) et ne montre jamais
/// l'intensité seule : le nom et le rang sont toujours dits.
public struct MeeshyCircleScale<Center: View, Marker: View>: View {
    private let levels: [MeeshyCircleScaleLevel]
    private let current: Int?
    private let other: Int?
    private let counts: [Int]?
    private let tint: Color?
    private let otherTint: Color?
    private let form: MeeshyCircleScaleForm
    private let size: MeeshyCircleScaleSize
    private let showsTitles: Bool
    private let label: String?
    private let onSelect: ((Int) -> Void)?
    private let haptic: MeeshyCircleScaleHaptic
    private let center: Center
    private let marker: Marker

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }
    @Environment(\.locale) private var locale

    public init(levels: [MeeshyCircleScaleLevel],
                current: Int?,
                other: Int? = nil,
                counts: [Int]? = nil,
                tint: Color? = nil,
                otherTint: Color? = nil,
                form: MeeshyCircleScaleForm = .pill,
                size: MeeshyCircleScaleSize = .regular,
                showsTitles: Bool = true,
                label: String? = nil,
                onSelect: ((Int) -> Void)? = nil,
                haptic: MeeshyCircleScaleHaptic = .onChange,
                @ViewBuilder center: () -> Center,
                @ViewBuilder marker: () -> Marker) {
        self.levels = levels
        self.current = current
        self.other = other
        self.counts = counts
        self.tint = tint
        self.otherTint = otherTint
        self.form = form
        self.size = size
        self.showsTitles = showsTitles
        self.label = label
        self.onSelect = onSelect
        self.haptic = haptic
        self.center = center()
        self.marker = marker()
    }

    public var body: some View {
        let recipe = MeeshyCircleScaleRecipe.resolve(count: levels.count, current: current, other: other, form: form,
                                                     size: size, isPressed: false, isEnabled: isEnabled)
        if recipe.isRendered {
            content(recipe: recipe)
                .opacity(recipe.opacity)
                .animation(MeeshyMotion.animation(.morph, reduce: reduceMotion), value: recipe.litLevel)
                .adaptiveOnChange(of: current) { _, _ in
                    if haptic == .onChange, !reduceMotion { HapticFeedback.medium() }
                }
        }
    }

    private var accent: Color { tint ?? .accentColor }

    @ViewBuilder
    private func content(recipe: MeeshyCircleScaleRecipe) -> some View {
        switch form {
        case .dots: dots(recipe: recipe)
        case .pill: pill(recipe: recipe)
        case .rings: rings(recipe: recipe)
        }
    }

    private func spokenLabel(recipe: MeeshyCircleScaleRecipe) -> String {
        if let label { return label }
        guard let lit = recipe.litLevel else { return "" }
        return levels[lit].title
    }

    private func spokenValue(recipe: MeeshyCircleScaleRecipe) -> String {
        guard let lit = recipe.litLevel else { return "" }
        return MeeshyCircleScaleWords.spokenValue(title: levels[lit].title, level: lit, of: levels.count, locale: locale)
    }

    // MARK: - Pastilles

    private func dots(recipe: MeeshyCircleScaleRecipe) -> some View {
        let validCounts = MeeshyCircleScaleRecipe.validCounts(counts, levelCount: levels.count)
        let isCompact = size == .compact
        let group = HStack(alignment: .top, spacing: isCompact ? recipe.stepGap : MeeshySpacing.sm) {
            ForEach(Array(levels.enumerated()), id: \.offset) { index, level in
                dotCell(index: index, level: level, count: validCounts?[index], recipe: recipe, isCompact: isCompact)
            }
        }
        return Group {
            if onSelect == nil {
                group.accessibilityElement(children: .ignore)
                    .accessibilityLabel(spokenLabel(recipe: recipe))
                    .accessibilityValue(spokenValue(recipe: recipe))
            } else {
                group.accessibilityElement(children: .contain)
            }
        }
    }

    @ViewBuilder
    private func dotCell(index: Int, level: MeeshyCircleScaleLevel, count: Int?,
                         recipe: MeeshyCircleScaleRecipe, isCompact: Bool) -> some View {
        let intensity = MeeshyCircleScaleRecipe.intensity(level: index, of: levels.count)
        let isOn = recipe.litLevel.map { index <= $0 } ?? true
        let cell = VStack(spacing: MeeshySpacing.xs) {
            if isCompact {
                Capsule()
                    .fill(accent.opacity(isOn ? intensity : 0))
                    .overlay(Capsule().stroke(accent, lineWidth: recipe.ringStroke))
                    .frame(width: recipe.stepHeight * 2, height: recipe.stepHeight)
            } else {
                disc(index: index, level: level, count: count, intensity: intensity, recipe: recipe)
            }
            if showsTitles, !isCompact {
                Text(verbatim: level.title)
                    .meeshyScaledFont(MeeshyFont.captionSize, weight: recipe.litLevel == index ? .bold : .regular)
                    .lineLimit(1)
                    .foregroundStyle(recipe.litLevel == index ? Color.primary : Color.secondary)
            }
        }
        if let onSelect {
            Button {
                onSelect(index)
            } label: { cell }
            .buttonStyle(.plain)
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            .accessibilityLabel(count.map { MeeshyCircleScaleWords.spokenCount(title: level.title, count: $0, locale: locale) } ?? level.title)
            .accessibilityAddTraits(recipe.litLevel == index ? .isSelected : [])
        } else {
            cell
        }
    }

    private func disc(index: Int, level: MeeshyCircleScaleLevel, count: Int?, intensity: Double,
                      recipe: MeeshyCircleScaleRecipe) -> some View {
        let isLit = recipe.litLevel == index
        let ink: Color = MeeshyCircleScaleRecipe.usesDarkInk(intensity: intensity)
            ? MeeshyColors.indigo950 : MeeshyColors.textPrimary(isDark: colorScheme == .dark)
        return ZStack {
            Circle().fill(accent.opacity(intensity))
            Circle().stroke(accent, lineWidth: recipe.ringStroke)
            if isLit { Circle().stroke(accent.opacity(MeeshyOpacity.medium), lineWidth: 2).padding(-3) }
            if let count {
                Text(verbatim: MeeshyCircleScaleRecipe.countText(count, locale: locale))
                    .meeshyScaledFont(MeeshyFont.subtitleSize, weight: .black)
                    .monospacedDigit()
                    .foregroundStyle(ink)
            } else {
                Image(systemName: level.systemImage)
                    .meeshyScaledFont(MeeshyIconSize.md, weight: .semibold)
                    .foregroundStyle(ink)
            }
        }
        .frame(width: recipe.dotDiameter, height: recipe.dotDiameter)
    }

    // MARK: - Pilule

    @ViewBuilder
    private func pill(recipe: MeeshyCircleScaleRecipe) -> some View {
        if let lit = recipe.litLevel {
            let level = levels[lit]
            let intensity = MeeshyCircleScaleRecipe.intensity(level: lit, of: levels.count)
            let ink: Color = MeeshyCircleScaleRecipe.usesDarkInk(intensity: intensity)
                ? MeeshyColors.indigo950 : MeeshyColors.textPrimary(isDark: colorScheme == .dark)
            let capsule = HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: level.systemImage).meeshyScaledFont(MeeshyIconSize.sm, weight: .semibold)
                Text(verbatim: level.title).meeshyScaledFont(MeeshyFont.subheadSize, weight: .semibold).lineLimit(1)
            }
            .foregroundStyle(ink)
            .padding(.horizontal, MeeshySpacing.md)
            .frame(height: recipe.pillHeight)
            .background(Capsule().fill(accent.opacity(intensity)))
            .overlay(Capsule().stroke(accent.opacity(MeeshyOpacity.strong), lineWidth: recipe.ringStroke))
            if let onSelect {
                Button { onSelect(lit) } label: { capsule }
                    .buttonStyle(.plain)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .accessibilityLabel(spokenLabel(recipe: recipe))
                    .accessibilityValue(spokenValue(recipe: recipe))
            } else {
                capsule
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(spokenLabel(recipe: recipe))
                    .accessibilityValue(spokenValue(recipe: recipe))
            }
        }
    }

    // MARK: - Anneaux

    private func ringDiameter(level: Int, recipe: MeeshyCircleScaleRecipe) -> CGFloat {
        let steps = levels.count - 1 - level
        return CGFloat(recipe.centerDiameter + 16 + 2 * recipe.ringGap * Double(steps))
    }

    private func rings(recipe: MeeshyCircleScaleRecipe) -> some View {
        let outer = ringDiameter(level: 0, recipe: recipe)
        return ZStack {
            ForEach(Array(levels.indices), id: \.self) { level in
                ring(level: level, recipe: recipe)
            }
            center.frame(width: CGFloat(recipe.centerDiameter), height: CGFloat(recipe.centerDiameter))
            if let lit = recipe.litLevel {
                marker
                    .frame(width: CGFloat(recipe.markerDiameter), height: CGFloat(recipe.markerDiameter))
                    .offset(y: -ringDiameter(level: lit, recipe: recipe) / 2)
            }
        }
        .frame(width: outer, height: outer)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel(recipe: recipe))
        .accessibilityValue(spokenValue(recipe: recipe))
    }

    @ViewBuilder
    private func ring(level: Int, recipe: MeeshyCircleScaleRecipe) -> some View {
        let diameter = ringDiameter(level: level, recipe: recipe)
        let intensity = MeeshyCircleScaleRecipe.intensity(level: level, of: levels.count)
        Circle().fill(accent.opacity(intensity))
            .frame(width: diameter, height: diameter)
        if recipe.litLevel == level {
            Circle().stroke(accent, lineWidth: recipe.litRingStroke)
                .frame(width: diameter, height: diameter)
        } else if recipe.otherLevel == level {
            Circle().stroke(otherTint ?? Color.secondary, style: StrokeStyle(lineWidth: recipe.ringStroke, dash: [4, 4]))
                .frame(width: diameter, height: diameter)
        } else {
            Circle().stroke(accent, lineWidth: recipe.ringStroke)
                .frame(width: diameter, height: diameter)
        }
    }
}

public extension MeeshyCircleScale where Center == EmptyView, Marker == EmptyView {
    init(levels: [MeeshyCircleScaleLevel],
         current: Int?,
         other: Int? = nil,
         counts: [Int]? = nil,
         tint: Color? = nil,
         otherTint: Color? = nil,
         form: MeeshyCircleScaleForm = .pill,
         size: MeeshyCircleScaleSize = .regular,
         showsTitles: Bool = true,
         label: String? = nil,
         onSelect: ((Int) -> Void)? = nil,
         haptic: MeeshyCircleScaleHaptic = .onChange) {
        self.init(levels: levels, current: current, other: other, counts: counts, tint: tint, otherTint: otherTint,
                  form: form, size: size, showsTitles: showsTitles, label: label, onSelect: onSelect,
                  haptic: haptic, center: { EmptyView() }, marker: { EmptyView() })
    }
}
