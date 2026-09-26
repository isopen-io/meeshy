import Foundation
import Combine

/// « Le calque d'onboarding est-il à l'écran ? » — publié par `OnboardingHost`,
/// lu par ceux qui ne doivent pas le recouvrir : la célébration plein écran
/// (#7914). Un signal, pas le modèle : ceux qui l'écoutent n'ont rien à savoir
/// du parcours.
@MainActor
final class OnboardingPresenceSignal: ObservableObject {
    nonisolated deinit {}

    static let shared = OnboardingPresenceSignal()

    @Published private(set) var isPresented = false

    func update(isPresented: Bool) {
        guard self.isPresented != isPresented else { return }
        self.isPresented = isPresented
    }
}
