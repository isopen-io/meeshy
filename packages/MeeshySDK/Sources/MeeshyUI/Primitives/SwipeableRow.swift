import SwiftUI

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
//
public struct SwipeableRow<Content: View>: View {
    public let content: Content
    public let leadingActions: [SwipeAction]
    public let trailingActions: [SwipeAction]

    @GestureState private var dragOffset: CGFloat = 0
    /// Position d'ouverture persistante (> 0 = leading ouvert, < 0 = trailing ouvert)
    @State private var openOffset: CGFloat = 0

    // Layout
    private let actionWidth: CGFloat = 76
    private let rubberFactor: CGFloat = 0.18
    /// Fraction de la zone d'action à dépasser pour déclencher l'ouverture/fermeture
    private let snapThreshold: CGFloat = 0.35
    private let snapVelocity: CGFloat = 450

    public init(
        leadingActions: [SwipeAction] = [],
        trailingActions: [SwipeAction] = [],
        @ViewBuilder content: () -> Content
    ) {
        self.leadingActions = leadingActions
        self.trailingActions = trailingActions
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

    // MARK: - Body

    public var body: some View {
        ZStack(alignment: .leading) {
            if !leadingActions.isEmpty {
                leadingBackground
            }
            if !trailingActions.isEmpty {
                trailingBackground
            }

            content
                .offset(x: effectiveOffset)
                .gesture(swipeGesture)
                .onTapGesture {
                    if openOffset != 0 { close() }
                }
        }
        .clipped()
        .animation(.spring(response: 0.40, dampingFraction: 0.74), value: dragOffset)
        .animation(.spring(response: 0.40, dampingFraction: 0.74), value: openOffset)
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
                        .font(.system(size: 18, weight: .semibold))
                    Text(action.label)
                        .font(.system(size: 10, weight: .semibold))
                }
                .foregroundColor(.white)
                .scaleEffect(0.4 + 0.6 * progress)
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: progress)
            }
        }
        .frame(width: actionWidth)
        .opacity(min(progress * 2.5, 1.0))
        .buttonStyle(.plain)
    }

    // MARK: - Geste

    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 15)
            .updating($dragOffset) { value, state, _ in
                let h = value.translation.width
                let v = abs(value.translation.height)
                guard abs(h) > v else { return }
                state = h
            }
            .onEnded(handleDragEnd)
    }

    private func handleDragEnd(_ value: DragGesture.Value) {
        let translation = value.translation.width
        let velocity = value.predictedEndTranslation.width - value.translation.width

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
                openOffset = totalLeadingWidth
            } else if openTrailing {
                HapticFeedback.light()
                openOffset = -totalTrailingWidth
            }
            // Sinon : dragOffset revient à 0 → ressort en place

        } else if openOffset > 0 {
            // Leading ouvert : glisser vers la gauche ferme
            if translation < -totalLeadingWidth * snapThreshold ||
               (translation < -10 && velocity < -snapVelocity) {
                HapticFeedback.light()
                openOffset = 0
            }
            // Sinon reste ouvert

        } else {
            // Trailing ouvert : glisser vers la droite ferme
            if translation > totalTrailingWidth * snapThreshold ||
               (translation > 10 && velocity > snapVelocity) {
                HapticFeedback.light()
                openOffset = 0
            }
            // Sinon reste ouvert
        }
    }

    private func close() {
        withAnimation(.spring(response: 0.40, dampingFraction: 0.74)) {
            openOffset = 0
        }
    }
}
