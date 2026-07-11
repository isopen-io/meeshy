import CoreGraphics

/// Outcome d'un geste vertical relâché sur le menu long-press (Menu 1).
enum MessageOverlayDragOutcome: Equatable {
    /// Swipe-up fort → ouvre la feuille « Plus… » (Menu 2).
    case openMore
    /// Swipe-down fort → ferme l'overlay.
    case dismiss
    /// Geste insuffisant → retour spring à la position de repos.
    case snapBack
}

/// Loi pure du geste vertical du menu long-press — source unique de vérité
/// pour « que fait ce drag ». Aucune dépendance UI ; testée exhaustivement
/// dans `MessageOverlayDragLawTests`.
///
/// Plages disjointes par construction : chaque outcome directionnel exige un
/// signe strict de `translation`, la vélocité (via `predicted`) ne compte que
/// dans la direction du drag. Le cas croisé « drag up au-delà du seuil puis
/// fling down au relâchement » retombe sur la règle position (`.openMore`) —
/// l'annulation passe par le slide-off (revenir sous le seuil avant de
/// relâcher).
enum MessageOverlayDragLaw {
    static let openMoreThreshold: CGFloat = -80
    static let dismissThreshold: CGFloat = 80
    /// La translation prédite (position + vélocité projetée) compte double.
    private static let predictionFactor: CGFloat = 2
    /// Suivi du doigt au-delà du seuil : butée élastique amortie.
    private static let overshootDamping: CGFloat = 0.3

    static func outcome(translation: CGFloat, predicted: CGFloat) -> MessageOverlayDragOutcome {
        let openMorePredicted = openMoreThreshold * predictionFactor
        let dismissPredicted = dismissThreshold * predictionFactor
        if translation <= openMoreThreshold || (predicted <= openMorePredicted && translation < 0) {
            return .openMore
        }
        if translation >= dismissThreshold || (predicted >= dismissPredicted && translation > 0) {
            return .dismiss
        }
        return .snapBack
    }

    static func displayOffset(for translation: CGFloat) -> CGFloat {
        if translation < openMoreThreshold {
            return openMoreThreshold + (translation - openMoreThreshold) * overshootDamping
        }
        if translation > dismissThreshold {
            return dismissThreshold + (translation - dismissThreshold) * overshootDamping
        }
        return translation
    }

    static func isArmed(translation: CGFloat) -> Bool {
        translation <= openMoreThreshold
    }
}
