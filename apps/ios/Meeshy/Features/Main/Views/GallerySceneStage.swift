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
/// forme figée (9:16). Elle a donc deux états et deux seulement, que la loi
/// nomme :
///
/// | état | ce que la scène fait | qui peint autour |
/// |---|---|---|
/// | cadré | elle tient ENTIÈRE dans la zone libre, arrondie | le plateau |
/// | immersif | elle COUVRE le viewport et déborde | personne |
///
/// ## Ce que ce type ajoute à la loi, et rien de plus
///
/// La loi ne connaît pas le plateau : elle prend un viewport et rend un cadre.
/// Ce type dit QUEL viewport — la zone libre que les couloirs laissent, ou
/// l'écran entier — et projette la réponse en cotes de vue. Il ne décide
/// d'aucune forme, d'aucun arrondi, d'aucun peintre : tout cela vient de
/// `SceneShape.layout(_:in:)`.
///
/// La zone libre est celle du solveur, à l'arithmétique près
/// (`Corridors.reservedHeight` et la gouttière latérale) : les deux surfaces
/// doivent tomber sur la MÊME zone, sinon le cadre dessiné et le rail réservé
/// diffèrent d'une bande.
enum GallerySceneStage {

    /// Ce qu'une page scène a besoin de savoir pour se poser.
    struct Frame: Equatable {
        /// Ce que la scène a le droit d'occuper — la zone libre, ou le viewport.
        let region: CGSize
        /// La réponse de la loi, telle quelle.
        let layout: SceneShape.Layout

        /// Les cotes de la SCÈNE. En immersif elles débordent de la région :
        /// c'est ce que « couvrir le viewport » veut dire pour une forme figée.
        var sceneSize: CGSize { layout.sceneFrame.size }

        /// **La boîte VISIBLE** — ce que la page mesure et ce que la CARTE
        /// rogne. Cadrée, la scène tient entière et la boîte est la scène ;
        /// immersive, la scène déborde et la boîte est la région.
        ///
        /// L'écriture vit dans `SceneCard`, avec le rognage qu'elle gouverne :
        /// la recopier ici ferait deux réponses à une même question, et c'est
        /// exactement ce que ce lot retire.
        var visible: CGSize {
            SceneCard<EmptyView>.visibleSize(layout: layout, region: region)
        }

        var cornerRadius: CGFloat { layout.cornerRadius }

        /// **Le canvas peint ses PROPRES bandes exactement quand personne
        /// d'autre ne peint** — la projection directe d'`offscreenPainter`.
        ///
        /// La bande qu'un média AJUSTÉ laisse dans une scène est une surface de
        /// COMPOSITION, pas un vide (directive porteur 2026-08-31,
        /// `StoryLetterboxFill`) : il faut donc que quelqu'un la peigne. Cardée,
        /// c'est le plateau — le laisser au canvas empilerait deux dégradés du
        /// même hachage dans deux cadres (#6791). Immersive, le plateau n'est
        /// plus là : sans cette bascule, la bande d'un panorama devenait le sol
        /// NOIR de la galerie, et « personne ne peint » se lisait comme un trou.
        ///
        /// Un seul peintre, toujours — la loi dit lequel, l'hôte ne rejuge rien.
        var paintsOwnLetterbox: Bool { layout.offscreenPainter == .none }
        /// `nil` en immersif : il n'y a plus de hors-champ, donc aucun fond à
        /// choisir — la troisième couche de #6806 disparaît par construction.
        var backdrop: SceneShape.Backdrop? { layout.backdrop }
        var offscreenPainter: SceneShape.OffscreenPainter { layout.offscreenPainter }
    }

    /// La région dans laquelle la scène se pose.
    ///
    /// En plein cadre, le plateau n'est pas atténué : il n'est PAS LÀ (voir
    /// `StagePresentation.showsPlateau`). Ses couloirs ne mordent donc plus, et
    /// c'est exactement ce que le solveur de pièces jointes n'exprimait pas —
    /// il libérait bien la place, mais continuait d'AJUSTER le média dedans.
    static func region(viewport: CGSize,
                       presentation: StagePresentation,
                       corridors: MediaStageFraming.Corridors) -> CGSize {
        guard presentation.showsPlateau else { return viewport }
        return CGSize(width: max(0, viewport.width - 2 * max(0, corridors.gutter)),
                      height: max(0, viewport.height - corridors.reservedHeight))
    }

    /// Le cadre d'une page scène dans cet état.
    ///
    /// **Le fond n'est plus une question d'hôte** (directive porteur du
    /// 2026-09-17) : la galerie élisait le hachage étiré pendant que le lecteur
    /// de stories élisait la couleur dominante — deux fonds pour une même
    /// carte, chacun juste chez lui. La loi le nomme désormais
    /// (`SceneShape.cardedBackdrop`), et une page scène le lit comme elle lit
    /// sa forme. En immersif il n'y a rien à peindre, donc rien à élire.
    static func frame(viewport: CGSize,
                      presentation: StagePresentation,
                      corridors: MediaStageFraming.Corridors) -> Frame {
        let zone = region(viewport: viewport, presentation: presentation, corridors: corridors)
        let mode: SceneShape.Fullscreen = presentation.isFull
            ? .immersive
            : .carded(SceneShape.cardedBackdrop)
        return Frame(region: zone, layout: SceneShape.layout(mode, in: zone))
    }
}
