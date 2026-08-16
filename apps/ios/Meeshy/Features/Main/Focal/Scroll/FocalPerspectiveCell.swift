import UIKit

/// La cellule qui **repose elle-même** sa perspective après chaque application
/// d'attributs de layout.
///
/// ## Pourquoi ce type existe (mesuré, pas déduit)
///
/// `UICollectionReusableView.apply(_:)` réécrit `layer.transform` depuis
/// `layoutAttributes.transform3D` (identité) et `alpha` depuis
/// `layoutAttributes.alpha` (1). `FocalScrollPass` le documentait déjà, et y
/// répondait par ses SIX sites d'appel : reposer la perspective après chaque
/// événement connu qui provoque une application d'attributs.
///
/// **Cette réponse perd la course.** Les rangées de `FocalRow` s'auto-mesurent
/// (`.estimated`), et une mesure SwiftUI en invalide une autre : la collection
/// ré-applique alors ses attributs à CHAQUE frame, en fin de `layoutSubviews`,
/// c'est-à-dire APRÈS le `scrollViewDidScroll` de la même frame. Le pass écrit,
/// UIKit efface, et rien ne le repose avant la frame suivante — où le cycle
/// recommence tant que la cascade de mesure dure.
///
/// Constaté au ralenti sur un enregistrement d'écran de 6,0 s (361 frames à
/// 60 Hz, `RPReplay_Final1786908248.MOV`) : **36 frames (10,0 %) rendues sans
/// perspective**, en 9 fenêtres, dont deux de 200 ms et 167 ms. Sur ces
/// fenêtres, les messages du haut de l'écran passent d'un coup de l'échelle
/// réduite à l'échelle 1 en pleine opacité, puis reviennent — ce sont
/// exactement les « sauts de grandissement » du rapport. Le contenu, lui, ne
/// bouge pas : un transform de `CALayer` est un effet de RENDU, ce qui confirme
/// que seule la perspective était effacée, jamais le layout.
///
/// Ajouter un septième site d'appel ne pouvait pas suffire : l'effacement ne
/// suit aucun événement observable de l'extérieur, il suit la mesure. La seule
/// écriture qui survive à une application d'attributs est celle qui a lieu
/// APRÈS elle — donc ici, dans `apply(_:)`, sous le contrôle de la cellule.
///
/// ## Ce que ce type ne fait pas
///
/// Aucune arithmétique : il ne connaît ni la courbe, ni la ligne de focus, ni
/// la géométrie. Il conserve le DERNIER `FocalCellTransform` que
/// `FocalScrollPass` lui a donné et le réécrit. Une re-mesure entre deux passes
/// laisse donc au plus une frame d'échelle périmée — invisible à l'œil, là où
/// l'identité, elle, se voyait immédiatement.
final class FocalPerspectiveCell: UICollectionViewCell {

    /// Dernière consigne du pass. `identity` tant qu'aucune n'est venue : une
    /// cellule fraîchement recyclée ne doit jamais hériter de la perspective de
    /// son occupant précédent.
    private(set) var focalTransform: FocalCellTransform = .identity

    /// Le seul écrivain — `FocalScrollPass.write(_:to:)`.
    func writeFocalTransform(_ transform: FocalCellTransform) {
        focalTransform = transform
        renderFocalTransform()
    }

    /// `super.apply` vient d'écraser `layer.transform` et `alpha`. On repose.
    override func apply(_ layoutAttributes: UICollectionViewLayoutAttributes) {
        super.apply(layoutAttributes)
        renderFocalTransform()
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        focalTransform = .identity
        renderFocalTransform()
    }

    /// `CATransaction` actions désactivées : `apply(_:)` peut être appelée
    /// DEPUIS un bloc d'animation UIView (mises à jour par lot), et une
    /// perspective reposée y serait interpolée — la cellule glisserait vers son
    /// échelle au lieu de l'avoir. Le pass, lui, écrit hors animation ; la
    /// garde est ici gratuite et couvre les deux chemins.
    private func renderFocalTransform() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        var matrix = CATransform3DMakeScale(focalTransform.scale, focalTransform.scale, 1)
        matrix.m41 = focalTransform.translation.width
        matrix.m42 = focalTransform.translation.height
        layer.transform = matrix
        alpha = focalTransform.alpha
        CATransaction.commit()
    }
}
