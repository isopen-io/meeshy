import SwiftUI

/// **Le groupe d'avatars (K48)** : une pile qui chevauche, un duo fondu, une rangée
/// nommée qui défile, ou une grille de deux rangées au plus. Il pose les cellules de
/// l'hôte (`cell(index, size)`) sans les redessiner : l'avatar, sa présence et son
/// anneau restent à l'hôte.
///
/// Agnostique : un nombre, une disposition, des rangs. Aucun utilisateur, membre, ami
/// ou cercle. La sélection est portée par des rangs ; l'hôte la tient.
public struct MeeshyAvatarGroup<Cell: View, Trailing: View>: View {
    private let count: Int
    private let layout: MeeshyAvatarGroupLayout
    private let size: MeeshyAvatarGroupSize
    private let maxVisible: Int
    private let selection: MeeshyAvatarGroupSelection
    private let onSelectionChange: ((MeeshyAvatarGroupSelection) -> Void)?
    private let summary: String?
    private let showsChevron: Bool
    private let label: String?
    private let caption: ((Int) -> String?)?
    private let isEnabled: ((Int) -> Bool)?
    private let tint: Color?
    private let surface: Color?
    private let onPress: (() -> Void)?
    private let breathes: Bool
    private let cell: (Int, CGFloat) -> Cell
    private let trailing: Trailing

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var isBreathing = false

    public init(count: Int,
                layout: MeeshyAvatarGroupLayout = .stack,
                size: MeeshyAvatarGroupSize = .s40,
                max: Int = 4,
                selection: MeeshyAvatarGroupSelection = .none,
                onSelectionChange: ((MeeshyAvatarGroupSelection) -> Void)? = nil,
                summary: String? = nil,
                showsChevron: Bool = false,
                label: String? = nil,
                caption: ((Int) -> String?)? = nil,
                isEnabled: ((Int) -> Bool)? = nil,
                tint: Color? = nil,
                surface: Color? = nil,
                onPress: (() -> Void)? = nil,
                breathes: Bool = true,
                @ViewBuilder cell: @escaping (Int, CGFloat) -> Cell,
                @ViewBuilder trailing: () -> Trailing) {
        self.count = count
        self.layout = layout
        self.size = size
        self.maxVisible = max
        self.selection = selection
        self.onSelectionChange = onSelectionChange
        self.summary = summary
        self.showsChevron = showsChevron
        self.label = label
        self.caption = caption
        self.isEnabled = isEnabled
        self.tint = tint
        self.surface = surface
        self.onPress = onPress
        self.breathes = breathes
        self.cell = cell
        self.trailing = trailing()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var recipe: MeeshyAvatarGroupRecipe {
        MeeshyAvatarGroupRecipe.resolve(layout: layout, size: size, count: count, max: maxVisible)
    }

    private var diameter: CGFloat { CGFloat(size.rawValue) }
    private var ground: Color { surface ?? (colorScheme == .dark ? Color.black : Color.white) }

    public var body: some View {
        let recipe = self.recipe
        if !recipe.rendersNothing {
            switch recipe.effectiveLayout {
            case .stack: stackOrDuo(recipe: recipe)
            case .duo: stackOrDuo(recipe: recipe)
            case .rail: rail(recipe: recipe)
            case .grid: grid(recipe: recipe)
            }
        }
    }

    // MARK: - Pile et duo

    private func stackOrDuo(recipe: MeeshyAvatarGroupRecipe) -> some View {
        let content = HStack(spacing: MeeshySpacing.md) {
            overlapped(recipe: recipe)
            if let summary {
                Text(verbatim: summary)
                    .meeshyScaledFont(MeeshyFont.subheadSize, weight: .semibold)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if showsChevron { Image(systemName: "chevron.forward").foregroundStyle(.secondary) }
        }
        return Group {
            if let onPress {
                Button(action: onPress) { content }
                    .buttonStyle(.plain)
                    .frame(minHeight: CGFloat(MeeshyControlSize.tapTarget))
            } else {
                content
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MeeshyAvatarGroupRecipe.spokenLabel(label: label, summary: summary) ?? "")
        .accessibilityAddTraits(onPress == nil ? .isImage : .isButton)
    }

    private func overlapped(recipe: MeeshyAvatarGroupRecipe) -> some View {
        let overlap = CGFloat(MeeshyAvatarGroupRecipe.overlap(size))
        let ring = CGFloat(MeeshyAvatarGroupRecipe.ringWidth(size))
        let isDuo = recipe.effectiveLayout == .duo
        return HStack(spacing: -overlap) {
            ForEach(0..<recipe.visibleCount, id: \.self) { index in
                cell(index, diameter)
                    .frame(width: diameter, height: diameter)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(ground, lineWidth: ring))
                    .scaleEffect(isDuo && index == 1 && isBreathing && !reduceMotion ? 1.04 : 1)
                    .zIndex(Double(recipe.visibleCount - index))
            }
            if let text = recipe.overflowText { overflowCell(text, ring: ring) }
        }
        .animation(MeeshyAvatarGroupRecipe.breathAnimation(reduce: reduceMotion || !breathes), value: isBreathing)
        .onAppear { if isDuo && breathes { isBreathing = true } }
    }

    private func overflowCell(_ text: String, ring: CGFloat) -> some View {
        Circle()
            .fill(MeeshyColors.textSecondary(isDark: colorScheme == .dark).opacity(MeeshyOpacity.light))
            .frame(width: diameter, height: diameter)
            .overlay(Text(verbatim: text)
                .meeshyScaledFont(MeeshyFont.smallSize, weight: .black, design: .rounded)
                .foregroundStyle(.secondary))
            .overlay(Circle().strokeBorder(ground, lineWidth: ring))
    }

    // MARK: - Rangée et grille

    private func rail(recipe: MeeshyAvatarGroupRecipe) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: CGFloat(MeeshyAvatarGroupRecipe.railSpacing)) {
                ForEach(0..<recipe.visibleCount, id: \.self) { index in
                    selectable(index: index) { captionedCell(index: index) }
                        .frame(width: CGFloat(MeeshyAvatarGroupRecipe.railColumnWidth))
                }
                trailing
            }
        }
        .accessibilityLabel(MeeshyAvatarGroupRecipe.spokenLabel(label: label, summary: summary) ?? "")
    }

    private func grid(recipe: MeeshyAvatarGroupRecipe) -> some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.sm), count: recipe.columns)
        return LazyVGrid(columns: columns, spacing: MeeshySpacing.sm) {
            ForEach(0..<recipe.visibleCount, id: \.self) { index in
                selectable(index: index) { captionedCell(index: index) }
            }
            if let text = recipe.overflowText { overflowCell(text, ring: 0) }
        }
        .accessibilityLabel(MeeshyAvatarGroupRecipe.spokenLabel(label: label, summary: summary) ?? "")
    }

    private func captionedCell(index: Int) -> some View {
        VStack(spacing: MeeshySpacing.sm) {
            cell(index, diameter).frame(width: diameter, height: diameter).clipShape(Circle())
            if let text = caption?(index) {
                Text(verbatim: text)
                    .meeshyScaledFont(MeeshyFont.smallSize, weight: .semibold)
                    .foregroundStyle(isSelected(index) ? MeeshyColors.textPrimary(isDark: colorScheme == .dark) : .secondary)
                    .lineLimit(1)
            }
        }
    }

    private func isSelected(_ index: Int) -> Bool {
        switch selection {
        case .none: return false
        case .single(let chosen): return chosen == index
        case .multiple(let chosen): return chosen.contains(index)
        }
    }

    @ViewBuilder
    private func selectable<Body: View>(index: Int, @ViewBuilder _ body: () -> Body) -> some View {
        let enabled = isEnabled?(index) ?? true
        let accent = tint ?? MeeshyColors.brandPrimary
        let marked = body()
            .overlay(
                Circle().strokeBorder(accent, lineWidth: 2.5).padding(-4)
                    .frame(width: diameter, height: diameter)
                    .opacity(isSelected(index) ? 1 : 0),
                alignment: .top)
            .opacity(enabled ? 1 : MeeshyAvatarGroupRecipe.disabledOpacity)
        if case .none = selection {
            marked.accessibilityLabel(caption?(index) ?? "")
        } else {
            Button {
                guard enabled else { return }
                HapticFeedback.light()
                onSelectionChange?(MeeshyAvatarGroupSelectionLaw.apply(selection, tapped: index, isEnabled: isEnabled))
            } label: { marked }
                .buttonStyle(.plain)
                .disabled(!enabled)
                .accessibilityLabel(caption?(index) ?? "")
                .accessibilityAddTraits(isSelected(index) ? [.isButton, .isSelected] : .isButton)
        }
    }
}

extension MeeshyAvatarGroup where Trailing == EmptyView {
    public init(count: Int,
                layout: MeeshyAvatarGroupLayout = .stack,
                size: MeeshyAvatarGroupSize = .s40,
                max: Int = 4,
                selection: MeeshyAvatarGroupSelection = .none,
                onSelectionChange: ((MeeshyAvatarGroupSelection) -> Void)? = nil,
                summary: String? = nil,
                showsChevron: Bool = false,
                label: String? = nil,
                caption: ((Int) -> String?)? = nil,
                isEnabled: ((Int) -> Bool)? = nil,
                tint: Color? = nil,
                surface: Color? = nil,
                onPress: (() -> Void)? = nil,
                breathes: Bool = true,
                @ViewBuilder cell: @escaping (Int, CGFloat) -> Cell) {
        self.init(count: count, layout: layout, size: size, max: max, selection: selection,
                  onSelectionChange: onSelectionChange, summary: summary, showsChevron: showsChevron, label: label,
                  caption: caption, isEnabled: isEnabled, tint: tint, surface: surface, onPress: onPress,
                  breathes: breathes, cell: cell, trailing: { EmptyView() })
    }
}

/// **Le squelette du groupe (K48)** : des `MeeshySkeleton` ronds à la place des cellules,
/// sans reflet propre (l'horloge est celle de K38).
public struct MeeshyAvatarGroupSkeleton: View {
    private let layout: MeeshyAvatarGroupLayout
    private let size: MeeshyAvatarGroupSize
    private let count: Int

    public init(layout: MeeshyAvatarGroupLayout = .stack, size: MeeshyAvatarGroupSize = .s40, count: Int = 4) {
        self.layout = layout
        self.size = size
        self.count = count
    }

    public var body: some View {
        let recipe = MeeshyAvatarGroupRecipe.resolve(layout: layout, size: size, count: count, max: count)
        let overlap = layout == .stack ? CGFloat(MeeshyAvatarGroupRecipe.overlap(size)) : -MeeshySpacing.sm
        HStack(spacing: -overlap) {
            ForEach(0..<max(recipe.visibleCount, 1), id: \.self) { _ in
                MeeshySkeleton(shape: .circle(diameter: Double(size.rawValue)))
            }
        }
        .accessibilityHidden(true)
    }
}
