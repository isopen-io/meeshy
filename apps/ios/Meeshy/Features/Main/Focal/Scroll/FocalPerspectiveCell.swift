import UIKit

/// La cellule qui **repose elle-même** sa perspective après chaque application
/// d'attributs de layout.
///
/// ## Pourquoi ce type existe (mesuré, pas déduit)
///
/// L'application d'attributs de layout réécrit `layer.transform` depuis
/// `layoutAttributes.transform3D` (identité) et `alpha` depuis
/// `layoutAttributes.alpha` (1). `FocalScrollPass` le documentait déjà, et y
/// répondait par ses SIX sites d'appel : reposer la perspective après chaque
/// événement connu qui provoque une application d'attributs.
///
/// **Précision sur QUI écrase** (elle compte pour lire les témoins) : ces
/// écritures viennent du chemin INTERNE de la collection, qui pose les
/// attributs sur la cellule PUIS appelle `apply(_:)` — le point de surcharge
/// public, dont l'implémentation par défaut ne fait rien. Appeler
/// `super.apply(_:)` à nu, sur une cellule détachée, n'efface donc rien : un
/// témoin qui compterait sur ce `super` pour remettre le layer à l'identité
/// épinglerait un maillon inexistant (cf.
/// `FocalPerspectiveCellTests.test_applyLayoutAttributes_doesNotRewriteSynchronously`,
/// qui joue le rôle d'UIKit au lieu de le supposer). L'effacement, lui, est
/// bien réel — il est MESURÉ ci-dessous.
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
/// APRÈS elle — ici `apply(_:)` marque (`setNeedsLayout`) et `layoutSubviews`
/// repose, dans le même commit CoreAnimation (voir la doc d'`apply` pour la
/// raison de ce détour : reposer DANS `apply` fait boucler la self-sizing).
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

    /// Le seul écrivain — `FocalScrollPass.write(_:to:)`. Appelé hors de toute
    /// passe de layout (les six sites du pass) : l'écriture directe est sûre.
    func writeFocalTransform(_ transform: FocalCellTransform) {
        focalTransform = transform
        renderFocalTransform()
    }

    /// `super.apply` vient d'écraser `layer.transform` et `alpha`. On ne
    /// repose PAS ici : on marque, et `layoutSubviews` reposera.
    ///
    /// **Reposer synchroniquement dans `apply(_:)` fait boucler la
    /// self-sizing** — constaté par crash au simulateur iOS 26.1
    /// (`Meeshy-2026-08-16-214007.ips`) : assertion Swift dans
    /// `_setNeedsVisibleCellsUpdate`, `_updateVisibleCellsNow` récursif sur
    /// 14 niveaux. `apply` s'exécute AU MILIEU de la passe de mise à jour de
    /// la collection ; y réécrire `layer.transform` laisse la mesure
    /// `preferredLayoutAttributesFitting` voir une cellule transformée, la
    /// passe ré-invalide, ré-applique, on repose — et la convergence ne vient
    /// jamais. `setNeedsLayout` est coalescé, non réentrant, et garantit un
    /// `layoutSubviews` dans le MÊME commit CoreAnimation : zéro frame rendue
    /// sans perspective, zéro écriture dans la passe.
    override func apply(_ layoutAttributes: UICollectionViewLayoutAttributes) {
        super.apply(layoutAttributes)
        setNeedsLayout()
    }

    /// S'exécute APRÈS la passe de la collection (le layout des sous-couches
    /// suit `layoutSubviews` de la collection dans le même commit), donc la
    /// consigne reposée ici n'est jamais visible d'une re-mesure en cours.
    override func layoutSubviews() {
        super.layoutSubviews()
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
        // `zPosition` remis à 0 : l'élévation appartenait à la loupe retirée
        // (spec §5 réancrée 2026-08-18) — aucun recyclage n'en hérite.
        layer.zPosition = 0
        alpha = focalTransform.alpha
        CATransaction.commit()
    }
}
