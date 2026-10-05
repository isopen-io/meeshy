import SwiftUI
import Combine
import MeeshySDK

/// Pose « Validez votre compte » (#8239) sur une racine. L'utilisateur courant
/// porte l'état d'activation servi (connexion, `/auth/me` au lancement et au
/// retour au premier plan) : chaque émission est remise au modèle, qui décide.
/// L'onboarding passe d'abord — deux présentations plein écran ne se
/// superposent pas (`OnboardingPresenceSignal`).
struct ActivationInviteHost: ViewModifier {
    @StateObject private var model = ActivationInviteViewModel()

    func body(content: Content) -> some View {
        content
            .onReceive(Publishers.CombineLatest(AuthManager.shared.$currentUser, OnboardingPresenceSignal.shared.$isPresented)
                .receive(on: DispatchQueue.main)) { user, onboarding in
                guard !onboarding else { return }
                model.userChanged(user)
            }
            .sheet(isPresented: $model.isPresented) {
                ActivationInviteView(model: model)
            }
    }
}

extension View {
    /// UNE ligne, des deux côtés (iPhone et iPad).
    func activationInviteHost() -> some View {
        modifier(ActivationInviteHost())
    }
}
