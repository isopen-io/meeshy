import SwiftUI

// MARK: - Les valeurs

/// Le remplissage d'une pastille : uni, dégradé, ou disque creux (« Aucun »).
/// Le sens d'un dégradé ne se reflète pas en RTL.
public nonisolated enum MeeshyColorDotFill: Sendable, Equatable {
    case solid(Color)
    case gradient([Color])
    case hollow
}

/// Une pastille. `id` est l'identifiant stable et unique, choisi par l'hôte ;
/// `name` le nom déjà traduit, optionnel ; `systemImage` un glyphe au centre.
public nonisolated struct MeeshyColorDot: Identifiable, Sendable, Equatable {
    public let id: String
    public let fill: MeeshyColorDotFill
    public let name: String?
    public let systemImage: String?

    public init(id: String, fill: MeeshyColorDotFill, name: String? = nil, systemImage: String? = nil) {
        self.id = id
        self.fill = fill
        self.name = name
        self.systemImage = systemImage
    }
}

/// Les deux diamètres de K07. La cellule tactile reste 44 pt quel que soit le diamètre.
public nonisolated enum MeeshyColorDotSize: String, Sendable, Equatable, CaseIterable {
    case s28
    case s32

    public var diameter: Double {
        switch self {
        case .s28: return Double(MeeshyControlSize.small)
        case .s32: return Double(MeeshyControlSize.compact)
        }
    }

    public var cell: Double { Double(MeeshyControlSize.tapTarget) }
}

/// `wrap` passe à la ligne ; `row` tient sur une ligne, défile et s'estompe s'il déborde.
public nonisolated enum MeeshyColorDotsLayout: String, Sendable, Equatable, CaseIterable {
    case wrap
    case row
}

/// Le retour du choix : un `light` par le site unique de K02, ou aucun quand
/// l'hôte joue le sien. Une seule loi pour les deux composants.
public typealias MeeshyColorDotHaptic = MeeshyGlassButtonHaptic

// MARK: - Le groupe

/// **Un groupe de choix unique : des disques dont un seul est courant, cerclé** (K07).
///
/// Ni palette, ni titre visible, ni verre : l'hôte passe les pastilles, leur nom
/// et la courante. Toucher une pastille rappelle `onSelect(id)` une fois, au
/// relâcher ; retoucher la courante le rappelle aussi, l'hôte décide.
/// `trailing` porte une action qui n'est pas un choix (« Aléatoire ») : elle se
/// pose dans le flux, après la dernière pastille, dans une cellule de 44 pt.
/// Une liste vide ne rend rien. `.disabled(_:)` : contenu à 40 %, ni action ni
/// haptique.
public struct MeeshyColorDots<Trailing: View>: View {
    private let dots: [MeeshyColorDot]
    private let selection: String?
    private let label: String
    private let size: MeeshyColorDotSize
    private let layout: MeeshyColorDotsLayout
    private let tone: MeeshyGlassTone?
    private let haptic: MeeshyColorDotHaptic
    private let onSelect: (String) -> Void
    private let trailing: Trailing
    private var pressedPreview: String?

    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ dots: [MeeshyColorDot],
                selection: String? = nil,
                label: String,
                size: MeeshyColorDotSize = .s28,
                layout: MeeshyColorDotsLayout = .wrap,
                tone: MeeshyGlassTone? = nil,
                haptic: MeeshyColorDotHaptic = .light,
                onSelect: @escaping (String) -> Void,
                @ViewBuilder trailing: () -> Trailing) {
        self.dots = dots
        self.selection = selection
        self.label = label
        self.size = size
        self.layout = layout
        self.tone = tone
        self.haptic = haptic
        self.onSelect = onSelect
        self.trailing = trailing()
    }

    @ViewBuilder
    public var body: some View {
        if !dots.isEmpty {
            arranged
                .accessibilityElement(children: .contain)
                .accessibilityLabel(label)
        }
    }

    @ViewBuilder
    private var arranged: some View {
        switch layout {
        case .wrap:
            MeeshyColorDotsFlow(size: size, layout: .wrap) { content }
        case .row:
            MeeshyColorDotsRow(size: size, selection: selection, reduceMotion: reduceMotion) { content }
        }
    }

    @ViewBuilder
    private var content: some View {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 1, available: .infinity, size: size, layout: .row,
                                                   tone: tone ?? hostTone)
        let ink = recipe.inkColor(isDark: colorScheme == .dark)
        ForEach(Array(dots.enumerated()), id: \.element.id) { index, dot in
            MeeshyColorDotCell(
                dot: dot,
                name: MeeshyColorDotsWords.spokenName(of: dot, index: index, total: dots.count),
                isSelected: MeeshyColorDotsRecipe.isCurrent(dot.id, selection: selection),
                isPressedPreview: dot.id == pressedPreview,
                size: size,
                ink: ink,
                reduceMotion: reduceMotion,
                haptic: haptic,
                onSelect: onSelect
            )
            .equatable()
            .id(dot.id)
        }
        trailing
    }

    /// Le catalogue fige une pastille sous le doigt : un bouton ne se tient pas
    /// pressé hors écran.
    func previewPressed(_ id: String?) -> Self {
        var copy = self
        copy.pressedPreview = id
        return copy
    }
}

extension MeeshyColorDots where Trailing == EmptyView {
    public init(_ dots: [MeeshyColorDot],
                selection: String? = nil,
                label: String,
                size: MeeshyColorDotSize = .s28,
                layout: MeeshyColorDotsLayout = .wrap,
                tone: MeeshyGlassTone? = nil,
                haptic: MeeshyColorDotHaptic = .light,
                onSelect: @escaping (String) -> Void) {
        self.init(dots, selection: selection, label: label, size: size, layout: layout,
                  tone: tone, haptic: haptic, onSelect: onSelect, trailing: { EmptyView() })
    }
}

// MARK: - La disposition

/// Pose des cellules jointives de 44 pt depuis la recette, sans mesurer aucune
/// pastille : l'encombrement est celui des disques, la cible déborde de `inset`.
struct MeeshyColorDotsFlow: Layout {
    let size: MeeshyColorDotSize
    let layout: MeeshyColorDotsLayout

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrangement(count: subviews.count, width: proposal.width).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let recipe = arrangement(count: subviews.count, width: proposal.width ?? bounds.width)
        let side = ProposedViewSize(width: CGFloat(recipe.cell), height: CGFloat(recipe.cell))
        for (index, subview) in subviews.enumerated() {
            let origin = recipe.cellOrigin(index: index)
            subview.place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
                          anchor: .topLeading, proposal: side)
        }
    }

    private func arrangement(count: Int, width: CGFloat?) -> MeeshyColorDotsRecipe {
        MeeshyColorDotsRecipe.resolve(count: count, available: width.map { Double($0) } ?? .infinity,
                                      size: size, layout: layout)
    }
}

/// La ligne `row` : posée telle quelle si elle tient ; sinon elle défile,
/// s'estompe au bord de fin et se cale sur la courante — sans animation à
/// l'apparition, au ressort ensuite, immédiatement sous « réduire les animations ».
struct MeeshyColorDotsRow<Content: View>: View {
    let size: MeeshyColorDotSize
    let selection: String?
    let reduceMotion: Bool
    @ViewBuilder let content: Content

    var body: some View {
        ViewThatFits(in: .horizontal) {
            MeeshyColorDotsFlow(size: size, layout: .row) { content }
            scrolling
        }
    }

    private var scrolling: some View {
        let inset = (size.cell - size.diameter) / 2
        return ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                MeeshyColorDotsFlow(size: size, layout: .row) { content }
                    .padding(inset)
            }
            .mask { fade }
            .padding(-inset)
            .onAppear { scroll(proxy, animated: false) }
            .adaptiveOnChange(of: selection) { _, _ in scroll(proxy, animated: true) }
        }
    }

    private var fade: some View {
        LinearGradient(
            stops: [
                .init(color: MeeshyColors.onMedia, location: 0),
                .init(color: MeeshyColors.onMedia, location: MeeshyColorDotsRecipe.fadeStart),
                .init(color: .clear, location: 1),
            ],
            startPoint: .leading, endPoint: .trailing
        )
        .flipsForRightToLeftLayoutDirection(true)
    }

    private func scroll(_ proxy: ScrollViewProxy, animated: Bool) {
        guard let selection else { return }
        let animation = animated ? MeeshyColorDotsRecipe.ringAnimation(reduceMotion: reduceMotion) : nil
        withAnimation(animation) { proxy.scrollTo(selection, anchor: .center) }
    }
}

// MARK: - La pastille

/// Une cellule de 44 pt. `Equatable` sur ses valeurs (la fermeture hors
/// comparaison, l'hôte la garde stable) : à un choix, seules l'ancienne et la
/// nouvelle courante se re-rendent.
struct MeeshyColorDotCell: View, Equatable {
    let dot: MeeshyColorDot
    let name: String
    let isSelected: Bool
    let isPressedPreview: Bool
    let size: MeeshyColorDotSize
    let ink: Color
    let reduceMotion: Bool
    let haptic: MeeshyColorDotHaptic
    let onSelect: (String) -> Void

    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.dot == rhs.dot && lhs.name == rhs.name && lhs.isSelected == rhs.isSelected
            && lhs.isPressedPreview == rhs.isPressedPreview && lhs.size == rhs.size && lhs.ink == rhs.ink
            && lhs.reduceMotion == rhs.reduceMotion && lhs.haptic == rhs.haptic
    }

    var body: some View {
        Button(action: select) { EmptyView() }
            .buttonStyle(MeeshyColorDotStyle(
                dot: dot, size: size, isSelected: isSelected, isPressedPreview: isPressedPreview,
                isHovered: isHovered, ink: ink, reduceMotion: reduceMotion
            ))
            .onHover { isHovered = $0 }
            .accessibilityLabel(name)
            .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
            .accessibilityShowsLargeContentViewer {
                Label {
                    Text(name)
                } icon: {
                    MeeshyColorDotDisc(dot: dot, size: size, isSelected: false, isPressed: false,
                                       isHovered: false, ink: ink, reduceMotion: true)
                }
            }
    }

    private func select() {
        MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: haptic) { onSelect(dot.id) }
    }
}

struct MeeshyColorDotStyle: ButtonStyle {
    let dot: MeeshyColorDot
    let size: MeeshyColorDotSize
    let isSelected: Bool
    let isPressedPreview: Bool
    let isHovered: Bool
    let ink: Color
    let reduceMotion: Bool

    func makeBody(configuration: Configuration) -> some View {
        MeeshyColorDotDisc(dot: dot, size: size, isSelected: isSelected,
                           isPressed: configuration.isPressed || isPressedPreview,
                           isHovered: isHovered, ink: ink, reduceMotion: reduceMotion)
    }
}

/// Le disque dans sa cellule : fond, glyphe, filet intérieur, cercle de la
/// courante. Seuls l'opacité et l'échelle du cercle s'animent ; le pré-cercle
/// paraît sous le doigt sans attendre.
struct MeeshyColorDotDisc: View {
    let dot: MeeshyColorDot
    let size: MeeshyColorDotSize
    let isSelected: Bool
    let isPressed: Bool
    let isHovered: Bool
    let ink: Color
    let reduceMotion: Bool

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 1, available: .infinity, size: size, layout: .row)
        let hairline = MeeshyColorDotsRecipe.hairline(isHovered: isHovered, increasedContrast: contrast == .increased)
        ZStack {
            fill(diameter: recipe.diameter)
            glyph(diameter: recipe.diameter)
            Circle()
                .strokeBorder(ink.opacity(hairline), lineWidth: MeeshyBorder.regular)
                .frame(width: recipe.diameter, height: recipe.diameter)
            Circle()
                .strokeBorder(ink, lineWidth: recipe.ringWidth)
                .frame(width: recipe.ringDiameter, height: recipe.ringDiameter)
                .scaleEffect(MeeshyColorDotsRecipe.ringScale(isSelected: isSelected, isPressed: isPressed))
                .opacity(MeeshyColorDotsRecipe.ringOpacity(isSelected: isSelected, isPressed: isPressed))
                .animation(MeeshyColorDotsRecipe.ringAnimation(reduceMotion: reduceMotion), value: isSelected)
        }
        .frame(width: recipe.cell, height: recipe.cell)
        .contentShape(Rectangle())
        .opacity(isEnabled ? 1 : MeeshyColorDotsRecipe.disabledOpacity)
    }

    @ViewBuilder
    private func fill(diameter: Double) -> some View {
        switch dot.fill {
        case .solid(let color):
            Circle().fill(color).frame(width: diameter, height: diameter)
        case .gradient(let colors):
            Circle()
                .fill(LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing))
                .frame(width: diameter, height: diameter)
        case .hollow:
            Circle()
                .strokeBorder(ink.opacity(MeeshyColorDotsRecipe.hairlineEmphasisOpacity), lineWidth: MeeshyBorder.regular)
                .frame(width: diameter, height: diameter)
        }
    }

    @ViewBuilder
    private func glyph(diameter: Double) -> some View {
        if let systemImage = dot.systemImage {
            Image(systemName: systemImage)
                .font(.system(size: diameter * MeeshyColorDotsRecipe.glyphScale, weight: .semibold))
                .foregroundStyle(MeeshyColorDotsRecipe.glyphInk(on: dot.fill, groupInk: ink))
                .accessibilityHidden(true)
        }
    }
}
