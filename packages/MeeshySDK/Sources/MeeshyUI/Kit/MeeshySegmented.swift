import SwiftUI

/// Une option du choix : `id` porte la valeur, `title` le texte affiché,
/// `accessibilityLabel` remplace le titre quand celui-ci est une abréviation.
public nonisolated struct MeeshySegmentedOption<ID: Hashable & Sendable>: Sendable, Identifiable, Equatable {
    public let id: ID
    public let title: String
    public let accessibilityLabel: String?

    public init(id: ID, title: String, accessibilityLabel: String? = nil) {
        self.id = id
        self.title = title
        self.accessibilityLabel = accessibilityLabel
    }

    /// Le nom que lit l'accessibilité : l'étiquette quand elle existe, le titre sinon.
    public var spokenName: String {
        accessibilityLabel ?? title
    }
}

public nonisolated enum MeeshySegmentedRole: Sendable, Equatable {
    case choice
    case tabs
}

public nonisolated enum MeeshySegmentedTone: Sendable, Equatable {
    case media
    case theme
}

/// Les teintes d'un ton, toutes tirées des jetons : piste, pastille, encre au
/// repos, encre du courant, fond d'appui. Les contrastes se calculent dessus.
public nonisolated struct MeeshySegmentedPalette: Sendable, Equatable {
    public let track: Color
    public let pill: Color
    public let restInk: Color
    public let currentInk: Color
    public let pressedFill: Color

    public init(tone: MeeshySegmentedTone, isDark: Bool) {
        switch tone {
        case .media:
            track = MeeshyColors.controlFill(isDark: true)
            pill = MeeshyColors.onMedia
            restInk = MeeshyColors.onMedia
            currentInk = MeeshyColors.indigo950
            pressedFill = MeeshyColors.mediaFill
        case .theme:
            track = MeeshyColors.controlFill(isDark: isDark)
            pill = MeeshyColors.textPrimary(isDark: isDark)
            restInk = MeeshyColors.textPrimary(isDark: isDark)
            currentInk = MeeshyColors.backgroundPrimary(isDark: isDark)
            pressedFill = MeeshyColors.controlFill(isDark: isDark)
        }
    }
}

/// Un choix exclusif entre deux à quatre options dans une même piste. Il ne porte
/// ni verre ni ombre : il se pose dans un hôte opaque ou de verre dense.
public struct MeeshySegmented<ID: Hashable & Sendable>: View {
    private let label: String
    private let selection: Binding<ID>
    private let options: [MeeshySegmentedOption<ID>]
    private let role: MeeshySegmentedRole
    private let tone: MeeshySegmentedTone
    private let pressed: ID?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.layoutDirection) private var layoutDirection
    @Namespace private var pillSpace

    public init(
        _ label: String,
        selection: Binding<ID>,
        options: [MeeshySegmentedOption<ID>],
        role: MeeshySegmentedRole = .choice,
        tone: MeeshySegmentedTone = .media,
        pressed: ID? = nil
    ) {
        self.label = label
        self.selection = selection
        self.options = options
        self.role = role
        self.tone = tone
        self.pressed = pressed
    }

    public var body: some View {
        if MeeshySegmentedLaw.isRenderable(count: options.count) {
            track
        }
    }

    private var currentIndex: Int? {
        MeeshySegmentedLaw.currentIndex(selection: selection.wrappedValue, in: options.map(\.id))
    }

    private var track: some View {
        let palette = MeeshySegmentedPalette(tone: tone, isDark: colorScheme == .dark)
        let current = currentIndex
        return MeeshySegmentedLayout {
            ForEach(Array(MeeshySegmentedLaw.rendered(options).enumerated()), id: \.element.id) { index, option in
                segment(option, index: index, isCurrent: current == index, palette: palette)
            }
        }
        .padding(MeeshySpacing.xs)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xl).fill(palette.track))
        .meeshyAnimation(MeeshyAnimation.springFast, value: current)
        .opacity(isEnabled ? 1 : MeeshyGlassButtonRecipe.disabledOpacity)
        .modifier(MeeshySegmentedKeyboard(isEnabled: isEnabled, move: move))
        .accessibilityRepresentation {
            Picker(label, selection: selection) {
                ForEach(options) { option in
                    Text(option.spokenName).tag(option.id)
                }
            }
            .pickerStyle(.segmented)
            .disabled(!isEnabled)
        }
    }

    private func segment(
        _ option: MeeshySegmentedOption<ID>,
        index: Int,
        isCurrent: Bool,
        palette: MeeshySegmentedPalette
    ) -> some View {
        Button {
            choose(index: index)
        } label: {
            MeeshySegmentFace(
                title: option.title,
                ink: isCurrent ? palette.currentInk : palette.restInk,
                pill: isCurrent ? palette.pill : nil,
                pillSpace: pillSpace
            )
            .equatable()
        }
        .buttonStyle(MeeshySegmentButtonStyle(
            forcedPressed: pressed == option.id && !isCurrent,
            fill: palette.pressedFill
        ))
        .accessibilityLabel(option.spokenName)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    private func choose(index: Int) {
        guard options.indices.contains(index),
              let next = MeeshySegmentedLaw.tapResult(current: currentIndex, target: index, isEnabled: isEnabled)
        else { return }
        selection.wrappedValue = options[next].id
        HapticFeedback.light()
    }

    private func move(_ key: MeeshySegmentedLaw.Key) -> Bool {
        guard let target = MeeshySegmentedLaw.keyboardTarget(
            key: key,
            index: currentIndex ?? 0,
            count: options.count,
            rtl: layoutDirection == .rightToLeft
        ) else { return false }
        choose(index: target)
        return true
    }
}

/// Le texte d'un segment et, pour le courant, la pastille qui glisse : une vue
/// feuille, égale à elle-même tant que ses paramètres ne bougent pas. Elle prend
/// la part que la piste lui donne ; le texte ne passe à la ligne que si une
/// option seule dépasse la piste (grande police) : jamais tronqué, jamais débordant.
private struct MeeshySegmentFace: View, Equatable {
    let title: String
    let ink: Color
    let pill: Color?
    let pillSpace: Namespace.ID

    static func == (lhs: MeeshySegmentFace, rhs: MeeshySegmentFace) -> Bool {
        lhs.title == rhs.title && lhs.ink == rhs.ink && lhs.pill == rhs.pill
    }

    var body: some View {
        Text(title)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
            .foregroundStyle(ink)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.regular, maxHeight: .infinity)
            .background {
                if let pill {
                    Capsule()
                        .fill(pill)
                        .matchedGeometryEffect(id: "pill", in: pillSpace)
                }
            }
            .contentShape(Capsule())
    }
}

/// L'appui et le survol au pointeur : le même fond sous le segment, sans échelle.
private struct MeeshySegmentButtonStyle: ButtonStyle {
    let forcedPressed: Bool
    let fill: Color

    func makeBody(configuration: Configuration) -> some View {
        MeeshySegmentPressSurface(
            label: configuration.label,
            isPressed: configuration.isPressed || forcedPressed,
            fill: fill
        )
    }
}

private struct MeeshySegmentPressSurface<Label: View>: View {
    let label: Label
    let isPressed: Bool
    let fill: Color

    @State private var isHovered = false

    var body: some View {
        label
            .background {
                Capsule()
                    .fill(fill)
                    .opacity(isPressed || isHovered ? 1 : 0)
            }
            .onHover { isHovered = $0 }
    }
}

/// Le clavier matériel (iPad, iOS 17 et plus) : un seul arrêt de focus pour la
/// piste, les flèches sélectionnent le voisin en boucle, Début et Fin les bornes.
private struct MeeshySegmentedKeyboard: ViewModifier {
    let isEnabled: Bool
    let move: @MainActor (MeeshySegmentedLaw.Key) -> Bool

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content
                .focusable(isEnabled)
                .onKeyPress(keys: [.leftArrow, .rightArrow, .home, .end]) { press in
                    guard let key = Self.lawKey(press.key), move(key) else { return .ignored }
                    return .handled
                }
        } else {
            content
        }
    }

    @available(iOS 17.0, macOS 14.0, *)
    private static func lawKey(_ key: KeyEquivalent) -> MeeshySegmentedLaw.Key? {
        switch key {
        case .leftArrow: return .left
        case .rightArrow: return .right
        case .home: return .home
        case .end: return .end
        default: return nil
        }
    }
}

/// La répartition de la planche : parts égales, plancher au texte, repli en
/// rangées. Les largeurs idéales se mesurent une fois par changement de
/// segments. Le placement s'écrit de gauche à droite : SwiftUI le retourne
/// lui-même en RTL, la première option arrive donc à droite.
private struct MeeshySegmentedLayout: Layout {
    struct Cache {
        var ideal: [CGSize]
    }

    private struct Slot {
        let index: Int
        let frame: CGRect
    }

    func makeCache(subviews: Subviews) -> Cache {
        Cache(ideal: subviews.map { $0.sizeThatFits(.unspecified) })
    }

    func updateCache(_ cache: inout Cache, subviews: Subviews) {
        cache = makeCache(subviews: subviews)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        arrangement(width: proposal.width, subviews: subviews, ideal: cache.ideal).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        arrangement(width: bounds.width, subviews: subviews, ideal: cache.ideal).slots.forEach { slot in
            subviews[slot.index].place(
                at: CGPoint(x: bounds.minX + slot.frame.minX, y: bounds.minY + slot.frame.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(slot.frame.size)
            )
        }
    }

    /// Une option seule plus large que la piste y est bornée : elle passe à la
    /// ligne plutôt que de déborder.
    private func arrangement(width: CGFloat?, subviews: Subviews, ideal: [CGSize]) -> (size: CGSize, slots: [Slot]) {
        let widths = ideal.map { Double($0.width) }
        let available = width.flatMap { $0.isFinite ? Double($0) : nil } ?? widths.reduce(0, +)
        let rows = MeeshySegmentedLaw.rows(widths: widths, available: available)
        let shares = MeeshySegmentedLaw.partition(widths: widths, available: available)
        let laid = zip(rows, shares).reduce(into: (top: CGFloat(0), slots: [Slot]())) { state, row in
            let sized = zip(row.0, row.1).map { (index: $0, width: CGFloat(min($1, available))) }
            let height = sized
                .map { subviews[$0.index].sizeThatFits(ProposedViewSize(width: $0.width, height: nil)).height }
                .max() ?? 0
            let line = sized.reduce(into: (x: CGFloat(0), slots: [Slot]())) { cursor, item in
                cursor.slots.append(Slot(index: item.index, frame: CGRect(x: cursor.x, y: state.top, width: item.width, height: height)))
                cursor.x += item.width
            }
            state.slots += line.slots
            state.top += height
        }
        return (CGSize(width: CGFloat(available), height: laid.top), laid.slots)
    }
}
