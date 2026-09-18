import CoreGraphics
import MeeshySDK
import MeeshyUI

/// **La scène du détail d'un post se voit entière, avec sa rangée d'actions,
/// au-dessus du composer** (#6696, recette staging du 2026-09-15).
///
/// ## Ce que la recette a mesuré (iPhone 16 Pro, 874 pt)
///
/// La scène occupait 370 × 657 pt à partir de y 218 — un `.aspectRatio(9.0 /
/// 16.0)` littéral sans borne de hauteur — et le composer commence à y 746 :
/// son bas passait dessous, et J'aime / Commentaires / Republier sortaient de
/// l'écran. Rien ne bornait la scène par ce que la page peut MONTRER.
///
/// ## La règle
///
/// 1. Le rapport est TOUJOURS `SceneShape.aspect` (9:16, #6896/#6904) — plus un
///    littéral, et plus non plus le rapport d'une image seule (#6697 lu comme
///    « resserrer sur l'image » contredisait la scène RENDUE : le canvas rend
///    toujours son 9:16, jamais l'image cadrée, et poser un cadre plus large
///    autour d'un rendu plus étroit zoomait et rognait #6897).
/// 2. À l'ouverture, la scène ET sa rangée d'actions tiennent entre le haut de
///    la scène et le bas de la zone de défilement.
/// 3. …sauf si elle devait pour cela passer sous la moitié de la largeur du
///    détail : son contenu se projette sur sa largeur
///    (`CanvasGeometry.scaleFactor = largeur / 1080`) et deviendrait illisible.
///    Un texte long la pose alors sous la ligne de flottaison de toute façon, et
///    elle reprend sa taille de LECTURE.
/// 4. Toujours : défilée sous l'en-tête flottant, elle se voit entière avec sa
///    rangée d'actions — aucun contrôle ne la couvre.
///
/// Pure : ce que la page mesure entre, une taille sort. `nonisolated` pour
/// être interrogée hors du `MainActor`, comme `SceneShape`.
nonisolated enum PostDetailSceneFraming {

    /// Plafond de largeur — celui du conteneur d'avant : un iPad n'étire pas la
    /// scène en mur.
    static let maxWidth: CGFloat = 460
    /// Marge horizontale du détail, de chaque côté.
    static let horizontalInset: CGFloat = 16
    /// La hauteur réservée SOUS la scène à sa rangée d'actions : mesurée 42 pt
    /// sur la recette, arrondie à la cible tactile minimale.
    static let actionsRowReserve: CGFloat = 44
    /// Sous cette fraction de la largeur du détail, la scène ne rétrécit plus
    /// pour tenir à l'ouverture.
    static let minimumWidthFraction: CGFloat = 0.5
    /// Un défilement plus petit que ce seuil est le repos.
    static let restTolerance: CGFloat = 1

    /// **Ce que le détail mesure de sa propre page.**
    nonisolated struct Measures: Equatable {
        /// La zone de défilement — du haut de la zone sûre au composer.
        var viewport: CGSize = .zero
        /// Le haut de la scène dans cette zone, relevé AU REPOS.
        var sceneTop: CGFloat?

        /// **Le haut de la scène ne se relève qu'au repos.** Pendant le
        /// défilement son cadre suit le contenu : le relever ferait changer la
        /// taille de la scène sous le doigt. Arrondi au point, pour qu'un
        /// sous-pixel ne réécrive pas l'état à chaque passe.
        func recordingSceneTop(_ minY: CGFloat, scrollOffset: CGFloat) -> Measures {
            guard abs(scrollOffset) < PostDetailSceneFraming.restTolerance else { return self }
            var relevees = self
            relevees.sceneTop = minY.rounded()
            return relevees
        }
    }

    /// La taille du canvas de la scène, ou `nil` tant que la page n'est pas
    /// mesurée — l'appelant garde alors son ajustement en largeur.
    static func sceneSize(ratio: CGFloat,
                          measures: Measures,
                          headerHeight: CGFloat = CollapsibleHeaderMetrics.expandedHeight) -> CGSize? {
        let viewport = measures.viewport
        let largeur = min(viewport.width - 2 * horizontalInset, maxWidth)
        let visible = viewport.height - headerHeight - actionsRowReserve
        guard ratio > 0, largeur > 0, visible > 0 else { return nil }
        let lecture = CanvasGeometry.aspectFitSize(in: CGSize(width: largeur, height: visible), ratio: ratio)
        let haut = max(headerHeight, measures.sceneTop ?? headerHeight)
        let hauteurOuverture = min(visible, viewport.height - haut - actionsRowReserve)
        guard hauteurOuverture > 0 else { return lecture }
        let ouverture = CanvasGeometry.aspectFitSize(in: CGSize(width: largeur, height: hauteurOuverture),
                                                     ratio: ratio)
        return ouverture.width >= largeur * minimumWidthFraction ? ouverture : lecture
    }
}
