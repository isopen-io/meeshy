import Foundation
import CoreGraphics

// MARK: - L'impression VISIBLE au sens MRC (#10501)
//
// IAB / MRC : un affichage est « viewable » quand ≥ 50 % de sa surface est
// visible pendant ≥ 1 s CONTINUE ; une vidéo en lecture, ≥ 50 % pendant ≥ 2 s
// continues. Le compteur d'impressions ne change pas (chaque listing compte) :
// `viewable` est un ATTRIBUT de l'impression.
//
// Aucune minuterie par cellule : le compteur est nourri par les changements de
// cadre que la surface mesure déjà, et conclut à l'instant où on le lit.

public struct ViewabilityMeter: Sendable, Equatable {
    public static let minFraction = 0.5
    public static let displayThresholdMs = 1_000
    public static let videoThresholdMs = 2_000

    public let isVideo: Bool
    public private(set) var maxVisibleFraction = 0.0
    private var visibleSinceMs: Int?
    private var visibleAccumulatedMs = 0
    private var qualifyingSinceMs: Int?
    private var reachedViewable = false

    public init(isVideo: Bool = false) {
        self.isVideo = isVideo
    }

    var thresholdMs: Int { isVideo ? Self.videoThresholdMs : Self.displayThresholdMs }

    /// La fraction visible a changé à `atMs` (0 = hors écran).
    public mutating func note(fraction: Double, atMs: Int) {
        let clamped = SocialEventsV2Wire.fraction(fraction)
        maxVisibleFraction = max(maxVisibleFraction, clamped)
        settle(atMs: atMs)
        if clamped > 0 {
            visibleSinceMs = visibleSinceMs ?? atMs
        } else if let since = visibleSinceMs {
            visibleAccumulatedMs += max(0, atMs - since)
            visibleSinceMs = nil
        }
        if clamped >= Self.minFraction {
            qualifyingSinceMs = qualifyingSinceMs ?? atMs
        } else {
            qualifyingSinceMs = nil
        }
    }

    private mutating func settle(atMs: Int) {
        guard let since = qualifyingSinceMs, atMs - since >= thresholdMs else { return }
        reachedViewable = true
    }

    public func isViewable(atMs: Int) -> Bool {
        var copy = self
        copy.settle(atMs: atMs)
        return copy.reachedViewable
    }

    public func visibleMs(atMs: Int) -> Int {
        visibleAccumulatedMs + (visibleSinceMs.map { max(0, atMs - $0) } ?? 0)
    }

    public func measure(atMs: Int, impressionEventId: String? = nil) -> SocialVisibility {
        SocialVisibility(
            maxVisibleFraction: maxVisibleFraction,
            visibleMs: visibleMs(atMs: atMs),
            viewable: isViewable(atMs: atMs),
            impressionEventId: impressionEventId
        )
    }

    /// La part d'un cadre dans la fenêtre visible, 0…1.
    public static func visibleFraction(of frame: CGRect, in viewport: CGRect) -> Double {
        let area = frame.width * frame.height
        guard area > 0 else { return 0 }
        let overlap = frame.intersection(viewport)
        guard !overlap.isNull else { return 0 }
        return Double(overlap.width * overlap.height / area)
    }

    /// Le pas de la part relayée par une cellule : 5 %.
    public static let fractionStepPercent = 5

    /// La même part, ramenée au pas : pendant un défilement, une cellule ne
    /// relaie que ses changements de palier, pas chaque image. Les seuils du
    /// MRC (0 et 50 %) tombent sur un palier.
    public static func steppedFraction(of frame: CGRect, in viewport: CGRect) -> Double {
        let percent = Int((visibleFraction(of: frame, in: viewport) * 100 + 1e-9).rounded(.down))
        return Double(percent / fractionStepPercent * fractionStepPercent) / 100
    }
}
