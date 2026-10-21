import SwiftUI

// MARK: - Swipe Progress Environment

public struct SwipeProgressKey: EnvironmentKey {
    public static let defaultValue: CGFloat = 0
}

public extension EnvironmentValues {
    var swipeProgress: CGFloat {
        get { self[SwipeProgressKey.self] }
        set { self[SwipeProgressKey.self] = newValue }
    }
}

public struct SwipeAction: Identifiable {
    public let id = UUID()
    public let icon: String
    public let label: String
    public let color: Color
    public let action: () -> Void

    public init(icon: String, label: String, color: Color, action: @escaping () -> Void) {
        self.icon = icon; self.label = label; self.color = color; self.action = action
    }
}

// MARK: - SwipeableRow
//
// Comportement :
// • Swipe pour révéler les actions (seuil d'ouverture : 35 % de la zone d'action)
// • Les actions restent visibles et tapables jusqu'à ce que l'utilisateur re-swipe pour fermer
// • Tap sur l'une des actions → déclenchement + fermeture animée
// • Tap sur le contenu quand ouvert → fermeture
// • Re-swipe dans la direction inverse pour fermer
// • Trois actions au plus par côté ; une seule ligne ouverte à la fois, qui revient
//   en place au toucher ailleurs, au défilement et quand elle quitte l'écran (#10579)
//
public struct SwipeableRow<Content: View>: View {
    public let content: Content
    public let leadingActions: [SwipeAction]
    public let trailingActions: [SwipeAction]

    @GestureState private var dragOffset: CGFloat = 0
    /// Position d'ouverture persistante (> 0 = leading ouvert, < 0 = trailing ouvert)
    @State private var openOffset: CGFloat = 0
    @State private var rowID = UUID()
    private let coordinator: SwipeRowCoordinator

    // Layout
    private let actionWidth: CGFloat = 76
    private let rubberFactor: CGFloat = 0.18
    /// Fraction de la zone d'action à dépasser pour déclencher l'ouverture/fermeture
    private let snapThreshold: CGFloat = 0.35
    private let snapVelocity: CGFloat = 450

    public init(
        leadingActions: [SwipeAction] = [],
        trailingActions: [SwipeAction] = [],
        coordinator: SwipeRowCoordinator = .shared,
        @ViewBuilder content: () -> Content
    ) {
        self.leadingActions = SwipeRowRules.capped(leadingActions)
        self.trailingActions = SwipeRowRules.capped(trailingActions)
        self.coordinator = coordinator
        self.content = content()
    }

    // MARK: - Geometry

    private var totalLeadingWidth: CGFloat { CGFloat(leadingActions.count) * actionWidth }
    private var totalTrailingWidth: CGFloat { CGFloat(trailingActions.count) * actionWidth }

    /// Offset visuel avec rubber-banding au-delà des limites de la zone d'action
    private var effectiveOffset: CGFloat {
        let raw = openOffset + dragOffset
        if raw > 0 {
            guard !leadingActions.isEmpty else { return dragOffset * rubberFactor }
            if raw > totalLeadingWidth {
                return totalLeadingWidth + (raw - totalLeadingWidth) * rubberFactor
            }
        } else if raw < 0 {
            guard !trailingActions.isEmpty else { return dragOffset * rubberFactor }
            let abs = -raw
            if abs > totalTrailingWidth {
                return -(totalTrailingWidth + (abs - totalTrailingWidth) * rubberFactor)
            }
        }
        return raw
    }

    private var leadingReveal: CGFloat { max(0, effectiveOffset) }
    private var trailingReveal: CGFloat { max(0, -effectiveOffset) }

    /// 0 = centered, 1 = fully swiped open (either direction)
    private var swipeProgress: CGFloat {
        let maxWidth = max(totalLeadingWidth, totalTrailingWidth, 1)
        return min(abs(effectiveOffset) / maxWidth, 1.0)
    }

    // MARK: - Body

    public var body: some View {
        ZStack(alignment: .leading) {
            // Render the action cells ONLY while the row is actually being
            // swiped. At rest (`effectiveOffset == 0` — every row during a
            // normal vertical scroll) the buttons were instantiated anyway and
            // merely clipped, costing ~800k `TypedElement<…ButtonStyle…>`
            // allocations across a scroll session (device Allocations trace
            // 2026-06-10). The cells ramp from progress 0 (scale 0.4, opacity
            // 0), so spawning them on the first horizontal drag movement is
            // visually seamless; they're already invisible at offset 0.
            if effectiveOffset > 0 && !leadingActions.isEmpty {
                leadingBackground
            }
            if effectiveOffset < 0 && !trailingActions.isEmpty {
                trailingBackground
            }

            content
                .environment(\.swipeProgress, swipeProgress)
                .offset(x: effectiveOffset)
                // Tap-pour-fermer piloté par GestureMask. L'ancien
                // `.onTapGesture { if openOffset != 0 close() }` était
                // systématiquement court-circuité par le tap du contenu
                // (le geste de l'enfant gagne) : taper une ligne aux actions
                // révélées OUVRAIT la conversation au lieu de refermer.
                // Ouvert → `.gesture` : ce tap est actif et les taps du
                // contenu sont masqués. Fermé → `.subviews` : ce tap est
                // inerte, le contenu reprend ses interactions. Attaché AVANT
                // `simultaneousGesture(swipeGesture)` pour que le masque ne
                // couvre jamais le drag d'ouverture/fermeture.
                .gesture(
                    TapGesture().onEnded { close() },
                    including: openOffset != 0 ? .gesture : .subviews
                )
                .simultaneousGesture(swipeGesture)
        }
        // Rognage HORIZONTAL seulement (#10835) : il masque les fonds d'action
        // qui glissent sous la rangée, jamais ce qu'une rangée dessine au-dessus
        // ou au-dessous de sa hauteur de layout (la rangée en focus de la liste
        // y pose ses chips de catégorie, d'étiquettes, de mode et d'effectif).
        .clipShape(SwipeableRowClip())
        .background { if openOffset != 0 { openFrameReader } }
        .onPreferenceChange(SwipeOpenRowFrameKey.self) { frame in
            MainActor.assumeIsolated { coordinator.rowFrameDidChange(rowID, frame: frame) }
        }
        .onDisappear {
            coordinator.rowDidClose(rowID)
            openOffset = 0
        }
        .animation(.spring(response: 0.40, dampingFraction: 0.74), value: dragOffset)
        .animation(.spring(response: 0.40, dampingFraction: 0.74), value: openOffset)
    }

    private var openFrameReader: some View {
        GeometryReader { proxy in
            Color.clear.preference(key: SwipeOpenRowFrameKey.self, value: proxy.frame(in: .global))
        }
    }

    // MARK: - Fonds d'action

    private var leadingBackground: some View {
        HStack(spacing: 0) {
            ForEach(Array(leadingActions.enumerated()), id: \.element.id) { index, action in
                let localReveal = max(0, leadingReveal - CGFloat(index) * actionWidth)
                let progress = min(localReveal / actionWidth, 1.0)
                actionCell(action, progress: progress) {
                    action.action()
                    close()
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var trailingBackground: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            // Rendu en ordre inversé : trailingActions[0] apparaît le plus à droite
            ForEach(Array(trailingActions.reversed().enumerated()), id: \.element.id) { revIdx, action in
                let origIdx = trailingActions.count - 1 - revIdx
                let localReveal = max(0, trailingReveal - CGFloat(origIdx) * actionWidth)
                let progress = min(localReveal / actionWidth, 1.0)
                actionCell(action, progress: progress) {
                    action.action()
                    close()
                }
            }
        }
    }

    /// Cellule d'action tapable : scale 0.4→1.0 au fil de la révélation
    private func actionCell(_ action: SwipeAction, progress: CGFloat, onTap: @escaping () -> Void) -> some View {
        Button(action: onTap) {
            ZStack {
                action.color
                VStack(spacing: 4) {
                    Image(systemName: action.icon)
                        .font(MeeshyFont.relative(18, weight: .semibold))
                    Text(action.label)
                        .font(MeeshyFont.relative(10, weight: .semibold))
                }
                .foregroundColor(.white)
                .scaleEffect(0.4 + 0.6 * progress)
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: progress)
            }
        }
        .frame(width: actionWidth)
        .opacity(min(progress * 2.5, 1.0))
        .buttonStyle(.plain)
        .accessibilityLabel(action.label)
    }

    // MARK: - Geste

    private var swipeGesture: some Gesture {
        // `minimumDistance: 22` (avant 15) : le scroll vertical du
        // ScrollView parent garde la priorité exclusive tant que le
        // doigt n'a pas parcouru 22pt. Aucun événement n'arrive à ce
        // gesture pendant ce délai, donc le scroll de la liste de
        // conversations démarre immédiatement sans contention. 22pt
        // reste bien en-dessous d'un swipe d'ouverture des actions
        // (~50-80pt), la révélation des leadingActions / trailingActions
        // continue de répondre normalement.
        DragGesture(minimumDistance: 22)
            .updating($dragOffset) { value, state, _ in
                let h = value.translation.width
                let v = abs(value.translation.height)
                guard abs(h) > v else { return }
                state = h
            }
            .onChanged { value in
                guard openOffset != 0, abs(value.translation.height) > abs(value.translation.width) else { return }
                close()
            }
            .onEnded(handleDragEnd)
    }

    private func handleDragEnd(_ value: DragGesture.Value) {
        let translation = value.translation.width
        let velocity = value.predictedEndTranslation.width - value.translation.width

        // Ignore vertical-dominant drags (scroll) — ne pas ouvrir les swipe actions
        guard abs(translation) > abs(value.translation.height) else { return }

        if openOffset == 0 {
            // Fermé : décider d'ouvrir
            let openLeading = !leadingActions.isEmpty && (
                translation > totalLeadingWidth * snapThreshold ||
                (translation > 20 && velocity > snapVelocity)
            )
            let openTrailing = !trailingActions.isEmpty && (
                translation < -totalTrailingWidth * snapThreshold ||
                (translation < -20 && velocity < -snapVelocity)
            )
            if openLeading {
                HapticFeedback.light()
                open(at: totalLeadingWidth)
            } else if openTrailing {
                HapticFeedback.light()
                open(at: -totalTrailingWidth)
            }
            // Sinon : dragOffset revient à 0 → ressort en place

        } else if openOffset > 0 {
            // Leading ouvert : glisser vers la gauche ferme
            if translation < -totalLeadingWidth * snapThreshold ||
               (translation < -10 && velocity < -snapVelocity) {
                HapticFeedback.light()
                coordinator.rowDidClose(rowID)
                openOffset = 0
            }
            // Sinon reste ouvert

        } else {
            // Trailing ouvert : glisser vers la droite ferme
            if translation > totalTrailingWidth * snapThreshold ||
               (translation > 10 && velocity > snapVelocity) {
                HapticFeedback.light()
                coordinator.rowDidClose(rowID)
                openOffset = 0
            }
            // Sinon reste ouvert
        }
    }

    private func open(at offset: CGFloat) {
        openOffset = offset
        coordinator.rowDidOpen(rowID) { close() }
    }

    private func close() {
        coordinator.rowDidClose(rowID)
        withAnimation(.spring(response: 0.40, dampingFraction: 0.74)) {
            openOffset = 0
        }
    }
}

private struct SwipeOpenRowFrameKey: PreferenceKey {
    static let defaultValue: CGRect = .null
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if !next.isNull { value = next }
    }
}

// MARK: - Rognage de la rangée (#10835)

/// Le rectangle de la rangée, prolongé loin au-dessus et au-dessous : il
/// rogne sur l'axe du glissement (les fonds d'action ne débordent pas sur les
/// côtés) et laisse la rangée dessiner hors de sa hauteur de layout.
nonisolated public struct SwipeableRowClip: Shape {
    /// Assez pour toute rangée de liste, quelle que soit la taille de texte.
    static let verticalReach: CGFloat = 10_000

    public init() {}

    public func path(in rect: CGRect) -> Path {
        Path(rect.insetBy(dx: 0, dy: -Self.verticalReach))
    }
}
