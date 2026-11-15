import SwiftUI

// MARK: - Le sens de LECTURE d'un glissement

/// **SwiftUI retourne les piles, pas le SIGNE d'un glissement.**
///
/// `DragGesture.translation.width` est un déplacement à l'ÉCRAN : il ne sait pas
/// dans quel sens on lit. Un site qui écrit « `dx < -60` ⇒ story suivante » dit en
/// réalité « glisser vers la GAUCHE avance » — vrai en français, **faux en arabe**,
/// où avancer se fait vers la droite.
///
/// C'est la troisième famille de défauts RTL du dépôt, après les piles (que SwiftUI
/// retourne seul) et les symboles nommés par un côté physique (que
/// `RightToLeftLayoutGuardTests` garde). Elle est aussi silencieuse que la
/// deuxième : rien ne casse, rien ne rougit, la navigation part simplement à
/// l'envers pour un lecteur arabophone.
///
/// ### Ce qui NE doit PAS se retourner
///
/// Un objet que l'utilisateur DÉPLACE à la main suit son doigt dans toutes les
/// langues : la pastille d'appel jetée vers la droite part vers la droite, le pan
/// d'une image zoomée suit le geste, une bulle flottante se pose où on la lâche.
/// Sur les 25 comparaisons de `translation.width` du dépôt, **7 sont de ce type et
/// restent délibérément brutes** ; 9 autres n'encodent aucun sens (`abs()`, ou
/// dominance d'axe `abs(dx) > abs(dy)`).
///
/// Ne consomment ce helper que les gestes de NAVIGATION — ceux dont le sens dit
/// « suivant » ou « précédent », et qu'Instagram, WhatsApp et Messages retournent
/// tous en arabe.
enum ReadingDirection {

    /// Le déplacement horizontal exprimé dans le sens de la LECTURE : négatif vers
    /// l'« avant » du fil, positif vers l'« arrière », quelle que soit la langue.
    ///
    /// **En `leftToRight`, c'est l'IDENTITÉ** — et c'est toute la sûreté du
    /// correctif : les sites d'appel gardent leurs comparaisons (`dx < -60`,
    /// `width > 70`) et ne voient qu'un opérande changer. Le comportement actuel,
    /// celui de la quasi-totalité des sessions, est donc préservé par construction
    /// plutôt que par vérification.
    static func readingDelta(
        _ translationWidth: CGFloat,
        layoutDirection: LayoutDirection
    ) -> CGFloat {
        // `0 - x` plutôt que `-x` : `-0.0` n'est pas `0.0` pour une comparaison
        // d'égalité stricte, et un glissement nul n'a pas de sens de lecture.
        layoutDirection == .rightToLeft ? 0 - translationWidth : translationWidth
    }
}
