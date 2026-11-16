import SwiftUI

// MARK: - La traction de la bannière (#18721)

/// Tirer la bannière vers le BAS l'ouvre comme un tiroir
/// (`NotificationBannerDrawer`), puis la levée décide — revenir à sa place
/// (annuler) ou devenir la feuille de la conversation (ouvrir).
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

    /// Un lancer vers le bas ouvre même sous le seuil, si la fin PRÉDITE du
    /// geste dépasse deux seuils : la main a dit « ouvre », pas « montre ».
    public static let flingDistance: CGFloat = commitDistance * 2

    /// Le doigt qui repart vers le haut à la levée annule, même au-delà du
    /// seuil : c'est le retour arrière que la traction promet.
    public static let returnSlack: CGFloat = 24

    /// En deçà, ce n'est pas une traction : le tremblement d'un toucher.
    public static let minimumPull: CGFloat = 12

    /// La progression de la traction, dans `[0, 1]` : 1 au seuil d'engagement.
    public static func progress(translation: CGFloat) -> CGFloat {
        min(1, max(0, translation / commitDistance))
    }

    /// La décision à la levée du doigt.
    public static func outcome(translation: CGFloat, predictedEnd: CGFloat) -> Outcome {
        guard translation >= minimumPull else { return .cancel }
        guard predictedEnd >= translation - returnSlack else { return .cancel }
        return translation >= commitDistance || predictedEnd >= flingDistance ? .open : .cancel
    }
}

/// Une traction n'est jamais un toucher. Le bouton de la bannière émet son
/// toucher à la levée du doigt, même après l'avoir traînée — la carte suit le
/// doigt, qui reste donc dans ses bornes. Chaque image d'une traction arme ce
/// verrou ; le toucher qui la suit de près est avalé, un toucher délibéré plus
/// tard repasse.
public nonisolated struct NotificationBannerTapLatch: Equatable, Sendable {
    /// Le délai qui sépare la levée d'une traction du toucher que le bouton
    /// émet derrière elle, avec sa marge.
    public static let window: TimeInterval = 0.6

    private var swallowsUntil: Date?

    public init() {}

    /// Le plafond d'un doigt resté posé sans levée connue (geste annulé par le
    /// système) : le bouton ne reste jamais muet plus longtemps.
    public static let heldCeiling: TimeInterval = 30

    /// Note une image de traction : au-delà du tremblement, dans un sens ou
    /// dans l'autre, le toucher qui suit est avalé — TANT que le doigt reste
    /// posé, même immobile au bout du tiroir ; la fenêtre ne court qu'à la levée.
    public func notingPull(translation: CGFloat, at now: Date) -> NotificationBannerTapLatch {
        guard abs(translation) >= NotificationBannerPull.minimumPull else { return self }
        var latch = self
        latch.swallowsUntil = now.addingTimeInterval(Self.heldCeiling)
        return latch
    }

    /// La levée d'une traction : le toucher que le bouton émet derrière elle
    /// tombe dans la fenêtre. Sans traction notée, rien ne change.
    public func notingRelease(at now: Date) -> NotificationBannerTapLatch {
        guard swallowsUntil != nil else { return self }
        var latch = self
        latch.swallowsUntil = now.addingTimeInterval(Self.window)
        return latch
    }

    public func admitsTap(at now: Date) -> Bool {
        swallowsUntil.map { now >= $0 } ?? true
    }
}

// MARK: - Le tiroir

/// La bannière tirée vers le bas est un TIROIR : son haut reste accroché, son
/// bord bas suit le doigt avec une résistance franche dès le premier point —
/// `d · k / (k + d)`, croissante, bornée par `reach` — et la carte s'élargit
/// vers la largeur de la feuille qu'elle va devenir. Pure : la vue n'en est
/// que la projection, une seule valeur (la traction) la pilote.
public nonisolated enum NotificationBannerDrawer {

    /// La portée du tiroir : il ne s'ouvre jamais au-delà, quelle que soit la
    /// course du doigt.
    public static let reach: CGFloat = 260

    /// De combien le bord bas du tiroir est descendu.
    public static func opening(translation: CGFloat) -> CGFloat {
        guard translation > 0 else { return 0 }
        return translation * reach / (reach + translation)
    }

    /// Le décalage vertical de la carte : vers le haut elle suit le doigt un
    /// pour un (le balayage qui ferme) ; vers le bas son haut reste accroché.
    public static func lift(translation: CGFloat) -> CGFloat {
        min(0, translation)
    }

    /// La marge latérale de la carte, qui se referme à mesure que le tiroir
    /// s'ouvre : au seuil, la carte a la largeur de la feuille.
    public static func sideInset(progress: CGFloat, rest: CGFloat) -> CGFloat {
        rest * (1 - min(1, max(0, progress)))
    }

    /// Au seuil, le tiroir est ARMÉ : relâcher ouvre la feuille.
    public static func isArmed(translation: CGFloat) -> Bool {
        translation >= NotificationBannerPull.commitDistance
    }
}

// MARK: - Le morphisme vers la feuille de la conversation

/// La carte qui devient la feuille de la conversation : son cadre grandit de
/// celui du tiroir relâché jusqu'à celui de la feuille, ses coins passent du
/// rayon de la carte à celui de la feuille, le message s'efface pendant que
/// la face de la conversation se compose, et l'écran derrière s'assombrit
/// jusqu'au voile de la feuille. Pure : l'enveloppe (`BannerToConversationMorph`)
/// n'en est que la projection, interpolée image par image.
public nonisolated enum NotificationBannerMorph {

    /// Le voile que la feuille pose sur l'écran qu'elle recouvre.
    public static let sheetDim: Double = 0.2

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

    /// Le cadre de la feuille : toute la largeur, de son haut jusqu'en bas.
    public static func sheetFrame(container: CGSize, top: CGFloat) -> CGRect {
        CGRect(x: 0, y: top, width: container.width, height: container.height - top)
    }

    /// Le rayon des coins : celui de la carte au départ, celui de la feuille à l'arrivée.
    public static func cornerRadius(progress: CGFloat, from start: CGFloat, to end: CGFloat) -> CGFloat {
        interpolate(start, end, clamped(progress))
    }

    /// Le message s'efface dans la première moitié.
    public static func bodyOpacity(progress: CGFloat) -> Double {
        Double(max(0, 1 - 2 * clamped(progress)))
    }

    /// La face de la conversation se compose dans la seconde moitié : la
    /// carte n'est jamais vide, jamais doublée.
    public static func conversationOpacity(progress: CGFloat) -> Double {
        Double(max(0, 2 * clamped(progress) - 1))
    }

    /// L'écran derrière s'assombrit avec le morphisme, jusqu'au voile de la feuille.
    public static func scrimOpacity(progress: CGFloat) -> Double {
        sheetDim * Double(clamped(progress))
    }

    private static func clamped(_ progress: CGFloat) -> CGFloat { min(1, max(0, progress)) }

    private static func interpolate(_ from: CGFloat, _ to: CGFloat, _ progress: CGFloat) -> CGFloat {
        from + (to - from) * progress
    }
}
