import Foundation
import CoreGraphics

/// Value type that captures the px-per-second contract used by every timeline
/// view. Pure & deterministic — never depends on UIScreen or runtime metrics.
///
/// All members are `nonisolated` so this type can be used freely from any
/// actor context despite MeeshyUI's `defaultIsolation = .mainActor`.
public struct TimelineGeometry: Equatable, Sendable {

    public nonisolated static let basePixelsPerSecond: CGFloat = 50

    public let zoomScale: CGFloat

    public nonisolated init(zoomScale: CGFloat) {
        self.zoomScale = max(0.05, zoomScale)
    }

    public nonisolated var pixelsPerSecond: CGFloat {
        Self.basePixelsPerSecond * zoomScale
    }

    public nonisolated func x(for time: Float) -> CGFloat {
        CGFloat(time) * pixelsPerSecond
    }

    public nonisolated func time(forX x: CGFloat) -> Float {
        Float(x / pixelsPerSecond)
    }

    public nonisolated func width(for duration: Float) -> CGFloat {
        CGFloat(duration) * pixelsPerSecond
    }

    /// 6 points of finger tolerance, recomputed from current zoom.
    public nonisolated var snapToleranceSeconds: Float {
        Float(6.0 / pixelsPerSecond)
    }

    /// Plafond absolu de l'aimantation, en secondes.
    ///
    /// Une tolérance dérivée du doigt seul enfle sans limite quand on dézoome :
    /// à 5 %, huit points valent 3,2 s, soit plus de la moitié d'une story de
    /// six secondes. L'aimant happait alors le clip d'un point d'accroche à
    /// l'autre et aucune position intermédiaire n'était atteignable.
    ///
    /// Un quart de seconde est le point d'équilibre : au zoom nominal la
    /// tolérance native (0,16 s) reste en deçà, donc l'aimant garde exactement
    /// le comportement appris ; au-delà, c'est l'auteur qui décide, pas
    /// l'aimant.
    public nonisolated static let maxSnapToleranceSeconds: Float = 0.25

    /// Tolérance d'aimantation d'un GLISSEMENT de clip — 8 points de doigt,
    /// bornés par `maxSnapToleranceSeconds`.
    public nonisolated var dragSnapToleranceSeconds: Float {
        min(Float(8.0 / pixelsPerSecond), Self.maxSnapToleranceSeconds)
    }

    /// Fenêtre d'affichage d'un clip sur sa lane. Un élément « permanent »
    /// (duration nil ou ≤ 0 — texte/sticker sans fenêtre temporelle) est
    /// visible toute la slide : sa barre s'étend de startTime à slideDuration.
    /// Sans cette résolution, la barre avait une largeur de 0 pt et l'élément
    /// était ineditable dans la timeline (constat simulateur 2026-07-11).
    public nonisolated static func effectiveClipDuration(
        startTime: Float,
        duration: Float?,
        slideDuration: Float
    ) -> Float {
        if let duration, duration > 0 { return duration }
        return max(0, slideDuration - max(0, startTime))
    }
}
