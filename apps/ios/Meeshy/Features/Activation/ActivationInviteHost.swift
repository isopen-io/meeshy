import SwiftUI
import Combine
import MeeshySDK

/// Pose « Validez votre compte » (#8239) sur une racine. L'utilisateur courant
/// porte l'état d'activation servi (connexion, `/auth/me` au lancement et au
/// retour au premier plan) : chaque émission est remise au modèle, qui décide.
/// L'onboarding passe d'abord — deux présentations plein écran ne se
/// superposent pas (`OnboardingPresenceSignal`).
///
/// La feuille ne se présente plus depuis la racine (#14046) : elle vit dans sa
/// fenêtre (`ActivationInvitePresenter`), par-dessus le composer, les
/// visionneuses et les feuilles déjà ouvertes.
struct ActivationInviteHost: ViewModifier {
    @StateObject private var model = ActivationInviteViewModel()
    @State private var presenter = ActivationInvitePresenter()

    func body(content: Content) -> some View {
        content
            .onReceive(Publishers.CombineLatest(AuthManager.shared.$currentUser, OnboardingPresenceSignal.shared.$isPresented)
                .receive(on: DispatchQueue.main)) { user, onboarding in
                guard !onboarding else { return }
                model.userChanged(user)
            }
            .onReceive(model.$isPresented.removeDuplicates().receive(on: DispatchQueue.main)) { isPresented in
                presenter.apply(model: model, isPresented: isPresented)
            }
            .onReceive(NotificationCenter.default.publisher(for: UIScene.didActivateNotification)) { _ in
                presenter.retryPendingShow(model: model)
            }
    }
}

extension View {
    /// UNE ligne, des deux côtés (iPhone et iPad).
    func activationInviteHost() -> some View {
        modifier(ActivationInviteHost())
    }
}
