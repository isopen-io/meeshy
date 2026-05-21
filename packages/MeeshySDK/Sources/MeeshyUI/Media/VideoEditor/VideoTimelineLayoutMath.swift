import Foundation
import CoreGraphics

/// Pure math behind the video editor timeline layout — extracted from
/// `VideoEditorTimeline.computeLayout(viewport:duration:)` so the
/// auto-follow-with-hold semantic can be unit-tested without spinning up
/// SwiftUI.
///
/// ## Semantic (« auto-follow with hold »)
/// Emprunté aux pro editors (Final Cut Pro, DaVinci, CapCut) :
///
/// - **Strip ≤ viewport** : ancré à gauche (`leadingX = 0`), playhead
///   glisse librement vers la droite. Aucun scroll nécessaire.
/// - **Strip > viewport** :
///   - **Zone de début** (`playhead < halfViewport`) : leadingX = 0. La
///     première frame reste visible, le playhead glisse depuis le bord
///     gauche vers le centre. C'est le fix du bug « début de timeline
///     pas visible ».
///   - **Zone médiane** : playhead pinné au centre, strip se translate.
///   - **Zone de fin** (`playhead > stripWidth − halfViewport`) :
///     leadingX clampé pour que la dernière frame reste visible. Playhead
///     glisse depuis le centre vers le bord droit.
enum VideoTimelineLayoutMath {

    /// Snapshot du positionnement à un instant `playheadTime`.
    struct Layout: Equatable {
        /// Position X du bord gauche du strip dans le repère viewport.
        /// Négatif quand le strip a déjà scrollé.
        let leadingX: CGFloat
        /// Position X du playhead dans le repère viewport.
        let playheadX: CGFloat
    }

    static func layout(
        playheadTime: Double,
        duration: Double,
        viewport: CGFloat,
        pixelsPerSecond: CGFloat
    ) -> Layout {
        // Garde-fous : valeurs négatives ou nulles → fallback neutre
        // (leadingX = 0, playhead au 0). Évite des NaN si un caller passe
        // un viewport pas encore mesuré (GeometryReader pré-mesure).
        guard viewport > 0, pixelsPerSecond > 0 else {
            return Layout(leadingX: 0, playheadX: 0)
        }
        let safePlayheadTime = max(0, min(playheadTime, duration))
        let stripWidth = CGFloat(duration) * pixelsPerSecond
        let halfViewport = viewport / 2
        let naturalPlayheadX = CGFloat(safePlayheadTime) * pixelsPerSecond

        if stripWidth <= viewport {
            // Strip rentre dans le viewport : ancré à gauche, playhead libre.
            return Layout(leadingX: 0, playheadX: naturalPlayheadX)
        }
        // Strip plus large : on tente le centering puis on clamp pour que
        // le strip ne quitte jamais le viewport (start-hold + end-hold).
        let centeredLeading = halfViewport - naturalPlayheadX
        let clampedLeading = max(viewport - stripWidth, min(0, centeredLeading))
        return Layout(
            leadingX: clampedLeading,
            playheadX: naturalPlayheadX + clampedLeading
        )
    }
}
