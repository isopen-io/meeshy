import CoreGraphics
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le cadre d'une PAGE SCÈNE — une projection de `SceneShape.layout`, jamais
/// du solveur de pièces jointes** (décision porteur du 2026-09-17 sur #6896,
/// lot #6904).
///
/// ## Pourquoi une page scène ne se cadre pas comme une photo
///
/// `MediaStageFraming` porte la loi des PIÈCES JOINTES : il ajuste le média
/// dans la zone libre (cadré) ou dans le viewport (plein cadre), et il ne rogne
/// jamais — « une pièce jointe est le CONTENU, la rogner retirerait ce que
/// l'expéditeur a envoyé ». Appliqué à une scène, ce même raisonnement produit
/// un plein écran qui n'est pas plein : mesuré au simulateur le 2026-09-17 sur
/// le repère F1, le canvas s'arrêtait à 402 × 714,67 dans un viewport de
/// 402 × 874, laissant deux bandes de 79,7 pt qu'un SECOND peintre habillait.
///
/// Une scène n'est pas un contenu reçu : c'est une SURFACE DE COMPOSITION à
/// forme figée (9:16), et elle a UNE carte — la même que le lecteur de stories
/// (directive porteur du 2026-09-17). Les deux plein écrans ne diffèrent donc
/// pas par leur FORME mais par leur VIEWPORT :
///
/// | état | le viewport que ce type passe à la loi | ce qu'on voit de plus |
/// |---|---|---|
/// | cadré | la zone libre que les couloirs du plateau laissent | le chrome, les détails |
/// | immersif | l'écran ENTIER, aucun couloir | la même carte, plus grande |
///
/// **L'immersif ne rogne plus rien** (directive du 2026-09-17, 3e message :
/// « On préserve le même fond que pour la story ! »). Il rendait auparavant un
/// aspect-FILL sans fond — la seule surface du produit qui retirait des pixels
/// posés par l'auteur.
///
/// ## Ce que ce type ajoute à la loi, et rien de plus
///
/// La loi ne connaît pas le plateau : elle prend un viewport et rend un cadre.
/// Ce type dit QUEL viewport — la zone libre que les couloirs laissent, ou
/// l'écran entier — et projette la réponse en cotes de vue. Il ne décide
/// d'aucune forme, d'aucun arrondi, d'aucun fond : tout cela vient de
/// `SceneShape.layout(in:)`.
///
/// La zone libre est celle du solveur, à l'arithmétique près
/// (`Corridors.reservedHeight` et la gouttière latérale) : les deux surfaces
/// doivent tomber sur la MÊME zone, sinon le cadre dessiné et le rail réservé
/// diffèrent d'une bande.
enum GallerySceneStage {

    /// Ce qu'une page scène a besoin de savoir pour se poser.
    ///
    /// **`region` (la taille passée à la loi) a été RETIRÉE** (revue du tour
    /// 3) : aucun lecteur, ni de production ni de témoin, ne la consultait —
    /// `frame(...)` la calcule pour nourrir `SceneShape.layout(in:)` et n'a
    /// aucune raison de la republier une fois la carte obtenue.
    struct Frame: Equatable {
        /// La réponse de la loi, telle quelle.
        let layout: SceneShape.Layout

        /// Les cotes de la SCÈNE — toujours contenues dans la région, puisque
        /// la loi AJUSTE. C'est ce que la carte mesure.
        var sceneSize: CGSize { layout.sceneFrame.size }

        var cornerRadius: CGFloat { layout.cornerRadius }

        /// Le fond que la CARTE peint dedans, élu par la loi — jamais par
        /// l'hôte, qui en élisait un autre que le lecteur de stories.
        var backdrop: SceneShape.Backdrop { layout.backdrop }
    }

    /// La région dans laquelle la scène se pose — **le SEUL paramètre par
    /// lequel les deux plein écrans diffèrent**.
    ///
    /// En plein cadre, le plateau n'est pas atténué : il n'est PAS LÀ (voir
    /// `StagePresentation.showsPlateau`). Ses couloirs ne mordent donc plus, et
    /// la carte grandit d'autant — c'est tout ce que « immersif » veut dire
    /// depuis la directive du 2026-09-17.
    static func region(viewport: CGSize,
                       presentation: StagePresentation,
                       corridors: MediaStageFraming.Corridors) -> CGSize {
        guard presentation.showsPlateau else { return viewport }
        return CGSize(width: max(0, viewport.width - 2 * max(0, corridors.gutter)),
                      height: max(0, viewport.height - corridors.reservedHeight))
    }

    /// Le cadre d'une page scène dans cet état.
    ///
    /// **Ni le fond ni la forme ne sont une question d'hôte** (directive
    /// porteur du 2026-09-17) : la galerie élisait le hachage étiré, le lecteur
    /// de stories la couleur dominante, et l'immersif n'élisait RIEN en rognant
    /// la scène. Trois réponses pour une même carte, chacune juste chez elle.
    /// Cette fonction ne choisit plus qu'une chose — le VIEWPORT.
    ///
    /// **Et elle DÉCLARE l'état de ce viewport** (directive B du 2026-09-18 :
    /// « lorsqu'on met en plein écran, il faut enlever l'arrondi sur le
    /// composant et garder les bords angle exacte ! »). `presentation.isFull`
    /// est déjà la question « le plateau est-il là ? » qui choisit la région :
    /// c'est la MÊME question que « ce viewport est-il immersif ? », et la
    /// laisser sans réponse rendait 22 pt d'arrondi sur une carte qui occupe
    /// l'écran entier — quatre encoches par lesquelles on voyait le sol.
    static func frame(viewport: CGSize,
                      presentation: StagePresentation,
                      corridors: MediaStageFraming.Corridors) -> Frame {
        let zone = region(viewport: viewport, presentation: presentation, corridors: corridors)
        return Frame(layout: SceneShape.layout(in: zone, immersive: presentation.isFull))
    }
}
