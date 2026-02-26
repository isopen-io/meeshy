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
// • Les actions apparaissent PAR DERRIÈRE le contenu qui glisse (fond opaque, sans transparence)
// • Pull complet (≥ 100 %) → déclenchement : l'item reste ouvert ~350 ms puis revient élastiquement
// • Swipe très rapide (≥ 85 % + 700 pts/s) → déclenchement identique
// • À plein déploiement, la première action grossit pour signaler qu'elle est armée
// • Pas d'état "ouvert" persistant
//
public struct SwipeableRow<Content: View>: View {
    public let content: Content
    public let leadingActions: [SwipeAction]
    public let trailingActions: [SwipeAction]

    @GestureState private var dragOffset: CGFloat = 0
    // Maintient la position ouverte le temps que l'utilisateur voie l'action sélectionnée
    @State private var firedOffset: CGFloat = 0
    @State private var holdTask: Task<Void, Never>? = nil

    // Layout
    private let actionWidth: CGFloat = 76
    // Résistance élastique au-delà de la zone d'action
    private let rubberFactor: CGFloat = 0.18
    // Seuil de vélocité pour le déclenchement rapide (nécessite aussi ≥ 85 % de pull)
    private let triggerVelocity: CGFloat = 700

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

    /// Drag actif prioritaire sur le hold post-déclenchement
    private var effectiveDrag: CGFloat { dragOffset != 0 ? dragOffset : firedOffset }

    /// Offset élastique : suit le doigt dans la zone, puis résistance progressive au-delà.
    private var elasticOffset: CGFloat {
        let raw = effectiveDrag
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
            // Fond gauche – actions leading
            if !leadingActions.isEmpty {
                leadingBackground
            }

            // Fond droit – actions trailing
            if !trailingActions.isEmpty {
                trailingBackground
            }

            // Contenu principal – glisse par-dessus les fonds d'action
            content
                .offset(x: elasticOffset)
                .gesture(swipeGesture)
        }
        .clipped()
        // Animation déclenchée par le drag en cours
        .animation(.spring(response: 0.46, dampingFraction: 0.64, blendDuration: 0.06), value: dragOffset)
        // Animation déclenchée par le hold post-déclenchement (retour après 350 ms)
        .animation(.spring(response: 0.46, dampingFraction: 0.64, blendDuration: 0.06), value: firedOffset)
    }

    // MARK: - Fonds d'action

    private var leadingBackground: some View {
        let isArmed = leadingReveal >= totalLeadingWidth
        return HStack(spacing: 0) {
            ForEach(Array(leadingActions.enumerated()), id: \.element.id) { index, action in
                let localReveal = max(0, leadingReveal - CGFloat(index) * actionWidth)
                let progress = min(localReveal / actionWidth, 1.0)
                actionCell(action, progress: progress, isArmed: index == 0 && isArmed)
            }
            Spacer(minLength: 0)
        }
    }

    private var trailingBackground: some View {
        let isArmed = trailingReveal >= totalTrailingWidth
        return HStack(spacing: 0) {
            Spacer(minLength: 0)
            // Rendu en ordre inversé : trailingActions[0] apparaît le plus à droite
            ForEach(Array(trailingActions.reversed().enumerated()), id: \.element.id) { revIdx, action in
                let origIdx = trailingActions.count - 1 - revIdx
                let localReveal = max(0, trailingReveal - CGFloat(origIdx) * actionWidth)
                let progress = min(localReveal / actionWidth, 1.0)
                actionCell(action, progress: progress, isArmed: origIdx == 0 && isArmed)
            }
        }
    }

    /// Cellule d'action : grandit progressivement, grossit quand armée (prête à déclencher).
    private func actionCell(_ action: SwipeAction, progress: CGFloat, isArmed: Bool = false) -> some View {
        ZStack {
            action.color
            VStack(spacing: 4) {
                Image(systemName: action.icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(action.label)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundColor(.white)
            // 0.4x → 1.0x au fil de la révélation ; 1.25x quand armée
            .scaleEffect(isArmed ? 1.25 : (0.4 + 0.6 * progress))
            .animation(.spring(response: 0.25, dampingFraction: 0.58), value: isArmed)
        }
        .frame(width: actionWidth)
        // Invisible au repos, visible rapidement dès le début du swipe
        .opacity(min(progress * 2.5, 1.0))
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
        let velocity = value.predictedEndTranslation.width - value.translation.width

        // Déclenchement au pull complet OU swipe très rapide avec pull ≥ 85 %
        let leadingFired = !leadingActions.isEmpty && (
            translation >= totalLeadingWidth ||
            (translation >= totalLeadingWidth * 0.85 && velocity > triggerVelocity)
        )
        let trailingFired = !trailingActions.isEmpty && (
            translation <= -totalTrailingWidth ||
            (translation <= -totalTrailingWidth * 0.85 && velocity < -triggerVelocity)
        )

        // Annule un éventuel hold précédent avant d'en démarrer un nouveau
        holdTask?.cancel()

        if leadingFired {
            // Reste ouvert côté gauche le temps de confirmer visuellement
            firedOffset = totalLeadingWidth
            HapticFeedback.success()
            holdTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 350_000_000)
                guard !Task.isCancelled else { return }
                firedOffset = 0
                leadingActions[0].action()
            }
        } else if trailingFired {
            // Reste ouvert côté droit
            firedOffset = -totalTrailingWidth
            HapticFeedback.success()
            holdTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 350_000_000)
                guard !Task.isCancelled else { return }
                firedOffset = 0
                trailingActions[0].action()
            }
        } else {
            // Annule tout hold en cours et revient en place
            firedOffset = 0
            if abs(translation) > 12 {
                HapticFeedback.light()
            }
        }
        // dragOffset revient à 0 automatiquement via @GestureState
    }
}
