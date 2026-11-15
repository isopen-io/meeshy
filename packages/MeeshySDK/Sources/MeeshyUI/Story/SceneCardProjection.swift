import CoreGraphics

/// **Comment une scène incrustée passe de sa taille de RÉFÉRENCE à sa carte**
/// (#4038, #8680).
///
/// Le canvas est monté à la taille de référence, puis ramené à la carte par une
/// échelle UNIFORME. Tout ce qu'il porte — calques, champ de saisie, curseur,
/// indication « Exprimez-vous… » — vit sous cette seule transformation : un
/// texte en cours de saisie garde donc, sur une scène réduite (clavier levé,
/// outil ouvert), exactement la part de la scène qu'il occupera une fois
/// publié. `onScreen(designLength:)` est la loi qui le dit : une longueur du
/// référentiel 1080 rapportée à la largeur de la carte ne dépend PAS de la
/// taille de la carte.
public nonisolated struct SceneCardProjection: Equatable, Sendable {
    /// La taille à laquelle le canvas est MONTÉ.
    public let reference: CGSize
    /// La carte visible : le rectangle au ratio, ajusté dans le conteneur.
    public let fit: CGSize

    public init(container: CGSize, ratio: CGFloat, referenceViewport: CGSize) {
        self.fit = CanvasGeometry.aspectFitSize(in: container, ratio: ratio)
        self.reference = CanvasGeometry.aspectFitSize(in: referenceViewport, ratio: ratio)
    }

    /// L'échelle UNIFORME appliquée au canvas monté.
    public var scale: CGFloat {
        reference.width > 0 ? fit.width / reference.width : 1
    }

    /// La géométrie design → canvas MONTÉ — celle que calques et champ de
    /// saisie lisent.
    public var mountedGeometry: CanvasGeometry {
        CanvasGeometry(renderSize: reference)
    }

    /// Une longueur du référentiel design, telle qu'elle PARAÎT à l'écran.
    public func onScreen(designLength: CGFloat) -> CGFloat {
        mountedGeometry.render(designLength) * scale
    }
}
