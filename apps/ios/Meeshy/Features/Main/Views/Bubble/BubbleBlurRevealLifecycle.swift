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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var isRevealed: Bool = false
    @Published private(set) var fogOpacity: CGFloat = 0

    private var revealTask: Task<Void, Never>?
    private var visibilityDuration: TimeInterval = BubbleBlurRevealLifecycle.defaultRevealDuration

    /// Permet a la vue d'injecter une duree provenant des preferences utilisateur.
    func setVisibilityDuration(_ duration: TimeInterval) {
        self.visibilityDuration = duration
    }

    /// Demande la révélation.
    ///
    /// **Une vue unique se révèle et RESTE lisible** (#7500) : elle ne
    /// re-disparaît pas au bout de la durée de visibilité, parce que sa
    /// disparition n'est pas une affaire de secondes — c'est la SORTIE de la
    /// conversation qui la consomme. La relire le temps de la comprendre est
    /// exactement ce que la directive demande.
    ///
    /// Le flou, lui, garde son va-et-vient : on révèle, on regarde, ça se
    /// referme — rien n'est consommé, on peut recommencer.
    ///
    /// `consumeViewOnce` reste le canal, mais il ne DÉTRUIT plus ici : l'hôte
    /// s'en sert pour ARMER la consommation et confirme aussitôt, puis
    /// consomme quand on quitte. La révélation ne dépend donc plus d'un
    /// aller-retour serveur — elle dépendait de lui pour afficher ce que ce
    /// même aller-retour venait de détruire.
    func requestReveal(
        request: BubbleBlurRevealLifecycle.RevealRequest,
        consumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    ) {
        guard request.requiresConsume else {
            scheduleReveal()
            return
        }
        consumeViewOnce?(request.messageId) { [weak self] success in
            guard let self, success else { return }
            Task { @MainActor in self.revealUntilLeaving() }
        }
    }

    /// Révèle SANS programmer la disparition : ce contenu restera lisible tant
    /// qu'on est dans la conversation.
    private func revealUntilLeaving() {
        revealTask?.cancel()
        revealTask = nil
        fogOpacity = 0
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            isRevealed = true
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

/// Gate le blur+mask sur le fait que la bulle soit floutable. Voir l'appel
/// dans `BubbleStandardLayout.contentStack` pour le rationale (perf GPU au
/// scroll). Sorti de `BubbleStandardLayout.swift`, hors budget de taille (#8009).
struct BlurRevealModifier: ViewModifier {
    let isBlurrable: Bool
    let shouldBlur: Bool
    func body(content: Content) -> some View {
        if isBlurrable {
            content
                .blur(radius: shouldBlur ? 20 : 0)
                .mask(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .blur(radius: shouldBlur ? 5 : 0)
                )
        } else {
            content
        }
    }
}
