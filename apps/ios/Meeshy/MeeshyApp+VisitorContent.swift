import SwiftUI
import MeeshySDK

// MARK: - Le contenu d'un lien ouvert sans session (#9171)

/// L'écran visiteur, présenté AU-DESSUS de `LoginView` quand un lien
/// universel de publication ou de réel arrive sans session.
///
/// Il ne consomme rien : `pendingDeepLink` reste en attente, et la racine
/// connectée l'ouvre après la connexion. « Créer un compte » et « Se
/// connecter » le referment, puis l'écran de compte s'ouvre derrière lui
/// (`VisitorContentPresenter.didDismiss`).
struct VisitorContentCover: ViewModifier {
    @ObservedObject var presenter: VisitorContentPresenter
    let isEligible: Bool
    var loader: VisitorContentProviding = VisitorContentLoader()

    func body(content: Content) -> some View {
        content.fullScreenCover(
            isPresented: .init(
                get: { presenter.request != nil && isEligible },
                set: { if !$0 { presenter.dismiss() } }
            ),
            onDismiss: { presenter.didDismiss() }
        ) {
            if let request = presenter.request {
                VisitorContentView(
                    request: request,
                    loader: loader,
                    onAccount: { presenter.requestAccount($0) },
                    onClose: { presenter.dismiss() }
                )
                .id(request.id)
            }
        }
    }
}

extension View {
    /// `isEligible` : aucune session, et rien d'autre ne couvre la racine.
    func visitorContentCover(presenter: VisitorContentPresenter, isEligible: Bool) -> some View {
        modifier(VisitorContentCover(presenter: presenter, isEligible: isEligible))
    }
}
