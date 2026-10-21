import UIKit

// MARK: - Le champ de saisie qui a le focus clavier
//
// Extrait de `ConversationView+AttachmentHandlers.swift` (cohésion) : la
// recherche du premier répondant ne lit que la hiérarchie UIKit, jamais l'état
// de la conversation.

enum KeyInputResponderLocator {

    /// Premier répondant de la scène active s'il accepte la saisie clavier.
    ///
    /// La scène passe par `DeviceLayout.activeWindowScene`, jamais par un
    /// parcours de `connectedScenes` fait ici : cet ensemble n'est pas
    /// ordonné, et sous Split View / Slide Over / Stage Manager la scène qui
    /// en sort est régulièrement une scène d'ARRIÈRE-PLAN. Insérer le texte
    /// déposé dans le champ d'une autre fenêtre serait invisible à
    /// l'utilisateur.
    static func current() -> (UIView & UIKeyInput)? {
        guard let scene = DeviceLayout.activeWindowScene else { return nil }
        for window in scene.windows {
            if let responder = firstResponderKeyInput(in: window) { return responder }
        }
        return nil
    }

    private static func firstResponderKeyInput(in view: UIView) -> (UIView & UIKeyInput)? {
        if view.isFirstResponder { return view as? (UIView & UIKeyInput) }
        for subview in view.subviews {
            if let found = firstResponderKeyInput(in: subview) { return found }
        }
        return nil
    }
}
