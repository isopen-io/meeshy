import SwiftUI

/// Une option du choix : `id` porte la valeur, `title` le texte affiché,
/// `accessibilityLabel` remplace le titre quand celui-ci est une abréviation.
/// `systemImage` pose un glyphe de tête (évolution K03 du profil, #18869) ;
/// `currentSystemImage` en est la variante pleine, portée par le courant.
public nonisolated struct MeeshySegmentedOption<ID: Hashable & Sendable>: Sendable, Identifiable, Equatable {
    public let id: ID
    public let title: String
    public let accessibilityLabel: String?
    public let systemImage: String?
    public let currentSystemImage: String?

    public init(id: ID, title: String, accessibilityLabel: String? = nil,
                systemImage: String? = nil, currentSystemImage: String? = nil) {
        self.id = id
        self.title = title
        self.accessibilityLabel = accessibilityLabel
        self.systemImage = systemImage
        self.currentSystemImage = currentSystemImage
    }

    /// Le glyphe peint : plein pour le courant quand il existe, contour sinon ; `nil` sans glyphe.
    public func glyph(isCurrent: Bool) -> String? {
        isCurrent ? (currentSystemImage ?? systemImage) : systemImage
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
/// ni verre ni ombre : il se pose dans un hôte opaque ou de verre dense. On choisit
/// en touchant une option OU en glissant sur la piste : la pastille suit le doigt
/// et l'option sous le doigt est choisie au relâcher ; elle voyage en goutte sous
/// le ressort `morph` de K26 (#19606). L'accessibilité garde l'ajustable natif.
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
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    @State private var frames: [Int: CGRect] = [:]
    @State private var dragIndex: Int?
    @State private var drop: MeeshySegmentedDropState
    @State private var dropPhase: Double = 0

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
        let current = MeeshySegmentedLaw.currentIndex(selection: selection.wrappedValue, in: options.map(\.id))
        _drop = State(initialValue: .resting(at: current))
    }

    public var body: some View {
        if MeeshySegmentedLaw.isRenderable(count: options.count) {
            track
        }
    }

    private var currentIndex: Int? {
        MeeshySegmentedLaw.currentIndex(selection: selection.wrappedValue, in: options.map(\.id))
    }

    /// L'option que montre la pastille : celle sous le doigt pendant un glissé, la
    /// sélection sinon.
    private var shownIndex: Int? {
        dragIndex ?? currentIndex
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var track: some View {
        let palette = MeeshySegmentedPalette(tone: tone, isDark: colorScheme == .dark)
        let shown = shownIndex
        return MeeshySegmentedLayout {
            ForEach(Array(MeeshySegmentedLaw.rendered(options).enumerated()), id: \.element.id) { index, option in
                segment(option, index: index, isCurrent: shown == index, palette: palette)
            }
        }
        .background(alignment: .topLeading) { dropPill(fill: palette.pill) }
        .coordinateSpace(name: meeshySegmentedTrackSpace)
        .onPreferenceChange(MeeshySegmentFramesKey.self) { measured in
            if frames != measured { frames = measured }
        }
        .simultaneousGesture(slide, including: isEnabled ? .all : .subviews)
        .adaptiveOnChange(of: shown) { _, next in
            let advanced = drop.advanced(to: next, reduce: reduceMotion)
            meeshyWithMotion(.morph, reduceMotion: reduceMotion) {
                drop = advanced
                dropPhase = Double(advanced.generation)
            }
        }
        .padding(MeeshySpacing.xs)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xl).fill(palette.track))
        .meeshyAnimation(MeeshyAnimation.springFast, value: shown)
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
                glyph: option.glyph(isCurrent: isCurrent),
                ink: isCurrent ? palette.currentInk : palette.restInk
            )
            .equatable()
        }
        .background {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: MeeshySegmentFramesKey.self,
                    value: [index: proxy.frame(in: .named(meeshySegmentedTrackSpace))]
                )
            }
        }
        .buttonStyle(MeeshySegmentButtonStyle(
            forcedPressed: pressed == option.id && !isCurrent,
            fill: palette.pressedFill
        ))
        .accessibilityLabel(option.spokenName)
        .accessibilityAddTraits(currentIndex == index ? .isSelected : [])
    }

    /// La pastille, dessinée une fois sous les segments : elle voyage en goutte de
    /// la face quittée vers la face montrée, et paraît en fondu sous mouvement réduit.
    @ViewBuilder
    private func dropPill(fill: Color) -> some View {
        if let target = drop.to, let to = frames[target] {
            MeeshySegmentedDropShape(
                from: drop.from.flatMap { frames[$0] } ?? to,
                to: to,
                phase: dropPhase,
                generation: drop.generation
            )
            .fill(fill)
            .id(reduceMotion ? drop.generation : 0)
            .transition(.opacity)
            .allowsHitTesting(false)
        }
    }

    /// Le glissé sur la piste : la pastille suit l'option sous le doigt, et le
    /// relâcher la choisit (haptique léger s'il change quelque chose).
    private var slide: some Gesture {
        DragGesture(minimumDistance: MeeshySpacing.sm, coordinateSpace: .named(meeshySegmentedTrackSpace))
            .onChanged { value in
                dragIndex = slideTarget(x: value.location.x)
            }
            .onEnded { value in
                let target = slideTarget(x: value.location.x)
                dragIndex = nil
                if let target { choose(index: target) }
            }
    }

    private func slideTarget(x: CGFloat) -> Int? {
        let measured = options.indices.compactMap { frames[$0] }
        guard isEnabled, measured.count == options.count,
              MeeshySegmentedLaw.isSingleRow(tops: measured.map { Double($0.minY) })
        else { return nil }
        let spans = measured.map { MeeshySegmentedSpan(minX: Double($0.minX), maxX: Double($0.maxX)) }
        return MeeshySegmentedLaw.dragTarget(x: Double(x), spans: spans)
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

/// Le texte d'un segment (la pastille est dessinée par la piste) : une vue
/// feuille, égale à elle-même tant que ses paramètres ne bougent pas. Elle prend
/// la part que la piste lui donne ; le texte ne passe à la ligne que si une
/// option seule dépasse la piste (grande police) : jamais tronqué, jamais débordant.
private struct MeeshySegmentFace: View, Equatable {
    let title: String
    let glyph: String?
    let ink: Color

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            if let glyph {
                Image(systemName: glyph)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .accessibilityHidden(true)
            }
            Text(title)
        }
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
            .foregroundStyle(ink)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.regular, maxHeight: .infinity)
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

/// L'espace de la piste : les étendues des segments, le doigt et la pastille s'y
/// lisent ensemble (le retournement en lecture de droite à gauche les touche tous).
private let meeshySegmentedTrackSpace = "meeshy.segmented.track"

private struct MeeshySegmentFramesKey: PreferenceKey {
    static let defaultValue: [Int: CGRect] = [:]
    static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) {
        value.merge(nextValue()) { _, next in next }
    }
}

/// La goutte : une capsule dont les deux bords suivent `dropSpan` ; seule la
/// phase s'anime, de `generation - 1` à `generation`.
nonisolated private struct MeeshySegmentedDropShape: Shape {
    let from: CGRect
    let to: CGRect
    var phase: Double
    let generation: Int

    var animatableData: Double {
        get { phase }
        set { phase = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let progress = MeeshySegmentedLaw.dropProgress(phase: phase, generation: generation)
        let span = MeeshySegmentedLaw.dropSpan(
            from: MeeshySegmentedSpan(minX: Double(from.minX), maxX: Double(from.maxX)),
            to: MeeshySegmentedSpan(minX: Double(to.minX), maxX: Double(to.maxX)),
            progress: progress
        )
        let settled = CGFloat(min(max(progress, 0), 1))
        let top = from.minY + (to.minY - from.minY) * settled
        let height = from.height + (to.height - from.height) * settled
        let drawn = CGRect(x: CGFloat(span.minX), y: top, width: CGFloat(max(span.width, 0)), height: height)
        return Path(roundedRect: drawn, cornerRadius: min(drawn.height, drawn.width) / 2)
    }
}
