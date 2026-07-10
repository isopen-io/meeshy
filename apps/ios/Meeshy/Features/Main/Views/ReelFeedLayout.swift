import CoreGraphics

/// Le média d'un réel détermine son rendu de fond dans le feed.
enum ReelMediaKind: Equatable {
    case video
    case audio
    case imageOnly
}

/// Frame d'une carte réel rapportée au coordinateur d'autoplay (espace global).
struct ReelFrame: Equatable {
    let id: String
    let midY: CGFloat
    let height: CGFloat
    let kind: ReelMediaKind
}

/// Hauteur d'une carte réel : proportionnelle au ratio du média, bornée entre
/// 4:3 (paysage, plancher 0.75) et 4:5 (vertical, plafond 1.25). Le média est
/// affiché en aspect-fill et remplit toute la carte ; un 9:16 est donc recadré.
/// Dimensions absentes (audio) → ratio par défaut 4:5.
func reelCardHeight(
    mediaWidth: Int?,
    mediaHeight: Int?,
    cardWidth: CGFloat,
    maxTallRatio: CGFloat = 1.25,
    minRatio: CGFloat = 0.75
) -> CGFloat {
    guard let w = mediaWidth, let h = mediaHeight, w > 0, h > 0 else {
        return (cardWidth * maxTallRatio).rounded()
    }
    let ratio = CGFloat(h) / CGFloat(w)
    let clamped = min(max(ratio, minRatio), maxTallRatio)
    return (cardWidth * clamped).rounded()
}

/// Élit l'id du réel dont le centre est le plus proche du centre du viewport,
/// parmi les réels suffisamment visibles (fraction ≥ `minVisibleFraction`).
/// `nil` si aucun réel ne franchit le seuil.
func mostCenteredReel(
    frames: [ReelFrame],
    viewportMinY: CGFloat,
    viewportMaxY: CGFloat,
    minVisibleFraction: CGFloat = 0.5
) -> String? {
    let viewportMid = (viewportMinY + viewportMaxY) / 2
    var best: (id: String, distance: CGFloat)?
    for f in frames where f.height > 0 {
        let top = f.midY - f.height / 2
        let bottom = f.midY + f.height / 2
        let visible = max(0, min(bottom, viewportMaxY) - max(top, viewportMinY))
        let fraction = visible / f.height
        guard fraction >= minVisibleFraction else { continue }
        let distance = abs(f.midY - viewportMid)
        if best == nil || distance < best!.distance {
            best = (f.id, distance)
        }
    }
    return best?.id
}
