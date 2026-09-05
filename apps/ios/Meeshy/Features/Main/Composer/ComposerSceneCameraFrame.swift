import SwiftUI

/// **Le viseur est UNE vue qui GRANDIT — jamais deux vues qui se remplacent.**
///
/// Directive porteur du 2026-09-04 :
///
/// > « Quand je touche `[ ]` ça met trop de temps pour le plein écran, ça doit
/// > aller fluidement agrandir pour le plein écran sans la rangée en bas
/// > d'audience et publier, et avoir ainsi les icônes de réduction, fermeture
/// > accessibles et non au niveau de la barre système. »
///
/// Les trois reproches ont trois causes distinctes, et il faut les séparer pour
/// que le correctif ne traite pas la conséquence à la place de la cause :
///
/// | reproche | cause mesurée |
/// |---|---|
/// | « trop de temps » | DEUX montages du viseur — la carte cessait de peindre, le plein écran en construisait un neuf. Une `AVCaptureVideoPreviewLayer` qui s'attache à une session rend sa première image APRÈS coup : le fondu se jouait donc sur du noir |
/// | « la rangée d'audience et publier » | l'ancien plein écran était un `overlay` de `ComposerSceneSurface`, et le socle est son FRÈRE dans la `VStack` du meuble — un overlay ne couvre jamais son frère |
/// | « au niveau de la barre système » | `ignoresSafeArea()` était posé sur le ZStack ENTIER, chrome compris |
///
/// **Un aperçu qui se remplace ne peut pas être fluide, quelle que soit sa
/// courbe d'animation** : il n'anime pas une géométrie, il anime l'opacité de
/// deux objets dont l'un n'a pas encore d'image. La fluidité ne se règle donc
/// pas en changeant le `response` du ressort — elle s'obtient en n'ayant qu'UN
/// aperçu, dont la seule frame change.
///
/// Ce type porte la géométrie de ce montage unique. Il est pur : il ne connaît
/// ni la session, ni le stage, ni la permission — seulement des rectangles.
nonisolated enum ComposerSceneCameraFrame {

    /// Le rayon de la carte, repris de `ComposerSceneSurface`.
    static let cardRadius: CGFloat = 24

    /// **Le rectangle que le viseur occupe.**
    ///
    /// En carte, c'est le DESSIN de la scène — pas sa frame : le letterbox
    /// n'appartient pas à la scène, et un viseur qui l'occuperait déborderait
    /// sur les couloirs du plateau. En plein écran, c'est tout ce qu'on lui
    /// donne.
    static func rect(card: CGRect,
                     full: CGRect,
                     size: ComposerSceneCameraSize) -> CGRect {
        size == .fullScreen ? full : card
    }

    /// Le rayon des coins, qui suit la même bascule : une carte a des coins, un
    /// plein écran n'en a pas.
    static func radius(for size: ComposerSceneCameraSize) -> CGFloat {
        size == .fullScreen ? 0 : cardRadius
    }

    /// **Ce qu'un glissement vers le BAS produit, image par image.**
    ///
    /// Directive porteur du 2026-09-04 :
    ///
    /// > « Lorsqu'on swipe vers le bas sur la scène avec la caméra activée, ça
    /// > arrête la caméra et remet le fond de la scène simplement. »
    ///
    /// Le geste est PROGRESSIF et ANNULABLE (directive 2026-08-30) : il suit le
    /// doigt et se rétracte si l'on remonte. Ces deux fonctions rendent ce que
    /// la vue peint pendant le geste ; la DÉCISION, elle, est prise à la levée
    /// par `dismisses(translationY:height:)`.
    ///
    /// La course est bornée : au-delà, le viseur ne descend plus — il n'y a
    /// aucune raison de le laisser sortir de l'écran avant que la décision soit
    /// prise, et un objet qui a déjà disparu ne peut plus dire qu'il revient.
    static func dismissOffset(translationY: CGFloat) -> CGFloat {
        guard translationY > 0 else { return 0 }
        return min(translationY, dismissTravel)
    }

    /// L'opacité pendant le geste. Elle ne descend jamais à zéro : un viseur
    /// invisible qui n'est pas encore désarmé mentirait sur son état.
    static func dismissOpacity(translationY: CGFloat) -> Double {
        guard translationY > 0 else { return 1 }
        let progress = min(Double(translationY) / Double(dismissThreshold), 1)
        return 1 - progress * 0.55
    }

    /// **Le seuil de décision, en points.** Il vaut moins que la course : le
    /// geste continue de suivre le doigt après le point de non-retour, et c'est
    /// ce qui le rend lisible — on VOIT qu'on a dépassé.
    static let dismissThreshold: CGFloat = 110
    static let dismissTravel: CGFloat = 180

    /// La levée décide. Le seuil est ABSOLU, pas relatif à la hauteur : le même
    /// geste doit désarmer en carte et en plein écran, et une fraction de
    /// hauteur ferait deux gestes différents pour une seule intention.
    static func dismisses(translationY: CGFloat) -> Bool {
        translationY >= dismissThreshold
    }
}

/// **Le rectangle du DESSIN de la scène, publié vers le meuble.**
///
/// Le viseur est monté par le MEUBLE (pour couvrir le socle, qui est son frère),
/// mais sa place en mode carte est connue de la SURFACE seule. Une préférence
/// d'ancrage est le seul moyen de faire descendre une géométrie sans faire
/// remonter une dépendance : la surface dit « voici où je dessine », le meuble
/// résout ce point dans SON repère, et aucun des deux n'a besoin de connaître la
/// disposition de l'autre.
///
/// Un `CGRect` recopié à la main aurait exigé un repère commun — donc un
/// `coordinateSpace` nommé, donc un accord tacite entre deux fichiers que rien
/// n'aurait vérifié.
struct ComposerSceneCameraFrameKey: PreferenceKey {
    static let defaultValue: Anchor<CGRect>? = nil
    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) {
        value = nextValue() ?? value
    }
}
