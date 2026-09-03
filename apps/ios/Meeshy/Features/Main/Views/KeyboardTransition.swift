// apps/ios/Meeshy/Features/Main/Views/KeyboardTransition.swift

import UIKit

/// L'animation que le clavier système est en train de jouer — telle qu'il
/// l'annonce LUI-MÊME (#4949).
///
/// `keyboardWillShow` / `keyboardWillHide` arrivent AVANT le mouvement et
/// portent trois faits : la frame d'arrivée, la durée et la courbe. La
/// conversation n'en lisait qu'un — la frame — et jetait les deux autres. Tout
/// ce qui doit bouger AVEC le clavier sans être animé par SwiftUI (la réserve
/// basse du fil, posée en `contentInset` sur une `UICollectionView`) était donc
/// posé en un pas SEC pendant que la barre de composition, elle, glissait sur
/// la courbe système : deux mouvements pour un seul événement, ce que l'œil lit
/// comme un à-coup.
///
/// Value type, et décodage séparé de toute vue : la règle se vérifie sur un
/// `userInfo` synthétique, sans clavier ni fenêtre (doctrine
/// `ConversationView.resolvedComposerHeight`).
struct KeyboardTransition: Equatable {

    /// Durée servie quand la notification n'annonce pas la sienne (clavier
    /// matériel, `userInfo` amputé) : la cote historique d'UIKit.
    static let fallbackDuration: TimeInterval = 0.25

    /// Hauteur occupée par le clavier à la FIN du mouvement — 0 au masquage.
    let height: CGFloat
    let duration: TimeInterval
    let curve: UIView.AnimationOptions

    init(height: CGFloat, duration: TimeInterval, curve: UIView.AnimationOptions) {
        self.height = height
        self.duration = duration
        self.curve = curve
    }

    /// Ce que le clavier vient d'annoncer.
    ///
    /// - Parameters:
    ///   - userInfo: le `userInfo` de la notification reçue.
    ///   - isPresenting: `true` pour `keyboardWillShow`.
    ///
    /// Rend `nil` pour une PRÉSENTATION sans frame d'arrivée : la hauteur y
    /// serait inventée, et une hauteur inventée dégèlerait la mesure du
    /// composeur au pire moment. L'appelant garde alors la transition qu'il
    /// connaît — exactement ce que faisait le `return` sec d'avant.
    ///
    /// Au MASQUAGE la frame annoncée reste celle du clavier PLEIN (il descend,
    /// il ne rétrécit pas) : la hauteur qui nous intéresse y vaut 0, jamais
    /// celle de la frame. La durée et la courbe, elles, sont bien celles de la
    /// descente — c'est tout l'intérêt de lire aussi cette notification-là.
    init?(userInfo: [AnyHashable: Any]?, isPresenting: Bool) {
        if isPresenting {
            guard let frame = userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return nil }
            self.height = frame.height
        } else {
            self.height = 0
        }
        self.duration = (userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double)
            ?? Self.fallbackDuration
        self.curve = Self.animationOptions(
            rawCurve: userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? Int
        )
    }

    /// La courbe annoncée n'est PAS une `UIView.AnimationOptions` : c'est un
    /// `UIView.AnimationCurve` brut, qu'UIKit attend décalé de 16 bits dans le
    /// masque d'options. Le clavier annonce couramment la courbe **7**, privée
    /// et absente de `AnimationCurve` — la transporter telle quelle, sans
    /// tenter de la traduire en cas connu, est ce qui fait que le fil suit
    /// EXACTEMENT la barre plutôt que « à peu près ».
    ///
    /// Une valeur négative retomberait sur `UInt(-1)`, qui piège à l'exécution :
    /// elle rejoint la courbe neutre.
    private static func animationOptions(rawCurve: Int?) -> UIView.AnimationOptions {
        guard let rawCurve, rawCurve >= 0 else { return .curveEaseInOut }
        return UIView.AnimationOptions(rawValue: UInt(rawCurve) << 16)
    }

    /// Projection vers la transition d'inset de la liste : la hauteur ne
    /// traverse pas (le fil ne réserve JAMAIS la place du clavier — SwiftUI
    /// remonte déjà tout le conteneur), seul le TIMING traverse.
    var listInset: ListInsetTransition {
        ListInsetTransition(duration: duration, curve: curve)
    }
}
