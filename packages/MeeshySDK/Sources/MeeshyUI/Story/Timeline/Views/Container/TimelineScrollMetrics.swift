import CoreGraphics
import SwiftUI

/// Largeur visible de la zone de défilement. Une TAILLE, pas un décalage : la
/// lecture par préférence reste fiable sur toutes les versions d'iOS, là où
/// celle d'un offset de scroll cesse de re-déclencher à partir d'iOS 18.
public struct TimelineViewportWidthKey: PreferenceKey {
    public static let defaultValue: CGFloat = 0
    public static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Géométrie du contrôleur de défilement de la timeline.
///
/// Pur et `nonisolated` : c'est la seule partie du contrôleur qui se teste
/// sans monter la moindre vue, et l'endroit où vivent les cas limites (contenu
/// plus court que la fenêtre, largeurs nulles, curseur en butée).
public nonisolated enum TimelineScrollMetrics {

    /// Largeur minimale du curseur. En dessous, il devient impossible à
    /// attraper au doigt sur une timeline très longue — la proportionnalité
    /// exacte céderait alors le pas à l'utilisabilité.
    public static let minimumThumbWidth: CGFloat = 32

    /// `true` quand le contrôleur a une raison d'exister.
    ///
    /// Tout le contenu tient à l'écran ⟹ rien à faire défiler : afficher un
    /// curseur pleine largeur, immobile, serait un contrôle sans effet.
    public static func isNeeded(contentWidth: CGFloat, viewportWidth: CGFloat) -> Bool {
        contentWidth > viewportWidth + 1
    }

    /// Course de défilement disponible, en points de contenu.
    public static func scrollableWidth(contentWidth: CGFloat,
                                       viewportWidth: CGFloat) -> CGFloat {
        max(0, contentWidth - viewportWidth)
    }

    /// Avancement dans le contenu, borné à `[0, 1]`.
    ///
    /// Le rebond élastique d'iOS produit des décalages négatifs ou au-delà de
    /// la fin : le curseur doit rester dans sa piste plutôt que d'en sortir.
    public static func progress(scrollX: CGFloat,
                                contentWidth: CGFloat,
                                viewportWidth: CGFloat) -> CGFloat {
        let scrollable = scrollableWidth(contentWidth: contentWidth, viewportWidth: viewportWidth)
        guard scrollable > 0 else { return 0 }
        return min(1, max(0, scrollX / scrollable))
    }

    /// Largeur du curseur : la part visible du contenu, jamais moins que
    /// `minimumThumbWidth`, jamais plus que la piste.
    public static func thumbWidth(trackWidth: CGFloat,
                                  contentWidth: CGFloat,
                                  viewportWidth: CGFloat) -> CGFloat {
        guard trackWidth > 0, contentWidth > 0 else { return 0 }
        let visibleShare = min(1, viewportWidth / contentWidth)
        return min(trackWidth, max(minimumThumbWidth, trackWidth * visibleShare))
    }

    /// Position du bord gauche du curseur sur sa piste.
    public static func thumbX(progress: CGFloat,
                              trackWidth: CGFloat,
                              thumbWidth: CGFloat) -> CGFloat {
        let travel = max(0, trackWidth - thumbWidth)
        return travel * min(1, max(0, progress))
    }

    /// Décalage de contenu visé quand le curseur est posé en `thumbX`.
    ///
    /// Réciproque exacte de `thumbX(progress:trackWidth:thumbWidth:)` : sans
    /// cette symétrie, poser le curseur puis le relire le ferait sauter.
    public static func scrollX(forThumbX thumbX: CGFloat,
                               trackWidth: CGFloat,
                               thumbWidth: CGFloat,
                               contentWidth: CGFloat,
                               viewportWidth: CGFloat) -> CGFloat {
        let travel = max(0, trackWidth - thumbWidth)
        guard travel > 0 else { return 0 }
        let progress = min(1, max(0, thumbX / travel))
        return scrollableWidth(contentWidth: contentWidth, viewportWidth: viewportWidth) * progress
    }
}
