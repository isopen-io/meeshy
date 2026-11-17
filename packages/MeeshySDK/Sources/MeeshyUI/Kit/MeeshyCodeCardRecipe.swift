import Foundation

/// Les trois présentations : verre qui s'incline, claire à plat (image, impression),
/// et le cadre de visée posé sur l'image de l'hôte.
public nonisolated enum MeeshyCodeCardStyle: String, Sendable, Equatable, CaseIterable {
    case glass
    case plain
    case reticle
}

/// Les trois côtés du code : 72, 160 et 220. Pas de côté libre.
public nonisolated enum MeeshyCodeCardSize: String, Sendable, Equatable, CaseIterable {
    case mini
    case compact
    case large

    public var side: Double {
        switch self {
        case .mini: return 72
        case .compact: return 160
        case .large: return 220
        }
    }
}

/// D'où vient l'inclinaison : le capteur, le pointeur, ou rien (carte droite).
public nonisolated enum MeeshyCodeCardTilt: String, Sendable, Equatable, CaseIterable {
    case device
    case pointer
    case none
}

/// Ce que l'angle donne : le pivot borné, la place du reflet et les deux glissements.
public nonisolated struct MeeshyCodeCardMotion: Sendable, Equatable {
    public let yaw: Double
    public let pitch: Double
    public let reflectionPosition: Double
    public let plateShift: Double
    public let centerShift: Double

    public static let flat = MeeshyCodeCardMotion(yaw: 0, pitch: 0, reflectionPosition: 40, plateShift: 0, centerShift: 0)
}

/// **La recette de K31 en VALEURS** : les côtés, les marges, les rayons, la largeur
/// de la carte, la présence de la pastille et de la légende, l'inclinaison bornée
/// (une fonction pure de l'angle) et la teinte servie à 4,5:1 sur la plaque. La
/// plaque et l'encre des modules ne dépendent pas du thème.
public nonisolated struct MeeshyCodeCardRecipe: Sendable, Equatable {

    public static let yawLimit: Double = 16
    public static let pitchLimit: Double = 6
    public static let plateShiftReach: Double = 7
    public static let centerShiftReach: Double = 13
    public static let reflectionRest: Double = 40
    public static let reflectionSweep: Double = 72
    public static let cardChrome: Double = 98
    public static let cardRadius: Double = 34
    public static let quietModules: Int = 4
    public static let moduleShare: Double = 0.86
    public static let moduleCornerShare: Double = 0.36
    public static let eyeModules: Int = 7
    public static let centerShare: Double = 0.25
    public static let centerMinimumSide: Double = 120
    public static let tintContrast: Double = 4.5
    public static let glassPlateHex = "F5F3FF"
    public static let glassInkHex = "1B1140"

    public let style: MeeshyCodeCardStyle
    public let size: MeeshyCodeCardSize
    public let side: Double
    public let plateMargin: Double
    public let plateRadius: Double
    public let cardWidth: Double
    public let tilt: MeeshyCodeCardTilt
    public let isGlass: Bool
    public let hasReflection: Bool
    public let hasCenter: Bool
    public let hasCaption: Bool
    public let showsSkeleton: Bool

    public static func resolve(
        style: MeeshyCodeCardStyle,
        size: MeeshyCodeCardSize,
        tilt: MeeshyCodeCardTilt = .device,
        isReady: Bool = true,
        reduceMotion: Bool = false
    ) -> MeeshyCodeCardRecipe {
        let isGlass = style == .glass && size != .mini
        let flat = !isGlass || reduceMotion
        let resolvedTilt: MeeshyCodeCardTilt = flat ? .none : tilt
        let margin = plateMargin(for: size)
        return MeeshyCodeCardRecipe(
            style: style,
            size: size,
            side: size.side,
            plateMargin: margin,
            plateRadius: plateRadius(for: size),
            cardWidth: size == .mini ? size.side + margin * 2 : size.side + cardChrome,
            tilt: resolvedTilt,
            isGlass: isGlass,
            hasReflection: isGlass && resolvedTilt != .none,
            hasCenter: size != .mini && size.side >= centerMinimumSide,
            hasCaption: size != .mini,
            showsSkeleton: !isReady
        )
    }

    /// L'inclinaison : le pivot est borné à ±16° en lacet et ±6° en tangage ; à
    /// plat, rien ne bouge. Le reflet balaie de 112 % à −32 % de la carte.
    public static func motion(yaw: Double, pitch: Double) -> MeeshyCodeCardMotion {
        let boundedYaw = bounded(yaw, limit: yawLimit)
        let boundedPitch = bounded(pitch, limit: pitchLimit)
        let share = boundedYaw / yawLimit
        return MeeshyCodeCardMotion(
            yaw: boundedYaw,
            pitch: boundedPitch,
            reflectionPosition: reflectionRest - share * reflectionSweep,
            plateShift: -share * plateShiftReach,
            centerShift: -share * centerShiftReach
        )
    }

    /// Le côté de la pastille : 25 % du code, absente sous 120.
    public static func centerSide(forSide side: Double) -> Double {
        side < centerMinimumSide ? 0 : (side * centerShare).rounded()
    }

    public static func plateColor(style: MeeshyCodeCardStyle) -> MeeshyKitRGB {
        style == .plain ? .white : (MeeshyKitRGB(hex: glassPlateHex) ?? .white)
    }

    public static func inkColor(style: MeeshyCodeCardStyle) -> MeeshyKitRGB {
        style == .plain ? .black : (MeeshyKitRGB(hex: glassInkHex) ?? .black)
    }

    /// La teinte servie : assombrie au besoin jusqu'à 4,5:1 sur la plaque.
    public static func servedTint(_ tint: MeeshyKitRGB, style: MeeshyCodeCardStyle) -> MeeshyKitRGB {
        tint.darkened(toContrast: tintContrast, on: plateColor(style: style))
    }

    public static func plateMargin(for size: MeeshyCodeCardSize) -> Double {
        switch size {
        case .mini: return 6
        case .compact: return 12
        case .large: return 16
        }
    }

    public static func plateRadius(for size: MeeshyCodeCardSize) -> Double {
        switch size {
        case .mini: return 14
        case .compact: return 22
        case .large: return 28
        }
    }

    private static func bounded(_ value: Double, limit: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, -limit), limit)
    }
}
