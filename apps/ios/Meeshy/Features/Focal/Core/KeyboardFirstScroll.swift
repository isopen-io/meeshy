import UIKit

/// **Le clavier part D'ABORD** (#8000, directive porteur 2026-09-26) —
/// « lorsqu'on défile le texte vers le haut, il faut cacher le clavier
/// systématiquement avant de faire disparaître le reste ».
///
/// Deux lois pures, miroir mot pour mot de
/// `apps/web/src/lib/view/keyboard-first.ts` :
///
/// - `dismissesKeyboard` — clavier ouvert et doigt qui tire vers les messages
///   ANCIENS ⇒ le clavier se ferme. Vers les récents, il reste : on y écrit.
/// - `chromeMayCollapse` — un geste COMMENCÉ clavier ouvert ne replie RIEN
///   d'autre (en-tête, composeur), même une fois le clavier parti : ce premier
///   défilement ne fait que fermer le clavier. Le repli appartient au geste
///   suivant, commencé clavier fermé.
nonisolated enum KeyboardFirstScroll {

    static func dismissesKeyboard(keyboardOpen: Bool, towardOlder: Bool) -> Bool {
        keyboardOpen && towardOlder
    }

    static func chromeMayCollapse(keyboardOpenAtGestureStart: Bool, keyboardOpen: Bool) -> Bool {
        !keyboardOpenAtGestureStart && !keyboardOpen
    }
}

/// L'état que les deux lois lisent, tenu pour le fil : le clavier est-il levé
/// (notifications système), l'était-il au DÉBUT du geste, et d'où le doigt
/// est-il parti.
///
/// Le fil est INVERSÉ (`MessageListViewController`, `transform` y = −1) : un
/// doigt qui tire vers les messages anciens fait CROÎTRE `contentOffset.y`.
///
/// Le mécanisme système `keyboardDismissMode = .interactive` reste en place :
/// un doigt qui atteint le clavier l'emmène image par image. Cette porte
/// ajoute le « systématiquement » — un défilement vers les anciens qui
/// n'atteint pas le clavier le ferme aussi, sur l'animation système.
final class KeyboardFirstScrollGate: NSObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free au démontage hors d'une tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    private(set) var isKeyboardVisible = false
    private var keyboardOpenAtGestureStart = false
    private var gestureStartOffsetY: CGFloat = 0
    private let dismissKeyboard: () -> Void

    init(
        notificationCenter: NotificationCenter = .default,
        dismissKeyboard: @escaping () -> Void = {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
    ) {
        self.dismissKeyboard = dismissKeyboard
        super.init()
        notificationCenter.addObserver(self, selector: #selector(keyboardWillShow), name: UIResponder.keyboardWillShowNotification, object: nil)
        notificationCenter.addObserver(self, selector: #selector(keyboardWillHide), name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillShow() { isKeyboardVisible = true }
    @objc private func keyboardWillHide() { isKeyboardVisible = false }

    /// Le doigt se pose sur le fil (`scrollViewWillBeginDragging`).
    func gestureBegan(offsetY: CGFloat) {
        keyboardOpenAtGestureStart = isKeyboardVisible
        gestureStartOffsetY = offsetY
    }

    /// Une image de défilement (`scrollViewDidScroll`) : sous le doigt et vers
    /// les anciens, clavier levé ⇒ le clavier se ferme, une seule fois.
    func noteScroll(offsetY: CGFloat, isTracking: Bool) {
        guard isTracking,
              KeyboardFirstScroll.dismissesKeyboard(
                keyboardOpen: isKeyboardVisible,
                towardOlder: offsetY > gestureStartOffsetY
              )
        else { return }
        isKeyboardVisible = false
        dismissKeyboard()
    }

    /// Le chrome peut-il se replier pour ce geste ?
    var chromeMayCollapse: Bool {
        KeyboardFirstScroll.chromeMayCollapse(
            keyboardOpenAtGestureStart: keyboardOpenAtGestureStart,
            keyboardOpen: isKeyboardVisible
        )
    }
}
