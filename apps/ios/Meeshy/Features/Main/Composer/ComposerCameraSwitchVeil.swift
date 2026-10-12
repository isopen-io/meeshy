import CoreGraphics
import Foundation

/// **La bascule d'objectif ne fige jamais rien à l'écran** (#10337, porteur
/// 2026-10-12 : « la bascule doit être FLUIDE, sans jamais figer ni dans une
/// vignette de cadre ni dans la scène »).
///
/// Mesuré sur iPhone 16 Pro Max : « camera switch to back: 381–458 ms », tout
/// dans `commitConfiguration` — le temps où l'objectif ne sert aucune trame.
/// Ce temps ne se voit plus : dès le toucher, la scène ET les vignettes se
/// voilent (flou, fondu, léger recul, comme l'appareil photo d'Apple), et se
/// dévoilent sur le nouvel objectif. Réduire les animations garde le flou et le
/// fondu, sans le recul.
nonisolated enum ComposerCameraSwitchVeil {
    static let blurRadius: CGFloat = 24
    static let veiledOpacity: Double = 0.7
    static let veiledScale: CGFloat = 0.96
    static let fadeIn: TimeInterval = 0.12
    static let fadeOut: TimeInterval = 0.25

    static func blur(switching: Bool) -> CGFloat { switching ? blurRadius : 0 }
    static func opacity(switching: Bool) -> Double { switching ? veiledOpacity : 1 }
    static func scale(switching: Bool, reduceMotion: Bool) -> CGFloat {
        switching && !reduceMotion ? veiledScale : 1
    }
    /// Le voile se pose vite et se lève en douceur, sur la première trame neuve.
    static func duration(switching: Bool) -> TimeInterval { switching ? fadeIn : fadeOut }
}
