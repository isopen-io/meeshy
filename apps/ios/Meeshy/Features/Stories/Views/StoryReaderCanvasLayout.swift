import SwiftUI
import MeeshySDK
import MeeshyUI

/// La forme et le cadrage du canvas du lecteur dans un viewport donné : présentation
/// (carte ou plein bord), cotes de la scène, cadrage « carte → plein écran ».
///
/// Fonction pure du viewport et de deux drapeaux de chrome — la carte du lecteur
/// (`StoryCardView`) lui remet ce qu'elle tient, et lit ce qu'elle décide.
struct StoryReaderCanvasLayout {
    let viewport: CGSize
    let topInset: CGFloat
    let isFullscreenSession: Bool
    let chromeVisible: Bool

    /// Dimensions strictes 9:16 du canvas dans la géométrie courante.
    /// `.aspectRatio(.fit) + .frame(maxWidth/Height)` ne contraint pas
    /// correctement l'hôte canvas (`UIViewRepresentable`, monté sous
    /// `MeeshyScenePlayer`) sur iPhone 16 Pro (402×874pt) — le canvas se retrouvait à 491×754pt
    /// (height-fit avec width qui déborde) au lieu de 402×715pt (width-fit
    /// attendu). La sidebar droite tombait alors hors écran à x=389+w=46
    /// → out of 402 (bug 2026-05-27). On force ici les dimensions explicites
    /// par calcul direct du fit ratio.
    /// **Ratio (largeur / hauteur) du canvas — TOUJOURS 9:16** (`SceneShape.aspect`,
    /// décision porteur du 2026-09-17 sur #6896, lot #6904).
    ///
    /// La forme n'est plus discrétisée depuis le rapport du fond
    /// (`StoryCanvasAspect.from(ratio:)`, portrait/paysage) : un panorama 4:1
    /// s'y arrondissait en 16:9 et se retrouvait rogné — la scène est
    /// composée ET restituée en 9:16, le média se posant SANS rognage dans ce
    /// gabarit (`SceneShape.mediaBand`).
    var readerCanvasRatio: CGFloat { SceneShape.aspect }

    /// **Les cotes de la SCÈNE dans ce viewport — la LOI, pas un ajustement
    /// écrit ici** (#6904).
    ///
    /// `SceneShape.layout(in:)` rend exactement ce que
    /// `CanvasGeometry.aspectFitSize(in:ratio: 9:16)` rendait (le témoin
    /// `StoryReaderSceneCardTests.test_leCadreDuCanvas_estCeluiDeLaLoi` compare
    /// les deux écritures) : le lecteur ne change pas de cotes, il change de
    /// SOURCE. C'est ce qui garantit qu'il cadre la même scène que la galerie,
    /// et qu'un changement de forme ne se livre plus qu'à un seul endroit.
    ///
    /// La PLACE de la carte dans le plateau reste au solveur du lecteur
    /// (`readerCanvasFraming`) : la loi dit la forme, le plateau dit où elle se
    /// pose et à quelle échelle elle s'anime.
    /// **La FORME que la loi donne à la scène du lecteur** — le cadre, le fond
    /// et le rayon de LA carte de scène dans ce viewport. C'est elle que la
    /// carte reçoit, et c'est la même fonction que le plein écran d'un post et
    /// le RÉEL appellent (`GallerySceneStage`, `ReelSceneView`, #6904) : les
    /// trois surfaces ne peuvent plus cadrer trois scènes différentes.
    func sceneLayout(expanded: Bool) -> SceneShape.Layout {
        SceneShape.layout(in: viewport, immersive: expanded)
    }

    /// Cadrage « carte → plein écran » du canvas reader, MUTUALISÉ avec le composer
    /// via `StoryCanvasFraming` (même solveur, même rendu). Au repos (mode normal) le
    /// canvas est une carte arrondie (coins 22) SOUS le chrome auteur (progress + ligne
    /// auteur) et AU-DESSUS du footer (actions + champ répondre), avec marges latérales
    /// nettes (distinguée du viewport). En plein écran (`isFullscreenStorySession`) →
    /// `.free` = identité (canvas 9:16 plein bord, coins 0 ; le chrome se masque par
    /// ailleurs via `chromeVisible`). Un seul ressort anime taille/coins/position au
    /// toggle — design user 2026-06-02. (it.33 : insets relevés pour une carte nette —
    /// la tentative it.32 cadrait déjà mais à 0.94 ≈ plein bord, donc invisible.)
    /// Présentation du canvas : `.free` (plein bord) quand le chrome est masqué
    /// (long-press immersif) OU en session plein écran ; `.carded` (carte arrondie
    /// marginée) au repos. Source de vérité : `StoryCanvasFraming.readerPresentation`
    /// (truth-table SDK pure, testée). Le long-press qui cache les contrôleurs
    /// agrandit ainsi le canvas pour épouser le viewport (user 2026-06-03).
    func presentation(lifted: Bool) -> StoryCanvasFraming.Presentation {
        StorySceneFocus.presentation(
            resting: StoryCanvasFraming.readerPresentation(isFullscreenSession: isFullscreenSession,
                                                           chromeVisible: chromeVisible),
            isComposing: lifted)
    }

    /// `true` quand le canvas est étendu plein bord (`.free`) — pilote le voile,
    /// l'ombre et l'animation de la carte en phase avec le cadrage.
    /// **#6806 — `!= .carded`, et non `== .free`.** La session plein écran rend
    /// désormais `.immersive` (le canvas couvre le viewport) ; un test sur
    /// `.free` seul aurait laissé le voile, l'ombre et l'animation de carte
    /// croire qu'on est encore cardé au moment le plus plein écran de tous.
    func isExpanded(lifted: Bool) -> Bool { presentation(lifted: lifted) != .carded }

    func framing(reserve: CGFloat?) -> StoryCanvasFraming.Result {
        StoryCanvasFraming.resolve(StorySceneFocus.framingInput(resting: .init(
            viewport: viewport,
            headerInset: topInset + 72,   // barres progress (~8) + ligne auteur (~48) + gap — clairance chrome, flush sans occlusion
            bottomInset: 64,              // marge basse ÷2 (it.48) — carte plus proche du bord bas
            sideInset: 8,                 // marges latérales ÷2 (it.48) — carte plus proche des bords L/R
            state: presentation(lifted: reserve != nil),
            // **Le rayon de la loi, jamais un littéral** (#6904) : le lecteur
            // arrondissait à 22 pendant que le plein écran cadré d'un post
            // arrondissait à 20 — la même carte se reconnaissait à ses coins.
            cardedCornerRadius: SceneShape.cardedCornerRadius,
            // #6760 — l'alignement n'est plus décidé ici : il appartient au
            // PLATEAU, que les quatre surfaces partagent. La directive du
            // 2026-09-15 (« ce qui est construit se pose sur le plateau au
            // milieu […] reprendre la même logique dans le reader de story »)
            // supplante celle du 2026-07-04, qui collait toute scène PORTRAIT
            // sous la ligne d'expiration. Les trois dates et le raisonnement
            // vivent chez `StageChromeAlignment.verticalAlignment` — pas ici,
            // pour qu'une seule surface ne puisse pas les faire diverger.
            verticalAlignment: StageChromeAlignment.verticalAlignment(canvasRatio: readerCanvasRatio),
            canvasRatio: readerCanvasRatio),
            topInset: topInset, composerReserve: reserve))
    }
}
