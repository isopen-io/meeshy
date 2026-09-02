import Foundation

// MARK: - Sticker Animation

/// **Le mouvement d'une décoration — une fonction PURE du temps** (#4821).
///
/// ## Pourquoi une fonction et pas une `CAAnimation`
///
/// Le lecteur rebâtit l'arbre de couches à chaque tick (`StoryRenderer.render
/// (at:)`, 60 Hz), et l'export le rasterise image par image par
/// `layer.render(in:)` — qui IGNORE le moteur d'animation de Core Animation.
/// Une `CAAnimation` bougerait donc au lecteur et resterait figée dans le MP4.
/// Une pose calculée à `t` et posée sur la couche à chaque tick, elle, est
/// identique partout : story, post embarqué, réel, export — la loi 6 (« le
/// lecteur EST l'aperçu ») appliquée au mouvement.
///
/// ## Ce que ce type ne sait pas
///
/// Ni UIKit, ni Core Animation, ni l'horloge : il REÇOIT un temps et rend une
/// pose. C'est ce qui le rend testable au seconde près, et ce qui garantit
/// qu'une même story donne les mêmes images à deux lecteurs.
///
/// ## Le contrat des courbes
///
/// - `pose(at: 0)` est l'IDENTITÉ pour toute animation : une vignette, un
///   composite ou une image de couverture — rendus à `t = 0` — montrent la
///   décoration telle que l'auteur l'a posée ;
/// - une animation CONTINUE est périodique (`period`) ; une animation en UN
///   COUP (`isOneShot`) joue une fois à l'apparition puis se tient immobile ;
/// - toute pose est BORNÉE : l'échelle reste dans [0,7 ; 1,3], le décalage
///   sous 20 % du côté, l'opacité au-dessus de 0,4 — une décoration animée ne
///   quitte jamais l'endroit où l'auteur l'a mise.
public enum StickerAnimation: String, Codable, CaseIterable, Sendable {
    /// Gonfle et dégonfle doucement.
    case pulse
    /// Deux battements rapprochés, comme un cœur.
    case heartbeat
    /// Oscille de gauche à droite autour de son centre.
    case wobble
    /// Rebondit vers le haut et retombe.
    case bounce
    /// Flotte lentement, comme suspendue.
    case float
    /// Tourne sur elle-même, sans fin.
    case spin
    /// Clignote, comme une enseigne.
    case blink
    /// Tremble vite et court.
    case shake
    /// Se balance amplement, comme une pancarte pendue.
    case swing
    /// UN COUP — gonfle à l'apparition puis se tient.
    case pop
    /// UN COUP — un « tada » : gonfle et frétille, puis se tient.
    case tada

    // MARK: La pose

    /// Ce qu'une animation FAIT à une décoration à un instant donné. Les
    /// décalages sont des FRACTIONS du côté rendu — indépendants de l'échelle
    /// de pose et de la taille de l'écran.
    public struct Pose: Equatable, Sendable {
        public var scale: Double
        public var rotationDegrees: Double
        /// Fraction de la largeur rendue ; positif = vers la droite.
        public var offsetX: Double
        /// Fraction de la hauteur rendue ; positif = vers le bas.
        public var offsetY: Double
        public var opacity: Double

        public static let identity = Pose(scale: 1, rotationDegrees: 0,
                                          offsetX: 0, offsetY: 0, opacity: 1)

        public init(scale: Double = 1, rotationDegrees: Double = 0,
                    offsetX: Double = 0, offsetY: Double = 0, opacity: Double = 1) {
            self.scale = scale
            self.rotationDegrees = rotationDegrees
            self.offsetX = offsetX
            self.offsetY = offsetY
            self.opacity = opacity
        }

        public var isIdentity: Bool { self == .identity }
    }

    // MARK: Le temps

    /// La durée d'un cycle, en secondes — ou celle du coup unique.
    public var period: Double {
        switch self {
        case .pulse: return 1.4
        case .heartbeat: return 1.1
        case .wobble: return 1.6
        case .bounce: return 1.2
        case .float: return 3.0
        case .spin: return 4.0
        case .blink: return 1.2
        case .shake: return 0.8
        case .swing: return 2.2
        case .pop: return 0.6
        case .tada: return 0.9
        }
    }

    /// Joue UNE fois à l'apparition, puis se tient immobile.
    public var isOneShot: Bool {
        switch self {
        case .pop, .tada: return true
        default: return false
        }
    }

    /// La pose à `seconds` depuis l'APPARITION de la décoration (son
    /// `startTime`, ou le début de la slide).
    public func pose(at seconds: Double) -> Pose {
        guard seconds.isFinite, seconds > 0 else { return .identity }
        if isOneShot, seconds >= period { return .identity }
        let phase = isOneShot
            ? seconds / period
            : seconds.truncatingRemainder(dividingBy: period) / period
        return pose(atPhase: phase)
    }

    /// La courbe elle-même, sur une phase dans [0, 1).
    private func pose(atPhase p: Double) -> Pose {
        let tour = 2 * Double.pi * p
        switch self {
        case .pulse:
            return Pose(scale: 1 + 0.10 * (1 - cos(tour)) / 2)
        case .heartbeat:
            let premier = Self.bosse(p, centre: 0.18, largeur: 0.06)
            let second = Self.bosse(p, centre: 0.36, largeur: 0.06)
            return Pose(scale: 1 + 0.14 * premier + 0.10 * second)
        case .wobble:
            return Pose(rotationDegrees: 8 * sin(tour))
        case .bounce:
            return Pose(offsetY: -0.14 * sin(Double.pi * p))
        case .float:
            return Pose(offsetY: -0.06 * sin(tour))
        case .spin:
            return Pose(rotationDegrees: 360 * p)
        case .blink:
            return Pose(opacity: 1 - 0.6 * (1 - cos(tour)) / 2)
        case .shake:
            return Pose(offsetX: 0.035 * sin(4 * tour))
        case .swing:
            return Pose(rotationDegrees: 14 * sin(tour))
        case .pop:
            return Pose(scale: 1 + 0.25 * sin(Double.pi * p))
        case .tada:
            return Pose(scale: 1 + 0.12 * sin(Double.pi * p),
                        rotationDegrees: 6 * sin(2 * tour) * (1 - p))
        }
    }

    /// Une bosse gaussienne centrée sur `centre`, nulle loin de lui.
    private static func bosse(_ p: Double, centre: Double, largeur: Double) -> Double {
        let écart = (p - centre) / largeur
        return exp(-écart * écart)
    }
}
