import CoreGraphics
import Foundation

/// Le trajet du voyage : `auto` choisit un arc quand le déplacement est en diagonale.
public nonisolated enum MeeshyAvatarMorphPath: String, Sendable, Equatable, CaseIterable {
    case auto
    case straight
    case arc
}

/// Comment le voyage se joue : partagé (par le temps), piloté (par `progress`), ou fondu (repli).
public nonisolated enum MeeshyAvatarMorphMode: String, Sendable, Equatable, CaseIterable {
    case shared
    case driven
    case crossfade
}

/// Le contour : le cercle seul sur iOS. Android donne un contour par état de l'hôte.
public nonisolated enum MeeshyAvatarMorphOutline: Sendable, Equatable {
    case circle
}

/// Les jalons de taille : barre, rangée, épingle, héros.
public nonisolated enum MeeshyAvatarMorphSize {
    public static let bar: Double = 36
    public static let row: Double = 44
    public static let pin: Double = 56
    public static let hero: Double = 112
}

/// Une extrémité du voyage : son centre et son diamètre dans le repère de la portée.
public nonisolated struct MeeshyAvatarMorphEnd: Sendable, Equatable {
    public let center: CGPoint
    public let diameter: Double

    public init(center: CGPoint, diameter: Double) {
        self.center = center
        self.diameter = diameter
    }
}

/// **La recette de K29 en VALEURS** : le mode, le trajet résolu, l'arc, l'échelle de
/// départ, la durée (celle de `travel`, K26), les mesures de l'anneau et de la pastille
/// et leur opacité en vol. K29 transporte, il ne dessine rien.
public nonisolated struct MeeshyAvatarMorphRecipe: Sendable, Equatable {

    public static let ringGapShare: Double = 0.045
    public static let ringGapMinimum: Double = 2
    public static let badgeShare: Double = 0.25
    public static let badgeMinimum: Double = 14
    public static let badgeLeadMilliseconds = 80
    public static let badgeLagMilliseconds = 120
    public static let arcDiagonalThreshold: Double = 0.25
    public static let arcBulge: Double = 0.25

    public let mode: MeeshyAvatarMorphMode
    public let resolvedPath: MeeshyAvatarMorphPath
    public let startScale: Double
    public let endScale: Double
    public let durationMilliseconds: Int
    public let from: CGPoint
    public let to: CGPoint
    public let control: CGPoint

    public static func resolve(from: MeeshyAvatarMorphEnd,
                               to: MeeshyAvatarMorphEnd,
                               path: MeeshyAvatarMorphPath,
                               progress: Double?,
                               reduceMotion: Bool,
                               hasScope: Bool) -> MeeshyAvatarMorphRecipe {
        let mode: MeeshyAvatarMorphMode = !hasScope || reduceMotion ? .crossfade : (progress != nil ? .driven : .shared)
        let resolved = mode == .crossfade ? MeeshyAvatarMorphPath.straight : resolvedPath(path, from: from.center, to: to.center)
        return MeeshyAvatarMorphRecipe(
            mode: mode,
            resolvedPath: resolved,
            startScale: to.diameter > 0 ? from.diameter / to.diameter : 1,
            endScale: 1,
            durationMilliseconds: MeeshyMotionRecipe.resolve(token: .travel).durationMilliseconds,
            from: from.center,
            to: to.center,
            control: resolved == .arc ? controlPoint(from: from.center, to: to.center) : midpoint(from.center, to.center)
        )
    }

    private static func resolvedPath(_ path: MeeshyAvatarMorphPath, from: CGPoint, to: CGPoint) -> MeeshyAvatarMorphPath {
        guard path == .auto else { return path }
        let dx = abs(Double(to.x - from.x))
        let dy = abs(Double(to.y - from.y))
        let longest = max(dx, dy)
        return longest > 0 && min(dx, dy) / longest >= arcDiagonalThreshold ? .arc : .straight
    }

    private static func midpoint(_ a: CGPoint, _ b: CGPoint) -> CGPoint {
        CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
    }

    private static func controlPoint(from: CGPoint, to: CGPoint) -> CGPoint {
        let dx = Double(to.x - from.x)
        let dy = Double(to.y - from.y)
        let distance = (dx * dx + dy * dy).squareRoot()
        guard distance > 0 else { return midpoint(from, to) }
        let middle = midpoint(from, to)
        let bulge = distance * arcBulge
        return CGPoint(x: Double(middle.x) - dy / distance * bulge, y: Double(middle.y) + dx / distance * bulge)
    }

    /// La position du centre en vol : la droite, ou la courbe quadratique de l'arc.
    public func position(atProgress progress: Double) -> CGPoint {
        let t = Self.clamped(progress: progress)
        guard resolvedPath == .arc else {
            return CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t)
        }
        let a = (1 - t) * (1 - t)
        let b = 2 * (1 - t) * t
        let c = t * t
        return CGPoint(x: a * from.x + b * control.x + c * to.x, y: a * from.y + b * control.y + c * to.y)
    }

    /// L'échelle en vol : du diamètre de départ à celui d'arrivée.
    public func scale(atProgress progress: Double) -> Double {
        let t = Self.clamped(progress: progress)
        return startScale + (endScale - startScale) * t
    }

    public static func clamped(progress: Double) -> Double {
        progress.isFinite ? min(max(progress, 0), 1) : 0
    }

    /// L'anneau est à 4,5 % de la taille, 2 au moins.
    public static func ringGap(diameter: Double) -> Double {
        max(diameter * ringGapShare, ringGapMinimum)
    }

    /// La pastille est à 25 % de la taille, 14 au moins.
    public static func badgeDiameter(diameter: Double) -> Double {
        max(diameter * badgeShare, badgeMinimum)
    }

    /// La pastille s'efface en vol, sauf si elle voyage : là avant le départ et après l'arrivée.
    public static func badgeOpacity(progress: Double, travels: Bool) -> Double {
        travels || progress <= 0 || progress >= 1 ? 1 : 0
    }

    public static func ringOpacity(progress: Double, travels: Bool) -> Double {
        badgeOpacity(progress: progress, travels: travels)
    }
}
