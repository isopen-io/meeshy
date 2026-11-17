import SwiftUI

/// Les mots dits de la liste, traduits par l'hôte : la poignée, les deux actions de
/// la voix et l'annonce du nouveau rang.
public struct MeeshyReorderLabels {
    public let handle: (String) -> String
    public let moveUp: String
    public let moveDown: String
    public let announce: (String, Int, Int) -> String

    public init(handle: @escaping (String) -> String,
                moveUp: String,
                moveDown: String,
                announce: @escaping (String, Int, Int) -> String) {
        self.handle = handle
        self.moveUp = moveUp
        self.moveDown = moveDown
        self.announce = announce
    }
}

/// **La poignée de glisser (K52)** : six points, cible de 44 × 44 (32 × 44 sur le bord de début).
/// Seule, pour une rangée qui la place elle-même ; dans la liste, elle porte le geste.
public struct MeeshyReorderHandle: View {
    private let label: String
    private let phase: MeeshyReorderPhase
    private let edge: MeeshyReorderHandleEdge
    private let isEnabled: Bool
    private let onDrag: ((CGFloat) -> Void)?
    private let onDrop: ((CGFloat) -> Void)?

    public init(label: String, phase: MeeshyReorderPhase = .rest) {
        self.init(label: label, phase: phase, edge: .trailing, isEnabled: true, onDrag: nil, onDrop: nil)
    }

    init(label: String,
         phase: MeeshyReorderPhase,
         edge: MeeshyReorderHandleEdge,
         isEnabled: Bool,
         onDrag: ((CGFloat) -> Void)?,
         onDrop: ((CGFloat) -> Void)?) {
        self.label = label
        self.phase = phase
        self.edge = edge
        self.isEnabled = isEnabled
        self.onDrag = onDrag
        self.onDrop = onDrop
    }

    public var body: some View {
        let recipe = MeeshyReorderListRecipe.resolve(phase: phase, rank: .hidden, isFirst: false, isEnabled: isEnabled,
                                                     isPending: false, handleEdge: edge, reduceMotion: false)
        Image(systemName: "line.3.horizontal")
            .font(MeeshyFont.relative(22))
            .foregroundStyle(recipe.isLifted ? Color.primary : Color.secondary)
            .frame(width: CGFloat(recipe.handleWidth), height: CGFloat(recipe.handleHeight))
            .contentShape(Rectangle())
            .opacity(isEnabled ? 1 : MeeshyOpacity.medium)
            .gesture(drag)
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in if isEnabled { onDrag?(value.translation.height) } }
            .onEnded { value in if isEnabled { onDrop?(value.translation.height) } }
    }
}

/// Ce que l'hôte reçoit pour dessiner une rangée : sa place, son état et la poignée à poser où il veut.
public struct MeeshyReorderRowContext {
    public let rank: Int
    public let count: Int
    public let phase: MeeshyReorderPhase
    public let isPending: Bool
    public let handle: MeeshyReorderHandle
}

/// **La liste réordonnable (K52)** : deux à douze rangées verticales, chacune avec sa
/// poignée. Le contenu de la rangée est celui de l'hôte, sans retouche ; K52 la déplace
/// entière. Le glisser, les actions « monter » / « descendre » de la voix appellent le
/// même `onMove(from, to)`, une seule fois, au dépôt.
///
/// L'hôte tient la liste et la renvoie rangée : K52 n'enregistre rien et ne sait ni
/// langue, ni adresse, ni conversation. Une rangée dont l'ordre attend sa confirmation
/// (`pendingIDs`) ne se saisit pas.
public struct MeeshyReorderList<Item, Row: View>: View {
    private let label: String
    private let items: [Item]
    private let id: (Item) -> String
    private let title: (Item) -> String
    private let onMove: (Int, Int) -> Void
    private let rank: MeeshyReorderRank
    private let emphasizesFirst: Bool
    private let handleEdge: MeeshyReorderHandleEdge
    private let isEnabled: Bool
    private let pendingIDs: Set<String>
    private let hint: String?
    private let labels: MeeshyReorderLabels
    private let tint: Color?
    private let spacing: CGFloat
    private let row: (Item, MeeshyReorderRowContext) -> Row

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var draggedID: String?
    @State private var offset: CGFloat = 0
    @State private var heights: [String: CGFloat] = [:]

    public init(label: String,
                items: [Item],
                id: @escaping (Item) -> String,
                title: @escaping (Item) -> String,
                labels: MeeshyReorderLabels,
                onMove: @escaping (Int, Int) -> Void,
                rank: MeeshyReorderRank = .hidden,
                emphasizesFirst: Bool = false,
                handleEdge: MeeshyReorderHandleEdge = .trailing,
                isEnabled: Bool = true,
                pendingIDs: Set<String> = [],
                hint: String? = nil,
                tint: Color? = nil,
                spacing: CGFloat = MeeshySpacing.sm,
                @ViewBuilder row: @escaping (Item, MeeshyReorderRowContext) -> Row) {
        assert(!label.isEmpty, "MeeshyReorderList : label obligatoire")
        self.label = label
        self.items = items
        self.id = id
        self.title = title
        self.labels = labels
        self.onMove = onMove
        self.rank = rank
        self.emphasizesFirst = emphasizesFirst
        self.handleEdge = handleEdge
        self.isEnabled = isEnabled
        self.pendingIDs = pendingIDs
        self.hint = hint
        self.tint = tint
        self.spacing = spacing
        self.row = row
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var isActive: Bool { MeeshyReorderListRecipe.isActive(isEnabled: isEnabled, count: items.count) }
    private var entries: [MeeshyReorderEntry<Item>] {
        items.enumerated().map { MeeshyReorderEntry(id: id($0.element), index: $0.offset, item: $0.element) }
    }
    private var rowIDs: [String] { items.map(id) }
    private var orderedHeights: [Double] { rowIDs.map { Double(heights[$0] ?? 0) } }
    private var accent: Color { tint ?? MeeshyColors.brandPrimary }

    public var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            if let hint, isActive {
                Text(verbatim: hint)
                    .meeshyScaledFont(MeeshyFont.smallSize)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .accessibilityHidden(true)
            }
            ForEach(entries) { entry in
                rowView(entry.item, index: entry.index)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func phase(of identifier: String) -> MeeshyReorderPhase {
        draggedID == identifier ? .flying : .rest
    }

    private func target(from index: Int, offset: CGFloat) -> Int {
        MeeshyReorder.targetIndex(from: index, offset: Double(offset), heights: orderedHeights, spacing: Double(spacing))
    }

    private func shift(of index: Int, identifier: String) -> CGFloat {
        guard let draggedID, let from = rowIDs.firstIndex(of: draggedID) else { return 0 }
        if identifier == draggedID { return offset }
        let to = target(from: from, offset: offset)
        let step = (heights[draggedID] ?? 0) + spacing
        if from < to, index > from, index <= to { return -step }
        if from > to, index >= to, index < from { return step }
        return 0
    }

    @ViewBuilder
    private func rowView(_ item: Item, index: Int) -> some View {
        let identifier = id(item)
        let isPending = pendingIDs.contains(identifier)
        let current = phase(of: identifier)
        let recipe = MeeshyReorderListRecipe.resolve(phase: current, rank: rank, isFirst: index == 0, isEnabled: isActive,
                                                     isPending: isPending, handleEdge: handleEdge, reduceMotion: reduceMotion)
        let handle = MeeshyReorderHandle(
            label: labels.handle(title(item)), phase: current, edge: handleEdge, isEnabled: recipe.isGrabbable,
            onDrag: { translation in
                if draggedID == nil { HapticFeedback.light() }
                draggedID = identifier
                offset = translation
            },
            onDrop: { translation in drop(index: index, translation: translation) })
        let context = MeeshyReorderRowContext(rank: index, count: items.count, phase: current, isPending: isPending, handle: handle)
        row(item, context)
            .overlay(accentBorder(recipe: recipe))
            .overlay(alignment: .topLeading) { rankPill(recipe: recipe, index: index) }
            .rotationEffect(.degrees(recipe.tiltDegrees))
            .shadow(color: Color.black.opacity(recipe.isLifted ? 0.4 : 0), radius: recipe.isLifted ? 14 : 0, x: 0, y: 8)
            .offset(y: shift(of: index, identifier: identifier))
            .zIndex(recipe.zIndex)
            .animation(MeeshyReorderListRecipe.settleAnimation(reduce: reduceMotion), value: draggedID)
            .background(GeometryReader { proxy in
                Color.clear.onAppear { heights[identifier] = proxy.size.height }
                    .adaptiveOnChange(of: proxy.size.height) { _, new in heights[identifier] = new }
            })
            .accessibilityAction(named: Text(verbatim: labels.moveUp)) { voiceMove(index: index, direction: .up, item: item) }
            .accessibilityAction(named: Text(verbatim: labels.moveDown)) { voiceMove(index: index, direction: .down, item: item) }
    }

    @ViewBuilder
    private func accentBorder(recipe: MeeshyReorderListRecipe) -> some View {
        let opacity = MeeshyReorderListRecipe.accentBorderOpacity(emphasizesFirst: emphasizesFirst, isFirst: recipe.isFirst)
        RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus, style: .continuous)
            .strokeBorder(accent.opacity(opacity), lineWidth: MeeshyBorder.regular)
            .allowsHitTesting(false)
    }

    @ViewBuilder
    private func rankPill(recipe: MeeshyReorderListRecipe, index: Int) -> some View {
        if recipe.showsRank {
            Text(verbatim: "\(index + 1)")
                .meeshyScaledFont(15, weight: .heavy, design: .rounded)
                .monospacedDigit()
                .foregroundStyle(Color.white)
                .frame(width: CGFloat(MeeshyReorderListRecipe.rankPillDiameter), height: CGFloat(MeeshyReorderListRecipe.rankPillDiameter))
                .background(Circle().fill(accent.opacity(MeeshyReorderListRecipe.rankOpacity(position: index))))
                .padding(MeeshySpacing.sm)
                .accessibilityHidden(true)
        }
    }

    private func drop(index: Int, translation: CGFloat) {
        let destination = target(from: index, offset: translation)
        draggedID = nil
        offset = 0
        guard destination != index else { return }
        HapticFeedback.medium()
        onMove(index, destination)
        announce(index: destination, item: items[index])
    }

    private func voiceMove(index: Int, direction: MeeshyReorderDirection, item: Item) {
        let allowed = direction == .up ? MeeshyReorder.canMoveUp(index: index, count: items.count)
                                       : MeeshyReorder.canMoveDown(index: index, count: items.count)
        guard isActive, allowed, !pendingIDs.contains(id(item)) else { return }
        let destination = MeeshyReorder.destination(forIndex: index, direction: direction)
        onMove(index, destination)
        announce(index: destination, item: item)
    }

    private func announce(index: Int, item: Item) {
        AdaptiveAccessibility.announce(labels.announce(title(item), index + 1, items.count))
    }
}

private struct MeeshyReorderEntry<Item>: Identifiable {
    let id: String
    let index: Int
    let item: Item
}
