import CoreGraphics
import Foundation

/// **Un visage tel qu'une lens le lit** (#11299) : la constellation de 76 repères
/// de Vision (révision 3), les régions qui servent les déclencheurs, et
/// l'orientation de la tête. Partagé par l'appel, la capture et les lens.
///
/// Repères NORMALISÉS À LA BOÎTE du visage, boîte normalisée à l'image (repère
/// de Vision, origine en bas à gauche). Angles en radians ; `nil` quand le
/// détecteur ne les rend pas.
public struct LensFaceFrame: Sendable, Equatable {
    public static let constellationCount = 76

    public let boundingBox: CGRect
    public let points: [CGPoint]
    public let leftEye: [CGPoint]
    public let rightEye: [CGPoint]
    public let innerLips: [CGPoint]
    /// Le contour extérieur des lèvres : sa largeur dit le sourire (#11301).
    public let outerLips: [CGPoint]
    public let leftEyebrow: [CGPoint]
    public let rightEyebrow: [CGPoint]
    public let yaw: Double?
    public let roll: Double?
    public let pitch: Double?

    public init(boundingBox: CGRect, points: [CGPoint], leftEye: [CGPoint], rightEye: [CGPoint],
                innerLips: [CGPoint], outerLips: [CGPoint] = [], leftEyebrow: [CGPoint] = [], rightEyebrow: [CGPoint] = [],
                yaw: Double?, roll: Double?, pitch: Double?) {
        self.boundingBox = boundingBox
        self.points = points
        self.leftEye = leftEye
        self.rightEye = rightEye
        self.innerLips = innerLips
        self.outerLips = outerLips
        self.leftEyebrow = leftEyebrow
        self.rightEyebrow = rightEyebrow
        self.yaw = yaw
        self.roll = roll
        self.pitch = pitch
    }

    public var hasFullConstellation: Bool { points.count == Self.constellationCount }
}

/// Ce qu'un visage peut déclencher dans une lens.
public enum LensFaceTrigger: String, Sendable, CaseIterable {
    case mouthOpen
    case eyesClosed
    case headTurned
    case headTilted
}

/// **Les déclencheurs d'une lens, lus sur le visage** (#11299). Une région se mesure
/// par son ouverture (hauteur / largeur) : un œil ouvert est vers 0,3, fermé
/// sous 0,15 ; des lèvres closes vers 0,05, une bouche ouverte au-delà de 0,35.
/// Un clin d'œil ne ferme pas « les yeux » : les deux doivent l'être.
public enum LensFaceTriggers {
    public static let mouthOpenRatio = 0.35
    public static let eyeClosedRatio = 0.15
    /// ≈ 20° de lacet.
    public static let turnRadians = 0.35
    /// ≈ 17° de roulis.
    public static let tiltRadians = 0.3

    public static func evaluate(_ face: LensFaceFrame) -> Set<LensFaceTrigger> {
        let bouche = opening(of: face.innerLips).map { $0 > mouthOpenRatio } ?? false
        let yeux = [opening(of: face.leftEye), opening(of: face.rightEye)]
        let fermes = yeux.allSatisfy { ouverture in ouverture.map { $0 < eyeClosedRatio } ?? false }
        let tourne = face.yaw.map { abs($0) > turnRadians } ?? false
        let penche = face.roll.map { abs($0) > tiltRadians } ?? false
        let actifs: [(LensFaceTrigger, Bool)] = [(.mouthOpen, bouche), (.eyesClosed, fermes),
                                                 (.headTurned, tourne), (.headTilted, penche)]
        return Set(actifs.filter { $0.1 }.map { $0.0 })
    }

    /// Hauteur / largeur d'une région ; `nil` si elle n'a pas d'étendue.
    public static func opening(of region: [CGPoint]) -> Double? {
        guard region.count >= 2,
              let gauche = region.map(\.x).min(), let droite = region.map(\.x).max(),
              let bas = region.map(\.y).min(), let haut = region.map(\.y).max(),
              droite - gauche > 0 else { return nil }
        return Double((haut - bas) / (droite - gauche))
    }
}
