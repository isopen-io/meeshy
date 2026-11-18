import SwiftUI

/// **L'action libellée (K32)** : un disque de verre (celui de K02), son mot dessous,
/// éventuellement une valeur en pilule et une pastille — UNE cible, UN nom, UNE
/// réponse au toucher. Le libellé est toujours visible : aucune action n'est un
/// glyphe seul.
///
/// Agnostique : des textes déjà écrits et un nom de glyphe. Elle ne sait pas ce que
/// le geste fait, ne dessine aucun fond (le disque vient de `MeeshyGlassButtonFace`)
/// et ne confirme rien. En attente ou désactivée, ni action ni tic. `isEnabled`
/// suit `.disabled(_:)`. La taille vient de la grille qui la range. Un raccourci
/// (`shortcut`) est donné une fois : la même combinaison devient la frappe reconnue
/// et la touche K55 sous le libellé, montrée seulement si la commande répond.
public struct MeeshyLabeledAction: View {
    private let title: String
    private let systemImage: String
    private let value: String?
    private let valueKind: MeeshyLabeledActionValueKind
    private let badge: String?
    private let kind: MeeshyGlassButtonKind
    private let isPending: Bool
    private let isFeatured: Bool
    private let tint: Color?
    private let hint: String?
    private let label: String?
    private let pendingLabel: String?
    private let shortcut: MeeshyKeyCombo?
    private let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyActionGridSize) private var gridSize
    @Environment(\.meeshyHasKeyboard) private var hasKeyboard
    @Environment(\.meeshyKeyPlatform) private var keyPlatform
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var isHovered = false

    public init(title: String,
                systemImage: String,
                value: String? = nil,
                valueKind: MeeshyLabeledActionValueKind = .accent,
                badge: String? = nil,
                kind: MeeshyGlassButtonKind = .normal,
                isPending: Bool = false,
                isFeatured: Bool = false,
                tint: Color? = nil,
                hint: String? = nil,
                label: String? = nil,
                pendingLabel: String? = nil,
                shortcut: MeeshyKeyCombo? = nil,
                action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.value = value
        self.valueKind = valueKind
        self.badge = badge
        self.kind = kind
        self.isPending = isPending
        self.isFeatured = isFeatured
        self.tint = tint
        self.hint = hint
        self.label = label
        self.pendingLabel = pendingLabel
        self.shortcut = shortcut
        self.action = action
    }

    private var recipe: MeeshyLabeledActionRecipe {
        MeeshyLabeledActionRecipe.resolve(kind: kind, size: gridSize, isPending: isPending, isFeatured: isFeatured,
                                          isEnabled: isEnabled, hasValue: value != nil)
    }

    private var spokenValue: String {
        [isPending ? pendingLabel : nil, value, badge].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    /// Le raccourci se dit à la voix là où sa touche se voit : « raccourci : Commande M ».
    private func spokenHint(shownKeys: MeeshyKeyCombo?) -> String {
        let spokenKeys = shownKeys.flatMap { keys in
            hasKeyboard ? MeeshyKeyHintRule.spokenWithPrefix(keys: keys, platform: keyPlatform, prefix: nil) : nil
        }
        return [hint, spokenKeys].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    public var body: some View {
        let recipe = self.recipe
        let shownKeys = MeeshyKeyShortcutLaw.displayed(shortcut, isActionable: recipe.isActionable)
        return Button(action: { if recipe.isActionable { action() } }) { EmptyView() }
            .buttonStyle(MeeshyLabeledActionStyle { isPressed in
                column(recipe: recipe, isPressed: isPressed && recipe.isActionable, shownKeys: shownKeys)
            })
            .meeshyPointerMagnet(in: RoundedRectangle(cornerRadius: MeeshyRadius.md), isActive: recipe.isActionable)
            .onHover { hovering in isHovered = hovering }
            .meeshyKeyShortcut(shortcut)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label ?? title)
            .accessibilityValue(spokenValue)
            .accessibilityHint(spokenHint(shownKeys: shownKeys))
            .accessibilityAddTraits(.isButton)
    }

    private func column(recipe: MeeshyLabeledActionRecipe, isPressed: Bool, shownKeys: MeeshyKeyCombo?) -> some View {
        let isDark = colorScheme == .dark
        return VStack(spacing: CGFloat(recipe.labelGap)) {
            disc(recipe: recipe, isPressed: isPressed)
                .meeshyPointerLift(in: Circle(), tint: tint, isHovered: isHovered && recipe.isActionable)
            Text(title)
                .font(MeeshyFont.relative(CGFloat(recipe.labelFontSize), weight: .semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            if let shownKeys {
                MeeshyKeyHint(keys: shownKeys, context: .inset, size: .compact)
            }
            if let value {
                valuePill(value, recipe: recipe, isDark: isDark)
                    .padding(.top, CGFloat(recipe.valueGap - recipe.labelGap))
            }
        }
        .frame(minWidth: CGFloat(recipe.minTargetWidth), minHeight: CGFloat(recipe.minTargetHeight), alignment: .top)
        .contentShape(Rectangle())
        .opacity(recipe.opacity)
    }

    @ViewBuilder
    private func disc(recipe: MeeshyLabeledActionRecipe, isPressed: Bool) -> some View {
        let face = MeeshyGlassButtonFace(kind: recipe.kind, size: .s48, glyphTint: tint, isPressed: isPressed) {
            Image(systemName: systemImage).opacity(recipe.glyphOpacity)
        }
        Group {
            if let badge, !badge.isEmpty {
                face.glassBadge { MeeshyBadge(.label(badge), kind: .accent, size: .s22) }
            } else {
                face
            }
        }
        .scaleEffect(CGFloat(recipe.faceScale))
        .frame(width: CGFloat(recipe.diameter), height: CGFloat(recipe.diameter))
        .overlay {
            if recipe.showsRing {
                MeeshyLabeledActionRing(diameter: recipe.diameter, isStill: MeeshyMotion.shouldReduce(
                    system: systemReduceMotion, userForced: forcedReduceMotion))
            }
        }
    }

    private func valuePill(_ text: String, recipe: MeeshyLabeledActionRecipe, isDark: Bool) -> some View {
        Text(text)
            .font(MeeshyFont.relative(10, weight: .heavy))
            .foregroundStyle(valueKind == .accent ? Color.white : MeeshyColors.textSecondary(isDark: isDark))
            .padding(.horizontal, 8)
            .frame(height: CGFloat(recipe.valueHeight))
            .background(Capsule().fill(valueKind == .accent ? Color.accentColor : MeeshyColors.controlFill(isDark: isDark)))
            .lineLimit(1)
    }
}

/// Le style qui rend la colonne entière avec l'état d'appui : le doigt posé
/// n'importe où dans la cible fait répondre le disque seul.
private struct MeeshyLabeledActionStyle<Content: View>: ButtonStyle {
    let build: (Bool) -> Content

    init(@ViewBuilder build: @escaping (Bool) -> Content) {
        self.build = build
    }

    func makeBody(configuration: Configuration) -> some View {
        build(configuration.isPressed)
    }
}

/// L'anneau d'attente : un arc qui tourne autour du disque, figé sous
/// « réduire les animations ».
private struct MeeshyLabeledActionRing: View {
    let diameter: Double
    let isStill: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: isStill)) { context in
            let turn = isStill ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1) * 360
            Circle()
                .trim(from: 0, to: 0.3)
                .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .frame(width: CGFloat(diameter) + 6, height: CGFloat(diameter) + 6)
                .rotationEffect(.degrees(turn))
        }
        .accessibilityHidden(true)
    }
}

private struct MeeshyActionGridSizeKey: EnvironmentKey {
    static let defaultValue: MeeshyLabeledActionSize = .s60
}

extension EnvironmentValues {
    /// La taille que la grille impose à ses actions : jamais choisie action par action.
    var meeshyActionGridSize: MeeshyLabeledActionSize {
        get { self[MeeshyActionGridSizeKey.self] }
        set { self[MeeshyActionGridSizeKey.self] = newValue }
    }
}

/// **La grille d'actions (K32)** : colonnes égales d'au moins 76, écart 8, rangées
/// espacées de 18, alignées en haut, sans jamais laisser une action seule sur sa
/// ligne quand on peut l'éviter ; la rangée courte est centrée. En grande police,
/// la grille perd une colonne plutôt que de couper un mot. `size` vaut pour toute
/// la grille ; sans lui, elle suit sa largeur (56, 60 ou 64).
public struct MeeshyActionGrid<Content: View>: View {
    private let columns: MeeshyActionColumns
    private let size: MeeshyLabeledActionSize?
    private let content: Content

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var measuredWidth: Double = 390

    public init(columns: MeeshyActionColumns = .adaptive(max: MeeshyActionGridRecipe.phoneMaxColumns),
                size: MeeshyLabeledActionSize? = nil,
                @ViewBuilder content: () -> Content) {
        self.columns = columns
        self.size = size
        self.content = content()
    }

    public var body: some View {
        let textScale = dynamicTypeSize.isAccessibilitySize ? 2.0 : 1.0
        MeeshyActionGridLayout(columns: columns, textScale: textScale) { content }
            .environment(\.meeshyActionGridSize, size ?? MeeshyActionGridRecipe.autoSize(width: measuredWidth))
            .background(GeometryReader { proxy in
                Color.clear.preference(key: MeeshyActionGridWidthKey.self, value: Double(proxy.size.width))
            })
            .onPreferenceChange(MeeshyActionGridWidthKey.self) { measuredWidth = $0 }
    }
}

private struct MeeshyActionGridWidthKey: PreferenceKey {
    static let defaultValue: Double = 390
    static func reduce(value: inout Double, nextValue: () -> Double) { value = nextValue() }
}

/// Le placement : les rangées de la recette, chacune centrée, alignées en haut.
private struct MeeshyActionGridLayout: Layout {
    let columns: MeeshyActionColumns
    let textScale: Double

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = Double(proposal.width ?? 390)
        let grid = MeeshyActionGridRecipe.resolve(width: width, count: subviews.count, columns: columns, textScale: textScale)
        return CGSize(width: CGFloat(width), height: CGFloat(totalHeight(grid: grid, subviews: subviews)))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let grid = MeeshyActionGridRecipe.resolve(width: Double(bounds.width), count: subviews.count,
                                                  columns: columns, textScale: textScale)
        var index = 0
        var y = bounds.minY
        for row in grid.rows {
            let rowWidth = Double(row) * grid.columnWidth + Double(row - 1) * MeeshyActionGridRecipe.columnGap
            var x = bounds.minX + (bounds.width - CGFloat(rowWidth)) / 2
            var rowHeight: CGFloat = 0
            for _ in 0..<row {
                let proposed = ProposedViewSize(width: CGFloat(grid.columnWidth), height: nil)
                subviews[index].place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: proposed)
                rowHeight = max(rowHeight, subviews[index].sizeThatFits(proposed).height)
                x += CGFloat(grid.columnWidth + MeeshyActionGridRecipe.columnGap)
                index += 1
            }
            y += rowHeight + CGFloat(MeeshyActionGridRecipe.rowGap)
        }
    }

    private func totalHeight(grid: MeeshyActionGridRecipe, subviews: Subviews) -> Double {
        var index = 0
        var total = 0.0
        for row in grid.rows {
            var rowHeight = 0.0
            for _ in 0..<row {
                let proposed = ProposedViewSize(width: CGFloat(grid.columnWidth), height: nil)
                rowHeight = max(rowHeight, Double(subviews[index].sizeThatFits(proposed).height))
                index += 1
            }
            total += rowHeight
        }
        return total + MeeshyActionGridRecipe.rowGap * Double(max(grid.rows.count - 1, 0))
    }
}
