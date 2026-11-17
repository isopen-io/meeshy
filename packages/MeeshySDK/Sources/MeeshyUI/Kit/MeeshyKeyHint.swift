import SwiftUI

private struct MeeshyKeyPlatformKey: EnvironmentKey {
    static let defaultValue: MeeshyKeyPlatform = .apple
}

private struct MeeshyHasKeyboardKey: EnvironmentKey {
    static let defaultValue = false
}

public extension EnvironmentValues {
    /// La machine du lecteur : Apple (Commande) ou autre (Ctrl). Lue UNE fois à la
    /// racine ; cent touches à l'écran ne font aucune mesure.
    var meeshyKeyPlatform: MeeshyKeyPlatform {
        get { self[MeeshyKeyPlatformKey.self] }
        set { self[MeeshyKeyPlatformKey.self] = newValue }
    }

    /// Un clavier est branché. L'hôte le pose ; sans lui, aucune touche n'est rendue.
    var meeshyHasKeyboard: Bool {
        get { self[MeeshyHasKeyboardKey.self] }
        set { self[MeeshyHasKeyboardKey.self] = newValue }
    }
}

/// **La touche de raccourci (K55)** : un raccourci clavier se montre partout par
/// la même touche, seule, dans un bouton ou en légende. Elle ne se touche pas :
/// ni cible, ni survol, ni focus ; elle est muette pour le lecteur d'écran (l'hôte
/// dit « raccourci : Commande M »).
///
/// Agnostique : des touches abstraites, aucun écouteur de clavier — l'hôte
/// reconnaît le raccourci et passe `isPressed` vrai 120 ms. Sans clavier, ou hôte
/// désactivé : aucun nœud et aucune place réservée.
public struct MeeshyKeyHint: View {
    private let keys: [MeeshyKey]
    private let context: MeeshyKeyHintContext
    private let size: MeeshyKeyHintSize
    private let surface: MeeshyKeyHintSurface
    private let isPressed: Bool
    private let platform: MeeshyKeyPlatform?
    private let hasKeyboard: Bool?

    @Environment(\.meeshyKeyPlatform) private var hostPlatform
    @Environment(\.meeshyHasKeyboard) private var hostHasKeyboard
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    public init(keys: [MeeshyKey],
                context: MeeshyKeyHintContext = .free,
                size: MeeshyKeyHintSize = .regular,
                surface: MeeshyKeyHintSurface = .auto,
                isPressed: Bool = false,
                platform: MeeshyKeyPlatform? = nil,
                hasKeyboard: Bool? = nil) {
        self.keys = keys
        self.context = context
        self.size = size
        self.surface = surface
        self.isPressed = isPressed
        self.platform = platform
        self.hasKeyboard = hasKeyboard
    }

    @ViewBuilder
    public var body: some View {
        if MeeshyKeyHintRule.isShown(hasKeyboard: hasKeyboard ?? hostHasKeyboard, isEnabled: isEnabled, keys: keys) {
            let recipe = MeeshyKeyHintRecipe.resolve(size: size, isPressed: isPressed, reduceMotion: reduceMotion)
            let glyphs = MeeshyKeyHintRule.glyphs(keys: keys, platform: platform ?? hostPlatform,
                                                  isRightToLeft: layoutDirection == .rightToLeft)
            HStack(spacing: CGFloat(recipe.combinationGap)) {
                ForEach(Array(glyphs.enumerated()), id: \.offset) { _, glyph in
                    cap(glyph, recipe: recipe)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    private func cap(_ glyph: String, recipe: MeeshyKeyHintRecipe) -> some View {
        let isDark = colorScheme == .dark
        let shape = RoundedRectangle(cornerRadius: CGFloat(recipe.cornerRadius), style: .continuous)
        return Text(verbatim: glyph)
            .meeshyScaledFont(CGFloat(recipe.characterSize), weight: .bold, design: .monospaced)
            .foregroundStyle(MeeshyKeyHintColors.ink(surface: surface, isDark: isDark))
            .lineLimit(1)
            .padding(.horizontal, CGFloat(recipe.horizontalPadding))
            .padding(.bottom, CGFloat(recipe.lipWidth))
            .frame(minWidth: CGFloat(recipe.minimumWidth), minHeight: CGFloat(recipe.side))
            .background(shape.fill(MeeshyKeyHintColors.face(surface: surface, isPressed: recipe.isPressed, isDark: isDark)))
            .background(shape.fill(MeeshyKeyHintColors.lip(surface: surface, isDark: isDark)))
            .offset(y: CGFloat(recipe.pressOffset))
    }
}

/// La légende : des paires « touche, libellé », un filet entre deux groupes. Sans
/// conteneur, elle coule dans son hôte et passe à la ligne par paire ; une barre
/// de verre (K01) la pose sur un fond. Zéro entrée : ni conteneur ni verre.
public enum MeeshyKeyLegendContainer: String, Sendable, Equatable, CaseIterable {
    case none
    case glassBar
}

public struct MeeshyKeyLegend<Leading: View>: View {
    private let items: [MeeshyKeyLegendItem]
    private let container: MeeshyKeyLegendContainer
    private let leading: Leading

    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.colorScheme) private var colorScheme

    public init(items: [MeeshyKeyLegendItem],
                container: MeeshyKeyLegendContainer = .none,
                @ViewBuilder leading: () -> Leading) {
        self.items = items
        self.container = container
        self.leading = leading()
    }

    @ViewBuilder
    public var body: some View {
        if MeeshyKeyLegendLaw.rendersContainer(itemCount: items.count) {
            let flow = MeeshyKeyFlowLayout(spacing: CGFloat(MeeshyKeyLegendLaw.groupSpacing),
                                           lineSpacing: MeeshySpacing.sm,
                                           isRightToLeft: layoutDirection == .rightToLeft)
            switch container {
            case .none:
                flow { flowChildren }
            case .glassBar:
                flow { flowChildren }
                    .padding(.horizontal, MeeshySpacing.md)
                    .frame(minHeight: CGFloat(MeeshyKeyLegendLaw.barHeight))
                    .meeshyGlass(in: RoundedRectangle(cornerRadius: CGFloat(MeeshyKeyLegendLaw.barCornerRadius),
                                                      style: .continuous))
            }
        }
    }

    @ViewBuilder
    private var flowChildren: some View {
        leading
        ForEach(MeeshyKeyLegendLaw.elements(items)) { element in
            if element.isRule {
                Rectangle()
                    .fill(MeeshyKeyHintColors.rule(isDark: colorScheme == .dark))
                    .frame(width: CGFloat(MeeshyKeyLegendLaw.ruleWidth), height: CGFloat(MeeshyKeyLegendLaw.ruleHeight))
                    .accessibilityHidden(true)
            } else if let item = element.item {
                pair(item)
            }
        }
    }

    private func pair(_ item: MeeshyKeyLegendItem) -> some View {
        HStack(spacing: CGFloat(MeeshyKeyLegendLaw.pairSpacing)) {
            HStack(spacing: MeeshySpacing.xs) {
                ForEach(Array(item.combos.enumerated()), id: \.offset) { _, combo in
                    MeeshyKeyHint(keys: combo, context: .legend, size: .compact)
                }
            }
            Text(verbatim: item.title)
                .meeshyScaledFont(MeeshyFont.subheadSize, weight: .semibold)
                .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                .lineLimit(1)
        }
        .fixedSize(horizontal: true, vertical: false)
    }
}

extension MeeshyKeyLegend where Leading == EmptyView {
    public init(items: [MeeshyKeyLegendItem], container: MeeshyKeyLegendContainer = .none) {
        self.init(items: items, container: container, leading: { EmptyView() })
    }
}

/// Le coulage de la légende : une paire ne se coupe jamais, on passe à la ligne
/// entre deux paires. L'ordre se reflète en écriture de droite à gauche.
private struct MeeshyKeyFlowLayout: Layout {
    let spacing: CGFloat
    let lineSpacing: CGFloat
    let isRightToLeft: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = layoutRows(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: rows.map(\.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in layoutRows(width: bounds.width, subviews: subviews) {
            var x: CGFloat = 0
            for entry in row.entries {
                let origin = isRightToLeft ? bounds.maxX - x - entry.size.width : bounds.minX + x
                subviews[entry.index].place(at: CGPoint(x: origin, y: y + (row.height - entry.size.height) / 2),
                                            anchor: .topLeading, proposal: .unspecified)
                x += entry.size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Entry {
        let index: Int
        let size: CGSize
    }

    private struct Row {
        var entries: [Entry] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func layoutRows(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = rows[rows.count - 1].entries.isEmpty ? size.width : rows[rows.count - 1].width + spacing + size.width
            if needed > width, !rows[rows.count - 1].entries.isEmpty { rows.append(Row()) }
            let last = rows.count - 1
            rows[last].width = rows[last].entries.isEmpty ? size.width : rows[last].width + spacing + size.width
            rows[last].height = max(rows[last].height, size.height)
            rows[last].entries.append(Entry(index: index, size: size))
        }
        return rows
    }
}

/// Les couleurs de la touche : la seule traduction surface vers couleur.
enum MeeshyKeyHintColors {
    static func ink(surface: MeeshyKeyHintSurface, isDark: Bool) -> Color {
        switch surface {
        case .onAccent, .onGlass: return MeeshyColors.onMedia
        case .auto, .onFill: return MeeshyColors.textSecondary(isDark: isDark)
        }
    }

    static func face(surface: MeeshyKeyHintSurface, isPressed: Bool, isDark: Bool) -> Color {
        let base: Color
        switch surface {
        case .onAccent, .onGlass: base = MeeshyColors.onMedia.opacity(MeeshyOpacity.light)
        case .auto, .onFill: base = MeeshyColors.surfaceFill(isDark: isDark)
        }
        return isPressed ? base.opacity(MeeshyOpacity.heavy) : base
    }

    static func lip(surface: MeeshyKeyHintSurface, isDark: Bool) -> Color {
        switch surface {
        case .onAccent, .onGlass: return MeeshyColors.onMedia.opacity(MeeshyOpacity.medium)
        case .auto, .onFill: return MeeshyColors.textMuted(isDark: isDark).opacity(MeeshyOpacity.medium)
        }
    }

    static func rule(isDark: Bool) -> Color {
        MeeshyColors.textMuted(isDark: isDark).opacity(MeeshyOpacity.medium)
    }
}
