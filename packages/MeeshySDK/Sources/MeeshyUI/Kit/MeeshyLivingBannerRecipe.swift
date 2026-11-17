import SwiftUI

/// Les formes de la bannière : l'en-tête, le fond sans cadre, le voile
/// transparent vers le bas, et le remplissage d'une carte (une seule orbe).
public nonisolated enum MeeshyLivingBannerMode: String, Sendable, Equatable, CaseIterable {
    case banner
    case ambient
    case veil
    case fill
}

/// Ce qui bouge : le flottement et le capteur, le flottement seul, ou rien.
public nonisolated enum MeeshyLivingBannerMotion: String, Sendable, Equatable, CaseIterable {
    case on
    case reduced
    case off
}

/// Les trois jalons de hauteur : barre, carte, héros.
public nonisolated enum MeeshyLivingBannerHeight {
    public static let bar: Double = 96
    public static let card: Double = 130
    public static let hero: Double = 318
}

/// Une orbe en VALEURS : disque, flou, opacité, et ce que l'inclinaison la décale.
public nonisolated struct MeeshyLivingBannerOrb: Sendable, Equatable {
    public let diameter: Double
    public let blur: Double
    public let opacity: Double
    public let hueShift: Double
    public let parallaxReach: Double
}

/// **La recette de K27 en VALEURS** : les arrêts du dégradé, les deux orbes, le
/// fondu, le voile de l'image, la hauteur courante, et la loi du capteur. Aucune
/// couleur : la teinte entre, les parts d'opacité sortent.
public nonisolated struct MeeshyLivingBannerRecipe: Sendable, Equatable {

    public static let gradientAngle: Double = 165
    public static let fadeShare: Double = 0.38
    public static let imageVeilOpacity: Double = 0.42
    public static let imageOrbOpacity: Double = 0.12
    public static let tiltFullDegrees: Double = 15
    public static let nearReach: Double = 12
    public static let farReach: Double = -6
    public static let floatPeriod: Double = 9
    public static let floatDriftX: Double = 18
    public static let floatDriftY: Double = 14
    public static let floatScale: Double = 1.12

    private static let darkStops: [Double] = [0.72, 0.34, 0]
    private static let lightStops: [Double] = [0.52, 0.20, 0]

    /// Les parts de la teinte aux trois arrêts ; le dernier est le fond de l'écran.
    public let stopShares: [Double]
    public let near: MeeshyLivingBannerOrb
    public let far: MeeshyLivingBannerOrb
    public let height: Double
    public let fadeHeight: Double
    public let fadeOpacity: Double
    public let imageVeil: Double
    public let showsFade: Bool
    public let isDesaturated: Bool
    public let floats: Bool
    public let usesSensor: Bool

    public static func resolve(
        mode: MeeshyLivingBannerMode,
        isDark: Bool,
        hasImage: Bool,
        isMuted: Bool,
        motion: MeeshyLivingBannerMotion,
        height: Double = MeeshyLivingBannerHeight.hero,
        collapse: Double = 0,
        isVisible: Bool = true,
        systemReduceMotion: Bool = false
    ) -> MeeshyLivingBannerRecipe {
        let progress = clampedCollapse(collapse)
        let reduced = motion == .reduced || systemReduceMotion
        let animated = motion != .off && !isMuted && isVisible
        let nearOpacity = orbOpacity(isDark: isDark, near: true, hasImage: hasImage, mode: mode)
        let farOpacity = orbOpacity(isDark: isDark, near: false, hasImage: hasImage, mode: mode)
        let current = currentHeight(height, collapse: progress)
        let hasFade = mode == .banner || mode == .veil
        return MeeshyLivingBannerRecipe(
            stopShares: isDark ? darkStops : lightStops,
            near: MeeshyLivingBannerOrb(diameter: 220, blur: 28, opacity: nearOpacity, hueShift: 0,
                                        parallaxReach: nearReach),
            far: MeeshyLivingBannerOrb(diameter: mode == .fill ? 0 : 180, blur: 28,
                                       opacity: farOpacity * (1 - progress), hueShift: -30,
                                       parallaxReach: farReach),
            height: current,
            fadeHeight: current * fadeShare,
            fadeOpacity: hasFade ? 1 - progress : 0,
            imageVeil: hasImage ? imageVeilOpacity : 0,
            showsFade: hasFade,
            isDesaturated: isMuted,
            floats: animated,
            usesSensor: animated && !reduced && mode != .fill
        )
    }

    /// La loi du capteur : il ne tourne que si le mouvement est `on`, la bannière
    /// visible, non atténuée, et que le mouvement n'est pas réduit.
    public static func shouldRunSensor(motion: MeeshyLivingBannerMotion, isVisible: Bool, isMuted: Bool,
                                       reduceMotion: Bool) -> Bool {
        motion == .on && isVisible && !isMuted && !reduceMotion
    }

    /// L'avancée du repli, bornée de 0 à 1 ; un non-nombre vaut 0.
    public static func clampedCollapse(_ collapse: Double) -> Double {
        guard collapse.isFinite else { return 0 }
        return min(max(collapse, 0), 1)
    }

    /// La hauteur courante : la hauteur donnée, ramenée à la barre quand elle se replie.
    public static func currentHeight(_ height: Double, collapse: Double) -> Double {
        guard height > MeeshyLivingBannerHeight.bar else { return height }
        return height + (MeeshyLivingBannerHeight.bar - height) * clampedCollapse(collapse)
    }

    /// La parallaxe : ±15° donnent ±12 px à l'orbe proche et ±6 px, à contresens, à
    /// la lointaine ; au-delà, ça plafonne. À plat, rien ne bouge.
    public static func parallax(tiltDegrees: Double) -> (near: Double, far: Double) {
        guard tiltDegrees.isFinite else { return (0, 0) }
        let share = min(max(tiltDegrees / tiltFullDegrees, -1), 1)
        return (share * nearReach, share * farReach)
    }

    private static func orbOpacity(isDark: Bool, near: Bool, hasImage: Bool, mode: MeeshyLivingBannerMode) -> Double {
        if hasImage { return imageOrbOpacity }
        let base: Double
        switch (isDark, near) {
        case (true, true): base = 0.75
        case (true, false): base = 0.70
        case (false, true): base = 0.50
        case (false, false): base = 0.40
        }
        return mode == .fill && !near ? 0 : base
    }
}
