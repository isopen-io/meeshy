import SwiftUI

// MARK: - La place publiée

/// **La place qu'une feuille ancrée occupe AU REPOS**, en coordonnées globales : l'hôte y
/// arrête son contenu (il se réduit au-dessus d'elle) au lieu de le laisser passer dessous.
public nonisolated struct MeeshyAnchoredSheetFootprint: Sendable, Equatable {
    /// Le haut de la feuille au repos.
    public let top: CGFloat
    public let height: CGFloat

    public init(top: CGFloat, height: CGFloat) {
        self.top = top
        self.height = height
    }
}

/// La préférence qui porte la place publiée. Feuille fermée : `nil`.
public struct MeeshyAnchoredSheetFootprintKey: PreferenceKey {
    public static let defaultValue: MeeshyAnchoredSheetFootprint? = nil

    public static func reduce(value: inout MeeshyAnchoredSheetFootprint?, nextValue: () -> MeeshyAnchoredSheetFootprint?) {
        value = nextValue() ?? value
    }
}

private struct MeeshyAnchoredSheetContentHeightKey: PreferenceKey {
    static let defaultValue: CGFloat? = nil

    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        value = nextValue() ?? value
    }
}

public extension View {
    /// L'hôte lit la place de la feuille ancrée ouverte, `nil` quand elle est fermée.
    func onMeeshyAnchoredSheetFootprint(_ perform: @escaping (MeeshyAnchoredSheetFootprint?) -> Void) -> some View {
        onPreferenceChange(MeeshyAnchoredSheetFootprintKey.self) { perform($0) }
    }
}

// MARK: - Le décalage du doigt

/// Le décalage du glissé, tenu hors de la feuille : seul `MeeshyAnchoredSheetOffset` l'observe,
/// ni le contenu de l'hôte ni celui de la feuille ne sont réévalués à chaque image du doigt.
final class MeeshyAnchoredSheetDragModel: ObservableObject {
    @Published var offset: CGFloat = 0
}

private struct MeeshyAnchoredSheetOffset: ViewModifier {
    let restOffset: CGFloat
    @ObservedObject var drag: MeeshyAnchoredSheetDragModel

    func body(content: Content) -> some View {
        content.offset(y: restOffset + drag.offset)
    }
}

// MARK: - La disposition

/// Les hauteurs d'une feuille à un instant : sa place au repos, celle du cran le plus haut
/// sur laquelle elle est posée, et ce qu'elle laisse à glisser vers le haut.
nonisolated struct MeeshyAnchoredSheetLayout: Equatable {
    let rests: [CGFloat]
    let index: Int
    let hasDetents: Bool

    var rest: CGFloat { rests.indices.contains(index) ? rests[index] : 0 }
    var layoutHeight: CGFloat { rests.last ?? 0 }
    var restOffset: CGFloat { layoutHeight - rest }

    static func resolve(
        height: MeeshyAnchoredSheetHeight,
        content: CGFloat?,
        available: CGFloat,
        maximumFraction: CGFloat,
        detentIndex: Int
    ) -> MeeshyAnchoredSheetLayout {
        if case .detents(let parts, _) = height {
            let rests = MeeshyAnchoredSheetMetrics.detentHeights(parts, available: available, maximumFraction: maximumFraction)
            return MeeshyAnchoredSheetLayout(rests: rests, index: min(max(0, detentIndex), max(0, rests.count - 1)), hasDetents: rests.count > 1)
        }
        let rest = MeeshyAnchoredSheetMetrics.height(
            height, content: content ?? 0, available: available, maximumFraction: maximumFraction
        )
        return MeeshyAnchoredSheetLayout(rests: [rest], index: 0, hasDetents: false)
    }
}

private nonisolated struct MeeshyAnchoredSheetShape: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let r = min(radius, rect.width / 2, rect.height / 2)
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        p.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r,
                 startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r,
                 startAngle: .degrees(270), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

// MARK: - Les mots

/// Les mots du kit : le nom du ✕ et celui de la poignée à crans, dans les sept langues.
public nonisolated enum MeeshyAnchoredSheetCopy {
    public static var close: String {
        String(localized: "kit.anchored_sheet.close", defaultValue: "Fermer", bundle: .module)
    }

    static var heightLabel: String {
        String(localized: "kit.anchored_sheet.height", defaultValue: "Hauteur de la feuille", bundle: .module)
    }

    static var reduced: String {
        String(localized: "kit.anchored_sheet.height.reduced", defaultValue: "réduite", bundle: .module)
    }

    static var expanded: String {
        String(localized: "kit.anchored_sheet.height.expanded", defaultValue: "agrandie", bundle: .module)
    }
}

// MARK: - La feuille

/// **Une feuille opaque ancrée en bas de son hôte** (K15) : poignée, titre et fermeture
/// optionnels, hauteur au contenu, fixe ou à crans. Elle PUBLIE sa place au repos
/// (`MeeshyAnchoredSheetFootprintKey`) pour que l'hôte réduise son contenu au-dessus d'elle.
///
/// Elle ne choisit rien : quelle feuille s'ouvre, son titre traduit, sa hauteur par portail,
/// la réduction du contenu et les états de ce qu'elle porte sont à l'hôte. `onDismiss` est
/// le chemin UNIQUE de ✕, du glissé, du toucher hors feuille, d'Échap et de l'échappement
/// du lecteur d'écran.
///
/// - Glissé vers le bas depuis la poignée ou l'en-tête : la feuille suit le doigt, sans
///   monter au-dessus de son repos (hors crans) ; elle se ferme au quart de sa hauteur ou
///   si sa fin prédite passe la moitié (`MeeshyAnchoredSheetMetrics`).
/// - En-tête : titre au bord de début, ✕ doux au bord de fin, remplacé par `trailing`.
///   Sans titre ni `trailing`, pas de rangée.
/// - `surface` : `.theme` suit le thème, `.dark` force l'indigo sombre sans
///   `preferredColorScheme`.
/// - `outside` : `.dismisses` ferme au toucher hors feuille et rend la feuille modale,
///   `.passesThrough` laisse le toucher à l'hôte.
public struct MeeshyAnchoredSheet<Trailing: View, Content: View>: View {
    private let title: String?
    private let accessibilityLabel: String?
    private let height: MeeshyAnchoredSheetHeight
    private let maximumFraction: CGFloat
    private let showsHandle: Bool
    private let isDragDismissEnabled: Bool
    private let closeLabel: String?
    private let surface: MeeshyAnchoredSheetSurface
    private let outside: MeeshyAnchoredSheetOutside
    private let scrim: Bool
    private let maxWidth: CGFloat?
    private let onDismiss: () -> Void
    private let trailing: Trailing
    private let content: Content

    @State private var contentHeight: CGFloat?
    @State private var detentIndex: Int
    @State private var drag = MeeshyAnchoredSheetDragModel()
    @AccessibilityFocusState private var titleFocused: Bool
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
        title: String? = nil,
        accessibilityLabel: String? = nil,
        height: MeeshyAnchoredSheetHeight = .content,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction,
        showsHandle: Bool = true,
        isDragDismissEnabled: Bool = true,
        closeLabel: String? = MeeshyAnchoredSheetCopy.close,
        surface: MeeshyAnchoredSheetSurface = .theme,
        outside: MeeshyAnchoredSheetOutside = .dismisses,
        scrim: Bool = false,
        maxWidth: CGFloat? = nil,
        onDismiss: @escaping () -> Void,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder content: () -> Content
    ) {
        assert(title != nil || !(accessibilityLabel ?? "").isEmpty,
               "MeeshyAnchoredSheet : sans titre, accessibilityLabel est obligatoire")
        self.title = title
        self.accessibilityLabel = accessibilityLabel
        self.height = height
        self.maximumFraction = maximumFraction
        self.showsHandle = showsHandle
        self.isDragDismissEnabled = isDragDismissEnabled
        self.closeLabel = closeLabel
        self.surface = surface
        self.outside = outside
        self.scrim = scrim
        self.maxWidth = maxWidth
        self.onDismiss = onDismiss
        self.trailing = trailing()
        self.content = content()
        if case .detents(let parts, let initial) = height {
            _detentIndex = State(initialValue: MeeshyAnchoredSheetMetrics.initialDetentIndex(parts, initial: initial))
        } else {
            _detentIndex = State(initialValue: 0)
        }
    }

    public var body: some View {
        GeometryReader { geo in
            stage(in: geo)
        }
        .onPreferenceChange(MeeshyAnchoredSheetContentHeightKey.self) { measured in
            if contentHeight != measured { contentHeight = measured }
        }
    }

    private func stage(in geo: GeometryProxy) -> some View {
        let layout = MeeshyAnchoredSheetLayout.resolve(
            height: height, content: contentHeight, available: geo.size.height,
            maximumFraction: maximumFraction, detentIndex: detentIndex
        )
        return ZStack(alignment: .bottom) {
            outsideLayer
            sheet(layout: layout, available: geo.size.height)
        }
        .frame(width: geo.size.width, height: geo.size.height, alignment: .bottom)
        .preference(key: MeeshyAnchoredSheetFootprintKey.self, value: footprint(layout: layout, geo: geo))
    }

    private func footprint(layout: MeeshyAnchoredSheetLayout, geo: GeometryProxy) -> MeeshyAnchoredSheetFootprint? {
        if case .content = height, contentHeight == nil { return nil }
        return MeeshyAnchoredSheetFootprint(
            top: MeeshyAnchoredSheetMetrics.restingTop(containerMaxY: geo.frame(in: .global).maxY, height: layout.rest),
            height: layout.rest
        )
    }

    // MARK: Hors de la feuille

    @ViewBuilder
    private var outsideLayer: some View {
        if outside == .dismisses {
            (scrim ? MeeshyColors.mediaBackdrop.opacity(MeeshyAnchoredSheetMetrics.scrimOpacity) : Color.clear)
                .contentShape(Rectangle())
                .onTapGesture(perform: onDismiss)
                .accessibilityHidden(true)
        }
    }

    // MARK: La feuille

    private func sheet(layout: MeeshyAnchoredSheetLayout, available: CGFloat) -> some View {
        let ceiling = MeeshyAnchoredSheetMetrics.ceiling(available: available, maximumFraction: maximumFraction)
        return stack(layout: layout)
            .modifier(MeeshyAnchoredSheetFrame(height: height, layoutHeight: layout.layoutHeight, ceiling: ceiling))
            .frame(maxWidth: maxWidth ?? .infinity)
            .background(alignment: .top) { surfaceShape }
            .modifier(MeeshyAnchoredSheetOffset(restOffset: layout.restOffset, drag: drag))
            .environment(\.meeshySheetClose, onDismiss)
            .modifier(MeeshyAnchoredSheetScheme(forcesDark: surface == .dark))
            .modifier(MeeshyAnchoredSheetAccessibility(
                label: title == nil ? accessibilityLabel : nil, isModal: outside == .dismisses
            ))
            .dismissOnEscape(onDismiss)
    }

    private func stack(layout: MeeshyAnchoredSheetLayout) -> some View {
        VStack(spacing: 0) {
            chrome(layout: layout)
            content
                .frame(maxWidth: .infinity, maxHeight: fillsHeight ? CGFloat.infinity : nil)
                .padding(.bottom, layout.restOffset)
                .animation(nil, value: layout.restOffset)
        }
        .padding(.bottom, MeeshySpacing.xxl)
        .background(
            GeometryReader { proxy in
                Color.clear.preference(key: MeeshyAnchoredSheetContentHeightKey.self, value: proxy.size.height)
            }
        )
    }

    private var fillsHeight: Bool {
        if case .content = height { return false }
        return true
    }

    private var surfaceShape: some View {
        MeeshyAnchoredSheetShape(radius: MeeshyRadius.xxl)
            .fill(surface == .dark ? MeeshyColors.indigo950 : MeeshyColors.backgroundPrimary(isDark: colorScheme == .dark))
            .shadow(
                color: MeeshyColors.mediaBackdrop.opacity(MeeshyAnchoredSheetMetrics.shadowOpacity),
                radius: MeeshyAnchoredSheetMetrics.shadowRadius, x: 0, y: MeeshyAnchoredSheetMetrics.shadowYOffset
            )
            .ignoresSafeArea(.container, edges: .bottom)
    }

    private var ink: Color {
        surface == .dark ? MeeshyColors.onMedia : MeeshyColors.textPrimary(isDark: colorScheme == .dark)
    }

    // MARK: Poignée et en-tête

    private var hasTrailing: Bool { Trailing.self != EmptyView.self }
    private var hasRow: Bool { title != nil || hasTrailing }
    private var showsClose: Bool { hasRow && !hasTrailing && closeLabel != nil }
    private var handleIsShown: Bool { showsHandle && isDragDismissEnabled }

    @ViewBuilder
    private func chrome(layout: MeeshyAnchoredSheetLayout) -> some View {
        if handleIsShown || hasRow {
            VStack(spacing: 0) {
                if handleIsShown { handle(layout: layout) }
                if hasRow { headerRow }
            }
            .contentShape(Rectangle())
            .gesture(dragGesture(layout: layout), including: isDragDismissEnabled ? GestureMask.all : GestureMask.subviews)
        }
    }

    @ViewBuilder
    private func handle(layout: MeeshyAnchoredSheetLayout) -> some View {
        let bar = Capsule()
            .fill(ink.opacity(MeeshyAnchoredSheetMetrics.handleOpacity(surface: surface)))
            .frame(width: MeeshyAnchoredSheetMetrics.handleWidth, height: MeeshyAnchoredSheetMetrics.handleHeight)
            .frame(maxWidth: .infinity)
            .padding(.top, MeeshySpacing.sm)
            .padding(.bottom, MeeshySpacing.md)
        if layout.hasDetents {
            bar
                .accessibilityElement()
                .accessibilityLabel(MeeshyAnchoredSheetCopy.heightLabel)
                .accessibilityValue(layout.index == layout.rests.count - 1
                                    ? MeeshyAnchoredSheetCopy.expanded : MeeshyAnchoredSheetCopy.reduced)
                .accessibilityAdjustableAction { direction in
                    adjust(direction, layout: layout)
                }
        } else {
            bar.accessibilityHidden(true)
        }
    }

    private var headerRow: some View {
        HStack(spacing: MeeshySpacing.md) {
            if let title {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                    .foregroundStyle(ink)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($titleFocused)
            } else {
                Spacer(minLength: 0)
            }
            if hasTrailing {
                trailing
            } else if showsClose, let closeLabel {
                MeeshyGlassButton(systemImage: "xmark", label: closeLabel, kind: .soft, size: .s36,
                                  tone: surface == .dark ? MeeshyGlassTone.deep : MeeshyGlassTone.theme, action: onDismiss)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, handleIsShown ? 0 : MeeshySpacing.sm)
        .padding(.bottom, MeeshySpacing.md)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .onAppear { titleFocused = true }
    }

    // MARK: Gestes

    private func dragGesture(layout: MeeshyAnchoredSheetLayout) -> some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .global)
            .onChanged { value in
                drag.offset = MeeshyAnchoredSheetMetrics.dragOffset(value.translation.height, upwardRoom: layout.restOffset)
            }
            .onEnded { value in
                release(translation: value.translation.height, predictedEnd: value.predictedEndTranslation.height, layout: layout)
            }
    }

    private func release(translation: CGFloat, predictedEnd: CGFloat, layout: MeeshyAnchoredSheetLayout) {
        let settlement = MeeshyAnchoredSheetMetrics.settle(
            translation: translation, predictedEnd: predictedEnd, currentIndex: layout.index, rests: layout.rests
        )
        let motion = MeeshyAnchoredSheetMetrics.motion(reduceMotion: reduceMotion)
        if case .dismiss = settlement { onDismiss() }
        withAnimation(motion.animation) {
            if case .rest(let index) = settlement { detentIndex = index }
            drag.offset = 0
        }
    }

    private func adjust(_ direction: AccessibilityAdjustmentDirection, layout: MeeshyAnchoredSheetLayout) {
        let last = layout.rests.count - 1
        let motion = MeeshyAnchoredSheetMetrics.motion(reduceMotion: reduceMotion)
        switch direction {
        case .increment: withAnimation(motion.animation) { detentIndex = min(last, layout.index + 1) }
        case .decrement: withAnimation(motion.animation) { detentIndex = max(0, layout.index - 1) }
        @unknown default: break
        }
    }
}

public extension MeeshyAnchoredSheet where Trailing == EmptyView {
    init(
        title: String? = nil,
        accessibilityLabel: String? = nil,
        height: MeeshyAnchoredSheetHeight = .content,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction,
        showsHandle: Bool = true,
        isDragDismissEnabled: Bool = true,
        closeLabel: String? = MeeshyAnchoredSheetCopy.close,
        surface: MeeshyAnchoredSheetSurface = .theme,
        outside: MeeshyAnchoredSheetOutside = .dismisses,
        scrim: Bool = false,
        maxWidth: CGFloat? = nil,
        onDismiss: @escaping () -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.init(
            title: title, accessibilityLabel: accessibilityLabel, height: height, maximumFraction: maximumFraction,
            showsHandle: showsHandle, isDragDismissEnabled: isDragDismissEnabled, closeLabel: closeLabel,
            surface: surface, outside: outside, scrim: scrim, maxWidth: maxWidth, onDismiss: onDismiss,
            trailing: { EmptyView() }, content: content
        )
    }
}

// MARK: - Les enveloppes

private struct MeeshyAnchoredSheetFrame: ViewModifier {
    let height: MeeshyAnchoredSheetHeight
    let layoutHeight: CGFloat
    let ceiling: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        if case .content = height {
            content.frame(maxHeight: ceiling, alignment: .top)
        } else {
            content.frame(height: layoutHeight, alignment: .top)
        }
    }
}

private struct MeeshyAnchoredSheetScheme: ViewModifier {
    let forcesDark: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if forcesDark {
            content.environment(\.colorScheme, .dark)
        } else {
            content
        }
    }
}

private struct MeeshyAnchoredSheetAccessibility: ViewModifier {
    let label: String?
    let isModal: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if let label {
            base(content).accessibilityLabel(label)
        } else {
            base(content)
        }
    }

    @ViewBuilder
    private func base(_ content: Content) -> some View {
        if isModal {
            content.accessibilityElement(children: .contain).accessibilityAddTraits(.isModal)
        } else {
            content.accessibilityElement(children: .contain)
        }
    }
}
