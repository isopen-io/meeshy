import SwiftUI

// MARK: - La traction de la bannière (#18721)

/// Tirer la bannière vers le BAS la transforme en conversation : la carte suit
/// le doigt, résiste au-delà du seuil, s'élargit et s'étire, puis la levée
/// décide — revenir à sa place (annuler) ou devenir la conversation (ouvrir).
///
/// Pure et sans état : c'est la partie du geste qu'un témoin tient sans vue,
/// et la vue n'en est que la projection. Le balayage vers le HAUT reste la
/// décision de `NotificationBannerSwipe.dismiss`, que cette loi ne touche pas.
public nonisolated enum NotificationBannerPull {

    public enum Outcome: Equatable, Sendable {
        /// Relâchée trop tôt, ou ramenée vers le haut : la carte revient.
        case cancel
        /// Tirée au-delà du seuil, ou lancée franchement : la conversation s'ouvre.
        case open
    }

    /// La traction qui engage l'ouverture : au-delà, relâcher ouvre la conversation.
    public static let commitDistance: CGFloat = 96

    /// La portée de l'élastique au-delà du seuil : la carte ne le dépasse jamais
    /// de plus que cela, quelle que soit la course du doigt.
    public static let elasticReach: CGFloat = 72

    /// Un lancer vers le bas ouvre même sous le seuil, si la fin PRÉDITE du
    /// geste dépasse deux seuils : la main a dit « ouvre », pas « montre ».
    public static let flingDistance: CGFloat = commitDistance * 2

    /// Le doigt qui repart vers le haut à la levée annule, même au-delà du
    /// seuil : c'est le retour arrière que la traction promet.
    public static let returnSlack: CGFloat = 24

    /// En deçà, ce n'est pas une traction : le tremblement d'un toucher.
    public static let minimumPull: CGFloat = 12

    /// Ce que la carte gagne en largeur et en hauteur à pleine traction : elle
    /// s'ouvre déjà vers le cadre de la conversation qu'elle va devenir.
    public static let maximumWiden: CGFloat = 0.05
    public static let maximumStretch: CGFloat = 0.12

    /// Le déplacement vertical de la carte sous le doigt, vers le bas : un pour
    /// un jusqu'au seuil, puis amorti — `d · k / (k + d)` au-delà, croissant et
    /// borné par `commitDistance + elasticReach`.
    public static func elasticOffset(translation: CGFloat) -> CGFloat {
        guard translation > 0 else { return 0 }
        guard translation > commitDistance else { return translation }
        let beyond = translation - commitDistance
        return commitDistance + beyond * elasticReach / (elasticReach + beyond)
    }

    /// Le décalage peint, dans les deux sens : vers le haut la carte suit le
    /// doigt un pour un (le balayage qui ferme), vers le bas elle résiste.
    public static func cardOffset(translation: CGFloat) -> CGFloat {
        translation < 0 ? translation : elasticOffset(translation: translation)
    }

    /// La progression de la traction, dans `[0, 1]` : 1 au seuil d'engagement.
    public static func progress(translation: CGFloat) -> CGFloat {
        min(1, max(0, translation / commitDistance))
    }

    /// L'échelle de la carte à une progression donnée — l'élargissement et
    /// l'étirement grandissent ensemble, jamais au-delà de leur maximum.
    public static func stretch(progress: CGFloat) -> NotificationBannerStretch {
        let clamped = min(1, max(0, progress))
        return NotificationBannerStretch(width: 1 + maximumWiden * clamped, height: 1 + maximumStretch * clamped)
    }

    /// La décision à la levée du doigt.
    public static func outcome(translation: CGFloat, predictedEnd: CGFloat) -> Outcome {
        guard translation >= minimumPull else { return .cancel }
        guard predictedEnd >= translation - returnSlack else { return .cancel }
        return translation >= commitDistance || predictedEnd >= flingDistance ? .open : .cancel
    }
}

/// L'échelle de la carte tirée : une largeur et une hauteur, ensemble.
public nonisolated struct NotificationBannerStretch: Equatable, Sendable {
    public let width: CGFloat
    public let height: CGFloat

    public static let rest = NotificationBannerStretch(width: 1, height: 1)
}

// MARK: - Le morphisme vers la conversation

/// La carte qui devient la conversation : son cadre grandit de celui de la
/// bannière jusqu'à l'écran entier, ses coins s'ouvrent, et la ligne
/// « avatar · nom » glisse vers la place de l'en-tête. Pure : la vue de
/// transition (`BannerToConversationMorph`) n'en est que la projection.
public nonisolated enum NotificationBannerMorph {

    /// Le cadre à une progression donnée, interpolé de `start` à `end`.
    public static func frame(progress: CGFloat, from start: CGRect, to end: CGRect) -> CGRect {
        let p = clamped(progress)
        return CGRect(
            x: interpolate(start.minX, end.minX, p),
            y: interpolate(start.minY, end.minY, p),
            width: interpolate(start.width, end.width, p),
            height: interpolate(start.height, end.height, p)
        )
    }

    /// Le rayon des coins : celui de la carte au départ, droit à l'arrivée.
    public static func cornerRadius(progress: CGFloat, from radius: CGFloat) -> CGFloat {
        interpolate(radius, 0, clamped(progress))
    }

    /// La marge haute de la ligne d'identité dans le cadre : celle de la carte
    /// au départ, celle de l'en-tête de conversation à l'arrivée.
    public static func headerInset(progress: CGFloat, from start: CGFloat, to end: CGFloat) -> CGFloat {
        interpolate(start, end, clamped(progress))
    }

    /// L'aperçu du message s'efface dans la première moitié : à l'arrivée, il
    /// ne reste que l'identité, à la place de l'en-tête qui va la reprendre.
    public static func bodyOpacity(progress: CGFloat) -> Double {
        Double(max(0, 1 - 2 * clamped(progress)))
    }

    private static func clamped(_ progress: CGFloat) -> CGFloat { min(1, max(0, progress)) }

    private static func interpolate(_ from: CGFloat, _ to: CGFloat, _ progress: CGFloat) -> CGFloat {
        from + (to - from) * progress
    }
}

// MARK: - La projection du geste sur la carte

/// La carte sous le doigt : décalée (élastique vers le bas, un pour un vers le
/// haut) et étirée par la progression. Une seule valeur — la traction — pilote
/// tout : aucune animation empilée, la carte EST le geste. Sous « Réduire les
/// animations », elle suit le doigt sans s'étirer.
public struct NotificationBannerPullEffect: ViewModifier {
    let translation: CGFloat
    let reduceMotion: Bool

    public init(translation: CGFloat, reduceMotion: Bool) {
        self.translation = translation
        self.reduceMotion = reduceMotion
    }

    public func body(content: Content) -> some View {
        let stretch = reduceMotion
            ? NotificationBannerStretch.rest
            : NotificationBannerPull.stretch(progress: NotificationBannerPull.progress(translation: translation))
        return content
            .scaleEffect(x: stretch.width, y: stretch.height, anchor: .top)
            .offset(y: NotificationBannerPull.cardOffset(translation: translation))
    }
}
