import SwiftUI

/// Le cadre sous lequel la carte de story se montre : apparition, glissé de
/// fermeture, glissé de groupe. Fonction pure des valeurs d'animation que le
/// lecteur écrit ; elle ne possède aucun état.
struct StoryViewerCardTransform {
    let isDismissing: Bool
    let appear: StoryViewerAppearance
    let dragOffset: CGFloat
    let groupSlide: CGFloat
    let horizontalDrag: CGFloat
    let screenWidth: CGFloat
    let screenHeight: CGFloat

    // Drag dismiss progress 0–1
    var dragProgress: CGFloat {
        min(max(dragOffset / 350, 0), 1)
    }

    // Combined horizontal offset (programmatic slide + interactive drag)
    /// 1:1 avec le doigt (Lot 3 — l'ancien amorti ×0.5 rendait le cube
    /// inter-groupes « lourd » : un commit exigeait 2× la largeur de course).
    var totalSlideX: CGFloat {
        groupSlide + horizontalDrag
    }

    // Depth effect from horizontal movement (slight scale + rotation)
    var slideProgress: CGFloat {
        min(abs(totalSlideX) / screenWidth, 1.0)
    }

    var scale: CGFloat {
        if isDismissing { return 0.12 }
        return appear.scale * (1.0 - dragProgress * 0.35)
    }

    var cornerRadius: CGFloat {
        if isDismissing { return 32 }
        return max(appear.cornerRadius, dragProgress * 36)
    }

    var opacity: Double {
        if isDismissing { return 0 }
        return 1.0 - Double(dragProgress) * 0.3
    }

    var offsetY: CGFloat {
        // La sortie CONTINUE le geste : le doigt allait vers le bas, la carte
        // s'en va vers le bas. Elle partait vers le HAUT, ce qui cassait la
        // continuité du swipe de fermeture (directive user 2026-07-25).
        if isDismissing { return screenHeight * 0.35 }
        // Suivi 1:1 du doigt. L'amorti à 0,5 rendait le retour en arrière
        // infidèle : la carte ne revenait pas sous le doigt, et l'annulation
        // du geste ne se « sentait » pas.
        return dragOffset
    }
}

struct StoryViewerAppearance: Equatable { var scale: CGFloat = 0.92; var cornerRadius: CGFloat = 24 }
