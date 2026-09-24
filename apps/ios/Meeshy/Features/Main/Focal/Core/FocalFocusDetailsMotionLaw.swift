// apps/ios/Meeshy/Features/Main/Focal/Core/FocalFocusDetailsMotionLaw.swift

import CoreGraphics
import Foundation

/// **Quand la carte et les détails du message élu se posent-ils ?** (#7624)
///
/// L'élection suit le doigt à chaque frame : la loupe de l'élu est un
/// transform de calque, sans relayout. Mais sa CARTE et ses DÉTAILS (identité,
/// jour + heure, bande) passent par une reconfiguration de cellule — un
/// `apply` de snapshot, un rendu SwiftUI de deux rangées et, pour une rangée
/// sans ligne basse, une réserve de hauteur (#5648).
///
/// Mesuré au simulateur sur un fil long (« Meeshy Global », mode Focal) : un
/// seul fling franc arme la magnificence (`FocalMagnificationLaw`, 1 200 pt/s),
/// et l'élu change alors plusieurs fois par seconde. Chaque changement coûtait
/// une reconfiguration en plein momentum — 706 ms de fil principal sur 25 s de
/// flings (Time Profiler), et deux rangées qui changent de cote sous le doigt.
///
/// La loi DIFFÈRE, elle ne retire rien : au-delà d'une vitesse de lecture, la
/// carte et les détails attendent que le défilement ralentisse ; ils se posent
/// ENSEMBLE dès qu'il repasse sous le seuil, puis à la pose au plus tard
/// (`settleAtRest`). La directive 2026-08-22 (« les détails apparaissent AVEC
/// la carte ») reste tenue : les deux voyagent dans la même reconfiguration.
///
/// Loi PURE — la peau injecte la vitesse, comme `FocalMagnificationLaw`.
nonisolated enum FocalFocusDetailsMotionLaw {

    /// Vitesse (points/seconde, valeur absolue) au-delà de laquelle personne
    /// ne lit : on parcourt. Nettement sous le seuil d'armement de la
    /// magnificence (1 200) — la carte se pose dans la queue de la
    /// décélération, là où l'œil recommence à accrocher les lignes.
    static let maxRevealSpeed: CGFloat = 700

    static func revealsDetails(speed: CGFloat, maxSpeed: CGFloat = maxRevealSpeed) -> Bool {
        abs(speed) <= maxSpeed
    }
}

/// Vitesse de défilement tirée des offsets successifs de `scrollViewDidScroll`
/// — la seule mesure disponible pendant la DÉCÉLÉRATION, où le geste
/// (`panGestureRecognizer.velocity`) ne dit plus rien.
nonisolated struct ScrollSpeedMeter {

    /// Écart minimal entre deux échantillons pour en tirer une vitesse : deux
    /// rappels dans la même transaction (compensation d'offset) ne sont pas
    /// une vitesse infinie.
    static let minimumInterval: TimeInterval = 0.001

    private(set) var speed: CGFloat = 0
    private var last: (offset: CGFloat, time: TimeInterval)?

    mutating func note(offset: CGFloat, at time: TimeInterval) {
        defer { last = (offset, time) }
        guard let last else { return }
        let interval = time - last.time
        guard interval >= Self.minimumInterval else { return }
        speed = (offset - last.offset) / CGFloat(interval)
    }

    mutating func reset() {
        last = nil
        speed = 0
    }
}
