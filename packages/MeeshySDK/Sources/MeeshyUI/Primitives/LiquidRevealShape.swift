import SwiftUI

// MARK: - Liquid Reveal Shape

/// Atome de masque "vague liquide" : un disque dont le bord est ondulé par une
/// sinusoïde, qui naît minuscule à un point (`center`) et grandit jusqu'à
/// couvrir tout le rect quand `progress` passe de 0 à 1.
///
/// Pur, opaque, agnostique du produit — aucune connaissance de Reels / feed /
/// singleton. Utilisé comme `mask` SwiftUI au-dessus d'une vue réelle pour
/// produire un "circular reveal" liquide. iOS 16-compatible, GPU-léger (un seul
/// `Path` polygonal, pas de shader).
///
/// Géométrie :
///  - `center` (UnitPoint) → point écran `(rect.w·x, rect.h·y)`, le foyer du reveal.
///  - `baseRadius` → rayon du disque à `progress = 0` (≈ rayon du bouton source).
///  - le rayon courant interpole `baseRadius → maxRadius` (distance au coin le plus
///    éloigné + marge d'amplitude) ⇒ `progress = 1` couvre TOUT le rect.
///  - `amplitude` / `frequency` / `phase` → vague sinusoïdale du bord. L'amplitude
///    est enveloppée par `sin(progress·π)` : nulle aux deux extrémités (disque net
///    fermé ET plein écran net), maximale à mi-parcours ⇒ l'ondulation ne vit que
///    pendant l'expansion.
///
/// `animatableData` pilote `progress` → animer la valeur anime le reveal.
public struct LiquidRevealShape: Shape {
    /// Foyer du reveal en coordonnées normalisées (0–1) du rect.
    public var center: UnitPoint
    /// 0 = disque fermé (≈ baseRadius), 1 = plein écran.
    public var progress: Double
    /// Rayon du disque à `progress = 0` (typiquement le rayon du bouton source).
    public var baseRadius: CGFloat
    /// Amplitude crête de la vague (points). Enveloppée par `sin(progress·π)`.
    public var amplitude: CGFloat
    /// Nombre de lobes de la vague sur le tour complet (≈ ondes visibles).
    public var frequency: Double
    /// Décalage de phase de la vague (radians) — animer pour faire "couler" le bord.
    public var phase: Double

    /// Densité d'échantillonnage du contour. 120 segments = bord lisse à l'œil,
    /// négligeable pour le GPU.
    private let segments = 120

    public init(
        center: UnitPoint,
        progress: Double,
        baseRadius: CGFloat = 26,
        amplitude: CGFloat = 14,
        frequency: Double = 9,
        phase: Double = 0
    ) {
        self.center = center
        self.progress = progress
        self.baseRadius = baseRadius
        self.amplitude = amplitude
        self.frequency = frequency
        self.phase = phase
    }

    public var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    public nonisolated func path(in rect: CGRect) -> Path {
        let clamped = min(max(progress, 0), 1)
        let focus = CGPoint(x: rect.width * center.x, y: rect.height * center.y)

        // Distance au coin le plus éloigné : à progress = 1 le disque doit
        // l'englober, donc on l'ajoute à l'amplitude comme marge de sûreté pour
        // que même un creux de vague reste hors-écran.
        let farthestCorner = maxDistanceToCorner(from: focus, in: rect)
        let maxRadius = farthestCorner + amplitude + 2
        let bareRadius = baseRadius + (maxRadius - baseRadius) * CGFloat(clamped)

        // Enveloppe : 0 aux extrémités, 1 au milieu ⇒ disque net fermé/plein écran,
        // vague uniquement pendant l'expansion.
        let envelope = CGFloat(sin(clamped * .pi))
        let waveAmplitude = amplitude * envelope

        var path = Path()
        let step = (2.0 * Double.pi) / Double(segments)
        for i in 0...segments {
            let angle = Double(i) * step
            let r = bareRadius + waveAmplitude * CGFloat(sin(frequency * angle + phase))
            let point = CGPoint(
                x: focus.x + r * CGFloat(cos(angle)),
                y: focus.y + r * CGFloat(sin(angle))
            )
            if i == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }

    private nonisolated func maxDistanceToCorner(from point: CGPoint, in rect: CGRect) -> CGFloat {
        let corners = [
            CGPoint(x: rect.minX, y: rect.minY),
            CGPoint(x: rect.maxX, y: rect.minY),
            CGPoint(x: rect.minX, y: rect.maxY),
            CGPoint(x: rect.maxX, y: rect.maxY)
        ]
        return corners.reduce(CGFloat(0)) { acc, corner in
            max(acc, hypot(corner.x - point.x, corner.y - point.y))
        }
    }
}
