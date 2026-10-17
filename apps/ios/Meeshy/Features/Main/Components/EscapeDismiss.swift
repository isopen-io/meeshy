import SwiftUI

/// **Refermer une surimpression maison au clavier.** Une feuille système se ferme à la touche Échap ; un calque posé
/// à la main (menu de message, pièce en gros plan, bulle de statut, menu de scène) ne réagissait qu'au geste
/// d'Échap de VoiceOver. Sur iPad avec un clavier physique, Échap et Cmd+. (`.cancelAction`) le referment aussi.
///
/// Le bouton porteur du raccourci est transparent, sans taille et masqué à l'accessibilité : VoiceOver passe par
/// `accessibilityAction(.escape)`, le clavier par le raccourci — une seule action pour les deux. Disponible dès iOS 14.
struct EscapeDismissModifier: ViewModifier {
    let action: () -> Void

    func body(content: Content) -> some View {
        content
            .accessibilityAction(.escape, action)
            .background {
                Button("", action: action)
                    .keyboardShortcut(.cancelAction)
                    .opacity(0)
                    .frame(width: 0, height: 0)
                    .accessibilityHidden(true)
            }
    }
}

extension View {
    /// Échap (clavier physique, Cmd+.) et le geste d'Échap de VoiceOver referment la surimpression.
    func dismissOnEscape(_ action: @escaping () -> Void) -> some View {
        modifier(EscapeDismissModifier(action: action))
    }
}
