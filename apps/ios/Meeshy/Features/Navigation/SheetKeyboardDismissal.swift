import UIKit

/// **Une feuille qui monte baisse le clavier** (#16880, il faut cacher le clavier »).
///
/// Toute présentation passe par `UIViewController.present` — `.sheet`,
/// `.fullScreenCover` et `confirmationDialog` de SwiftUI compris. Garder ici
/// plutôt qu'à chaque porte : une feuille ajoutée demain n'a rien à se
/// rappeler. Une ALERTE ne baisse pas le clavier (elle interrompt une saisie
/// sans la clore), et une présentation depuis une fenêtre système (clavier,
/// fenêtres au-dessus de l'app) n'est pas une feuille de l'app.
@MainActor
enum SheetKeyboardPolicy {
    static func dismissesKeyboard(presenting presented: UIViewController, fromWindowLevel level: UIWindow.Level?) -> Bool {
        guard let level, level == .normal else { return false }
        return (presented as? UIAlertController)?.preferredStyle != .alert
    }
}

@MainActor
enum SheetKeyboardDismissal {
    private static var installed = false

    /// Idempotent : un second échange rendrait l'implémentation d'origine.
    static func install() {
        guard !installed else { return }
        guard let original = class_getInstanceMethod(UIViewController.self, #selector(UIViewController.present(_:animated:completion:))),
              let replacement = class_getInstanceMethod(UIViewController.self, #selector(UIViewController.meeshy_presentLoweringKeyboard(_:animated:completion:)))
        else { return }
        method_exchangeImplementations(original, replacement)
        installed = true
    }
}

extension UIViewController {
    /// Après l'échange, `meeshy_presentLoweringKeyboard` appelle l'implémentation
    /// ORIGINALE de `present(_:animated:completion:)`.
    @objc func meeshy_presentLoweringKeyboard(_ presented: UIViewController, animated: Bool, completion: (() -> Void)?) {
        let window = viewIfLoaded?.window
        if SheetKeyboardPolicy.dismissesKeyboard(presenting: presented, fromWindowLevel: window?.windowLevel) {
            window?.endEditing(true)
        }
        meeshy_presentLoweringKeyboard(presented, animated: animated, completion: completion)
    }
}
