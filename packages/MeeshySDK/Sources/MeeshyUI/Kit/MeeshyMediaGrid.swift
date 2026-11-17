import SwiftUI

/// **La grille de médias (K49)** : des tuiles dans 2 ou 3 colonnes, en grille régulière,
/// en maçonnerie ou en rangée. La grille montre, elle ne range rien ; toucher une tuile
/// rend son identifiant à l'hôte, une fois, au doigt levé. L'image est celle de l'hôte
/// (`content`), rognée au rayon, jamais étirée.
///
/// Agnostique : des identifiants, des textes, des glyphes, un rapport de forme, une
/// teinte. Un fantôme ou un squelette tient la place sans jamais s'ouvrir.
public struct MeeshyMediaGrid<Content: View>: View {
    private let label: String
    private let items: [MeeshyMediaGridItem]
    private let layout: MeeshyMediaGridLayout
    private let columns: Int
    private let shape: MeeshyMediaTileShape
    private let spacing: MeeshyMediaGridSpacing
    private let tint: Color?
    private let onOpen: (String) -> Void
    private let onReachEnd: (() -> Void)?
    private let content: (MeeshyMediaGridItem, CGSize) -> Content

    @State private var width: Double = 0

    public init(label: String,
                items: [MeeshyMediaGridItem],
                layout: MeeshyMediaGridLayout = .regular,
                columns: Int = 3,
                shape: MeeshyMediaTileShape = .tall,
                spacing: MeeshyMediaGridSpacing = .regular,
                tint: Color? = nil,
                onOpen: @escaping (String) -> Void,
                onReachEnd: (() -> Void)? = nil,
                @ViewBuilder content: @escaping (MeeshyMediaGridItem, CGSize) -> Content) {
        assert(!label.isEmpty, "MeeshyMediaGrid : label obligatoire")
        self.label = label
        self.items = items
        self.layout = layout
        self.columns = columns
        self.shape = shape
        self.spacing = spacing
        self.tint = tint
        self.onOpen = onOpen
        self.onReachEnd = onReachEnd
        self.content = content
    }

    public var body: some View {
        let gap = MeeshyMediaGridRecipe.spacingValue(spacing, width: width)
        let count = MeeshyMediaGridRecipe.columns(columns)
        let tileWidth = MeeshyMediaGridPlacement.columnWidth(columns: count, spacing: gap, width: width)
        let shown = MeeshyMediaGridRecipe.visibleItems(items, layout: layout, columns: count)
        Group {
            switch layout {
            case .masonry: masonry(shown, count: count, gap: gap, tileWidth: tileWidth)
            case .regular, .row: regular(shown, count: count, gap: gap, tileWidth: tileWidth)
            }
        }
        .frame(maxWidth: .infinity)
        .background(GeometryReader { proxy in
            Color.clear.onAppear { width = Double(proxy.size.width) }
                .adaptiveOnChange(of: Double(proxy.size.width)) { _, new in width = new }
        })
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func regular(_ shown: [MeeshyMediaGridItem], count: Int, gap: Double, tileWidth: Double) -> some View {
        let grid = Array(repeating: GridItem(.flexible(), spacing: CGFloat(gap)), count: count)
        return LazyVGrid(columns: grid, spacing: CGFloat(gap)) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, item in
                tile(item, ratio: MeeshyMediaGridRecipe.aspectRatio(shape: shape, aspect: item.aspect), width: tileWidth)
                    .onAppear { reachEndIfNeeded(index: index, count: shown.count, columns: count) }
            }
        }
    }

    private func masonry(_ shown: [MeeshyMediaGridItem], count: Int, gap: Double, tileWidth: Double) -> some View {
        let placed = MeeshyMediaGridPlacement.columns(aspects: shown.map { MeeshyMediaGridRecipe.clampedAspect($0.aspect) },
                                                      count: count, spacing: gap, width: width)
        return HStack(alignment: .top, spacing: CGFloat(gap)) {
            ForEach(Array(placed.enumerated()), id: \.offset) { _, indexes in
                LazyVStack(spacing: CGFloat(gap)) {
                    ForEach(indexes, id: \.self) { index in
                        tile(shown[index], ratio: MeeshyMediaGridRecipe.clampedAspect(shown[index].aspect), width: tileWidth)
                            .onAppear { reachEndIfNeeded(index: index, count: shown.count, columns: count) }
                    }
                }
            }
        }
    }

    private func tile(_ item: MeeshyMediaGridItem, ratio: Double, width: Double) -> some View {
        let height = width > 0 ? width / ratio : nil
        return MeeshyMediaTile(item: item, shape: shape, tint: tint, onOpen: { onOpen(item.id) },
                               content: { size in content(item, size) })
            .aspectRatio(CGFloat(ratio), contentMode: .fit)
            .frame(height: height.map { CGFloat($0) })
    }

    private func reachEndIfNeeded(index: Int, count: Int, columns: Int) {
        guard let onReachEnd, MeeshyMediaGridRecipe.shouldReachEnd(index: index, count: count, columns: columns) else { return }
        onReachEnd()
    }
}

/// **Une tuile seule (K49)**, pour un hôte qui pose sa propre grille.
public struct MeeshyMediaTile<Content: View>: View {
    private let item: MeeshyMediaGridItem
    private let shape: MeeshyMediaTileShape
    private let tint: Color?
    private let onOpen: (() -> Void)?
    private let content: (CGSize) -> Content

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(item: MeeshyMediaGridItem,
                shape: MeeshyMediaTileShape = .tall,
                tint: Color? = nil,
                onOpen: (() -> Void)? = nil,
                @ViewBuilder content: @escaping (CGSize) -> Content) {
        self.item = item
        self.shape = shape
        self.tint = tint
        self.onOpen = onOpen
        self.content = content
    }

    private func recipe(isPressed: Bool) -> MeeshyMediaGridRecipe {
        MeeshyMediaGridRecipe.resolve(
            layout: .regular, shape: shape, columns: 3, spacing: .regular, kind: item.kind, isPressed: isPressed,
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion))
    }

    public var body: some View {
        let rest = recipe(isPressed: false)
        if rest.isOpenable, let onOpen {
            Button(action: { HapticFeedback.light(); onOpen() }) { EmptyView() }
                .buttonStyle(MeeshyMediaTileStyle { pressed in face(recipe: recipe(isPressed: pressed)) })
                .accessibilityLabel(item.label)
                .accessibilityAddTraits(.isButton)
        } else {
            face(recipe: rest)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(item.label)
        }
    }

    @ViewBuilder
    private func face(recipe: MeeshyMediaGridRecipe) -> some View {
        let radius = CGFloat(recipe.cornerRadius)
        let frame = RoundedRectangle(cornerRadius: radius, style: .continuous)
        GeometryReader { proxy in
            ZStack {
                switch item.kind {
                case .media: content(proxy.size).frame(width: proxy.size.width, height: proxy.size.height).clipped()
                case .text: textFace(size: proxy.size)
                case .ghost: ghostFace
                case .skeleton: MeeshySkeleton(shape: .card(aspect: Double(proxy.size.width / max(proxy.size.height, 1)), radius: recipe.cornerRadius))
                }
                if item.kind == .media { overlays }
            }
        }
        .clipShape(frame)
        .overlay(frame.strokeBorder(Color.secondary.opacity(MeeshyOpacity.light), lineWidth: CGFloat(recipe.borderWidth)))
        .scaleEffect(CGFloat(recipe.pressScale))
        .frame(minHeight: item.kind == .text ? CGFloat(MeeshyMediaGridRecipe.textMinimumHeight) : nil)
    }

    private func textFace(size: CGSize) -> some View {
        let accent = item.tint ?? tint ?? MeeshyColors.brandPrimary
        return ZStack(alignment: .topLeading) {
            accent
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                if let overline = item.overline {
                    HStack(spacing: MeeshySpacing.xs) {
                        if let badge = item.badge { Image(systemName: badge.systemImage) }
                        Text(verbatim: overline.uppercased()).meeshyScaledFont(MeeshyFont.footnoteSize, weight: .bold)
                    }
                }
                Text(verbatim: item.text ?? "")
                    .meeshyScaledFont(21, weight: .bold, design: .rounded)
                    .lineLimit(5)
            }
            .foregroundStyle(Color.black.opacity(0.85))
            .padding(MeeshySpacing.lg)
        }
    }

    private var ghostFace: some View {
        ZStack {
            Color.secondary.opacity(MeeshyOpacity.faint)
            VStack(spacing: MeeshySpacing.xs) {
                if let badge = item.badge { Image(systemName: badge.systemImage).font(MeeshyFont.relative(28)) }
                Text(verbatim: item.label).meeshyScaledFont(MeeshyFont.footnoteSize)
            }
            .foregroundStyle(.secondary)
        }
        .overlay(RoundedRectangle(cornerRadius: CGFloat(MeeshyMediaGridRecipe.cornerRadius), style: .continuous)
            .strokeBorder(Color.secondary.opacity(MeeshyOpacity.medium), style: StrokeStyle(lineWidth: MeeshyBorder.emphasis, dash: [4, 3])))
    }

    @ViewBuilder
    private var overlays: some View {
        VStack {
            HStack {
                Spacer()
                if let badge = item.badge { badgeView(badge) }
            }
            Spacer()
            if let caption = item.caption {
                Text(verbatim: caption)
                    .meeshyScaledFont(MeeshyFont.smallSize)
                    .lineLimit(MeeshyMediaGridRecipe.captionMaxLines)
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 10).padding(.vertical, 9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Color.black.opacity(MeeshyOpacity.strong)))
            }
        }
        .padding(MeeshySpacing.sm)
        .allowsHitTesting(false)
    }

    private func badgeView(_ badge: MeeshyMediaTileBadge) -> some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: badge.systemImage)
            if let value = badge.value { Text(verbatim: value).monospacedDigit() }
        }
        .meeshyScaledFont(MeeshyFont.smallSize, weight: .semibold)
        .foregroundStyle(Color.white)
        .padding(.horizontal, MeeshySpacing.sm)
        .frame(height: 26)
        .background(Capsule().fill(Color.black.opacity(MeeshyOpacity.strong)))
    }
}

private struct MeeshyMediaTileStyle<Content: View>: ButtonStyle {
    let build: (Bool) -> Content

    init(@ViewBuilder build: @escaping (Bool) -> Content) {
        self.build = build
    }

    func makeBody(configuration: Configuration) -> some View {
        build(configuration.isPressed)
    }
}
