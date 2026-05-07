import Foundation
import SwiftUI

/// Logique pure de cycle de vie pour la revelation d'un message floute.
/// Was: ThemedMessageBubble.scheduleBlurReveal() + revealBlurredContent().
enum BubbleBlurRevealLifecycle {
    /// Phases de la disparition (apres la duree de visibilite).
    enum Phase {
        case fogIn      // Le brouillard apparait
        case blurApply  // Le flou se reapplique derriere le brouillard
        case fogOut     // Le brouillard se dissipe

        var duration: TimeInterval {
            switch self {
            case .fogIn:     return 0.4
            case .blurApply: return 0.4
            case .fogOut:    return 0.5
            }
        }
    }

    /// Duree par defaut de visibilite avant disparition (en secondes).
    static let defaultRevealDuration: TimeInterval = 5

    /// Decrit une demande de revelation. Si `isViewOnce` est vrai,
    /// la revelation doit d'abord consommer le compteur view-once.
    struct RevealRequest {
        let messageId: String
        let isViewOnce: Bool
        var requiresConsume: Bool { isViewOnce }
    }
}

/// Controleur dedie a la revelation d'un contenu floute / view-once.
/// Encapsule la sequence d'animations (visible -> fog-in -> re-blur -> fog-out).
@MainActor
final class BubbleBlurRevealController: ObservableObject {
    @Published private(set) var isRevealed: Bool = false
    @Published private(set) var fogOpacity: CGFloat = 0

    private var revealTask: Task<Void, Never>?
    private var visibilityDuration: TimeInterval = BubbleBlurRevealLifecycle.defaultRevealDuration

    /// Permet a la vue d'injecter une duree provenant des preferences utilisateur.
    func setVisibilityDuration(_ duration: TimeInterval) {
        self.visibilityDuration = duration
    }

    /// Demande la revelation. Pour les messages view-once, le `consumeViewOnce`
    /// est appele d'abord; la revelation ne demarre que si le serveur confirme.
    func requestReveal(
        request: BubbleBlurRevealLifecycle.RevealRequest,
        consumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    ) {
        if request.requiresConsume {
            consumeViewOnce?(request.messageId) { [weak self] success in
                guard let self, success else { return }
                Task { @MainActor in self.scheduleReveal() }
            }
        } else {
            scheduleReveal()
        }
    }

    /// Annule toute revelation en cours et reset l'opacite du brouillard.
    /// Note: ne reset pas `isRevealed` — l'animation finale s'en charge.
    func cancel() {
        revealTask?.cancel()
        revealTask = nil
        fogOpacity = 0
    }

    private func scheduleReveal() {
        fogOpacity = 0
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            isRevealed = true
        }
        revealTask?.cancel()
        revealTask = Task { @MainActor [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .seconds(self.visibilityDuration))
            guard !Task.isCancelled else { return }

            // Phase 1: Fog condensation appears
            withAnimation(.easeIn(duration: BubbleBlurRevealLifecycle.Phase.fogIn.duration)) {
                self.fogOpacity = 1
            }
            try? await Task.sleep(for: .seconds(BubbleBlurRevealLifecycle.Phase.fogIn.duration - 0.05))
            guard !Task.isCancelled else { return }

            // Phase 2: Blur applies behind fog
            withAnimation(.easeOut(duration: BubbleBlurRevealLifecycle.Phase.blurApply.duration)) {
                self.isRevealed = false
            }
            try? await Task.sleep(for: .seconds(BubbleBlurRevealLifecycle.Phase.blurApply.duration + 0.05))
            guard !Task.isCancelled else { return }

            // Phase 3: Fog dissipates
            withAnimation(.easeOut(duration: BubbleBlurRevealLifecycle.Phase.fogOut.duration)) {
                self.fogOpacity = 0
            }
        }
    }
}
