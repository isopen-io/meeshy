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
// • Les actions apparaissent PAR DERRIÈRE le contenu qui glisse (fond solide, sans transparence)
// • Le contenu revient TOUJOURS à sa position initiale après relâchement (élastique)
// • Swipe rapide ou ample → déclenche la première action, retour immédiat
// • Pas d'état "ouvert" persistant
//
public struct SwipeableRow<Content: View>: View {
    public let content: Content
    public let leadingActions: [SwipeAction]
    public let trailingActions: [SwipeAction]

    @GestureState private var dragOffset: CGFloat = 0

    // Layout
    private let actionWidth: CGFloat = 76
    // Résistance élastique au-delà de la zone d'action (1 = aucune résistance, 0 = bloqué)
    private let rubberFactor: CGFloat = 0.18
    // Seuil de vitesse pour déclencher l'action sur swipe rapide (pts/s)
    private let triggerVelocity: CGFloat = 380
    // Ratio de la zone d'action à dépasser pour déclencher (0–1)
    private let triggerRatio: CGFloat = 0.62

    public init(
        leadingActions: [SwipeAction] = [],
        trailingActions: [SwipeAction] = [],
        @ViewBuilder content: () -> Content
    ) {
        self.leadingActions = leadingActions
        self.trailingActions = trailingActions
        self.content = content()
    }

    // MARK: - Computed geometry

    private var totalLeadingWidth: CGFloat { CGFloat(leadingActions.count) * actionWidth }
    private var totalTrailingWidth: CGFloat { CGFloat(trailingActions.count) * actionWidth }

    /// Offset élastique : suit le doigt fidèlement dans la zone d'action,
    /// puis applique une résistance progressive au-delà.
    private var elasticOffset: CGFloat {
        let raw = dragOffset
        if raw > 0 {
            guard !leadingActions.isEmpty else { return raw * rubberFactor }
            if raw > totalLeadingWidth {
                return totalLeadingWidth + (raw - totalLeadingWidth) * rubberFactor
            }
        } else if raw < 0 {
            guard !trailingActions.isEmpty else { return raw * rubberFactor }
            let abs = -raw
            if abs > totalTrailingWidth {
                return -(totalTrailingWidth + (abs - totalTrailingWidth) * rubberFactor)
            }
        }
        return raw
    }

    // Pixels révélés de chaque côté
    private var leadingReveal: CGFloat { max(0, elasticOffset) }
    private var trailingReveal: CGFloat { max(0, -elasticOffset) }

    // MARK: - Body

    public var body: some View {
        ZStack(alignment: .leading) {
            // Fond gauche – actions leading (révélées par glissement vers la droite)
            if !leadingActions.isEmpty {
                leadingBackground
            }

            // Fond droit – actions trailing (révélées par glissement vers la gauche)
            if !trailingActions.isEmpty {
                trailingBackground
            }

            // Contenu principal opaque – glisse par-dessus les fonds d'action
            content
                .offset(x: elasticOffset)
                .gesture(swipeGesture)
        }
        .clipped()
        // L'animation spring se déclenche quand dragOffset revient à 0 (fin du geste)
        .animation(
            .spring(response: 0.46, dampingFraction: 0.64, blendDuration: 0.06),
            value: dragOffset
        )
    }

    // MARK: - Fonds d'action

    private var leadingBackground: some View {
        HStack(spacing: 0) {
            ForEach(Array(leadingActions.enumerated()), id: \.element.id) { index, action in
                // Chaque action s'anime indépendamment selon sa progression locale
                let localReveal = max(0, leadingReveal - CGFloat(index) * actionWidth)
                let progress = min(localReveal / actionWidth, 1.0)
                actionCell(action, progress: progress)
            }
            Spacer(minLength: 0)
        }
    }

    private var trailingBackground: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            ForEach(Array(trailingActions.enumerated()), id: \.element.id) { index, action in
                let localReveal = max(0, trailingReveal - CGFloat(index) * actionWidth)
                let progress = min(localReveal / actionWidth, 1.0)
                actionCell(action, progress: progress)
            }
        }
    }

    /// Cellule d'action : couleur pleine + icône qui grandit au fur et à mesure de la révélation.
    private func actionCell(_ action: SwipeAction, progress: CGFloat) -> some View {
        ZStack {
            action.color
            VStack(spacing: 4) {
                Image(systemName: action.icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(action.label)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundColor(.white)
            // Grossit progressivement au fil de la révélation (0.4x → 1x)
            .scaleEffect(0.4 + 0.6 * progress)
        }
        .frame(width: actionWidth)
    }

    // MARK: - Geste

    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 15)
            .updating($dragOffset) { value, state, _ in
                let h = value.translation.width
                let v = abs(value.translation.height)
                // N'active le swipe horizontal que si le geste est clairement horizontal
                guard abs(h) > v else { return }
                state = h
            }
            .onEnded(handleDragEnd)
    }

    private func handleDragEnd(_ value: DragGesture.Value) {
        let translation = value.translation.width
        // Vélocité prédite : différence entre position prédite et position actuelle
        let velocity = value.predictedEndTranslation.width - value.translation.width

        let leadingFired = !leadingActions.isEmpty && (
            translation > totalLeadingWidth * triggerRatio ||
            (translation > 20 && velocity > triggerVelocity)
        )
        let trailingFired = !trailingActions.isEmpty && (
            translation < -totalTrailingWidth * triggerRatio ||
            (translation < -20 && velocity < -triggerVelocity)
        )

        if leadingFired {
            leadingActions[0].action()
            HapticFeedback.success()
        } else if trailingFired {
            trailingActions[0].action()
            HapticFeedback.success()
        } else if abs(translation) > 12 {
            // Léger retour haptique même sans déclenchement d'action
            HapticFeedback.light()
        }
        // dragOffset revient à 0 automatiquement via @GestureState
        // → l'animation .spring() ci-dessus produit le retour élastique
    }
}
