import UIKit

/// Le premier répondant de l'application, trouvé par l'envoi d'une action sans cible : le système la remet
/// au premier répondant, qui se nomme.
@MainActor
enum MeeshyKeyboardDockFirstResponder {
    private static weak var found: UIResponder?

    static func current() -> UIResponder? {
        found = nil
        UIApplication.shared.sendAction(#selector(UIResponder.meeshyKeyboardDockCapture(_:)), to: nil, from: nil, for: nil)
        return found
    }

    static func capture(_ responder: UIResponder) {
        found = responder
    }
}

extension UIResponder {
    @objc fileprivate func meeshyKeyboardDockCapture(_ sender: Any?) {
        MeeshyKeyboardDockFirstResponder.capture(self)
    }
}
