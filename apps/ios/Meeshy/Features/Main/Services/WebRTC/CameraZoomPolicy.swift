//
//  CameraZoomPolicy.swift
//  Meeshy
//
//  #8441 — zoom de la caméra envoyée pendant un appel. Décisions pures : elles
//  ne voient que les nombres que l'appareil rapporte et ceux que l'utilisateur
//  lit. Deux échelles coexistent :
//  - l'échelle APPAREIL (`videoZoomFactor`) : sur un appareil virtuel qui
//    contient l'ultra grand-angle (triple, double grand-angle), 1.0 EST
//    l'ultra grand-angle et le grand-angle commute au premier seuil (2.0) ;
//  - l'échelle AFFICHÉE (« 0,5× · 1× · 3× ») : 1× est toujours le grand-angle,
//    comme dans l'app Appareil photo.
//

import CoreGraphics
import Foundation

/// Les objectifs qu'un appareil de capture réunit, du plus riche au plus simple.
nonisolated enum CameraLensKit: Equatable, Sendable {
    case triple
    case ultraWideWide
    case wideTele
    case single

    var includesUltraWide: Bool { self == .triple || self == .ultraWideWide }
}

/// Ce qu'un appareil de capture rapporte, projeté hors d'AVFoundation.
nonisolated struct CameraZoomDescriptor: Equatable, Sendable {
    let isFront: Bool
    let lenses: CameraLensKit
    let minAvailable: CGFloat
    let maxAvailable: CGFloat
    /// `virtualDeviceSwitchOverVideoZoomFactors`, échelle appareil.
    let switchOvers: [CGFloat]
    /// Center Stage actif : le système pilote le cadrage, le zoom est interdit.
    let isLocked: Bool
}

nonisolated enum CameraZoomStep: Equatable, Sendable {
    case increment
    case decrement
}

/// Les bornes et les crans d'UNE caméra, en échelle affichée.
nonisolated struct CameraZoomProfile: Equatable, Sendable {
    /// affiché = appareil × multiplicateur.
    let displayMultiplier: CGFloat
    let minDisplay: CGFloat
    let maxDisplay: CGFloat
    /// Les objectifs physiques (bascule optique), affichés.
    let lensStops: [CGFloat]
    /// Les crans de VoiceOver : objectifs + paliers numériques.
    let stops: [CGFloat]

    var baselineDisplay: CGFloat { clampedDisplay(1) }

    func clampedDisplay(_ display: CGFloat) -> CGFloat {
        min(max(display, minDisplay), maxDisplay)
    }

    func deviceFactor(forDisplay display: CGFloat) -> CGFloat {
        clampedDisplay(display) / displayMultiplier
    }

    /// Le pincement multiplie le facteur qu'on avait au début du geste.
    func display(forPinchScale scale: CGFloat, from start: CGFloat) -> CGFloat {
        clampedDisplay(start * max(scale, 0))
    }

    /// Au relâcher, un facteur tout proche d'un objectif s'y aimante : on finit
    /// sur une optique franche plutôt qu'à 2,9× numérique.
    func settled(_ display: CGFloat) -> CGFloat {
        let nearest = lensStops.first { abs(display - $0) / $0 <= CameraZoomPolicy.snapTolerance }
        return clampedDisplay(nearest ?? display)
    }

    func stepped(from display: CGFloat, _ step: CameraZoomStep) -> CGFloat {
        let tolerance = CameraZoomPolicy.stepTolerance
        switch step {
        case .increment:
            return stops.first { $0 > display * (1 + tolerance) } ?? maxDisplay
        case .decrement:
            return stops.last { $0 < display * (1 - tolerance) } ?? minDisplay
        }
    }
}

nonisolated enum CameraZoomPolicy {
    /// Au-delà, le numérique ne montre plus que du bruit à 720p.
    static let backDisplayCap: CGFloat = 10
    /// La caméra avant n'a qu'un objectif : tout est numérique.
    static let frontDisplayCap: CGFloat = 3
    static let digitalStops: [CGFloat] = [1, 2, 3, 5, 10]
    static let snapTolerance: CGFloat = 0.06
    static let stepTolerance: CGFloat = 0.01
    /// Puissances de deux par seconde : pendant le geste la rampe suit le doigt,
    /// au relâcher et au double-tap elle glisse.
    static let pinchRampRate: Float = 16
    static let settleRampRate: Float = 4

    /// Arrière : l'appareil virtuel le plus riche d'abord, pour que
    /// `videoZoomFactor` bascule seul d'un objectif à l'autre.
    static let backLensPreference: [CameraLensKit] = [.triple, .ultraWideWide, .wideTele, .single]

    static func profile(for descriptor: CameraZoomDescriptor) -> CameraZoomProfile? {
        guard !descriptor.isLocked,
              descriptor.minAvailable > 0,
              descriptor.maxAvailable > descriptor.minAvailable else { return nil }
        let multiplier = displayMultiplier(for: descriptor)
        let cap = descriptor.isFront ? frontDisplayCap : backDisplayCap
        let minDisplay = rounded(descriptor.minAvailable * multiplier)
        let maxDisplay = min(rounded(descriptor.maxAvailable * multiplier), cap)
        guard maxDisplay > minDisplay else { return nil }
        let inRange: (CGFloat) -> Bool = { $0 >= minDisplay && $0 <= maxDisplay }
        let ultraWide: [CGFloat] = descriptor.lenses.includesUltraWide ? [minDisplay] : []
        let optical = ultraWide + [1] + descriptor.switchOvers.map { rounded($0 * multiplier) }
        let lensStops = uniqueSorted(optical.filter(inRange))
        let stops = uniqueSorted((lensStops + digitalStops).filter(inRange))
        return CameraZoomProfile(
            displayMultiplier: multiplier,
            minDisplay: minDisplay,
            maxDisplay: maxDisplay,
            lensStops: lensStops,
            stops: stops
        )
    }

    /// « 0,5× », « 1× », « 2,4× » — une décimale au plus, dans la langue du lecteur.
    static func label(forDisplay display: CGFloat, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        let tenths = (Double(display) * 10).rounded() / 10
        let number = formatter.string(from: NSNumber(value: tenths)) ?? String(tenths)
        return number + "×"
    }

    private static func displayMultiplier(for descriptor: CameraZoomDescriptor) -> CGFloat {
        guard descriptor.lenses.includesUltraWide,
              let wideSwitchOver = descriptor.switchOvers.first,
              wideSwitchOver > 1 else { return 1 }
        return 1 / wideSwitchOver
    }

    private static func rounded(_ value: CGFloat) -> CGFloat {
        (value * 100).rounded() / 100
    }

    private static func uniqueSorted(_ values: [CGFloat]) -> [CGFloat] {
        Array(Set(values)).sorted()
    }
}
