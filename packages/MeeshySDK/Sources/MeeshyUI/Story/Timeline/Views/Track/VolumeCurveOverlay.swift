import SwiftUI
import MeeshySDK

/// Courbe d'automation du volume, tracée en LECTURE SEULE au-dessus d'une
/// piste.
///
/// L'édition se fait dans la fiche du clip : la piste ne fait que 52 pt de
/// haut et ses gestes servent déjà au déplacement et au rognage. Y ajouter une
/// saisie verticale entrerait en conflit avec eux.
struct VolumeCurveOverlay: View {

    let keyframes: [StoryKeyframe]
    let duration: Float
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            let pts = Self.points(keyframes: keyframes,
                                  duration: duration,
                                  size: geo.size)
            if pts.count >= 2 {
                Path { path in
                    path.move(to: pts[0])
                    for p in pts.dropFirst() { path.addLine(to: p) }
                }
                .stroke(tint, lineWidth: 1.5)

                ForEach(Array(pts.enumerated()), id: \.offset) { _, p in
                    Circle()
                        .fill(tint)
                        .frame(width: 4, height: 4)
                        .position(p)
                }
            }
        }
        // La courbe ne doit jamais intercepter un geste destiné au clip.
        .allowsHitTesting(false)
    }

    /// Résumé comparable des points de volume.
    ///
    /// `StoryKeyframe` n'est pas `Equatable` et les barres de piste sont
    /// montées avec `.equatable()` : sans ce résumé dans leur `==`, SwiftUI
    /// sauterait le corps et la courbe ne réapparaîtrait jamais après l'ajout
    /// d'un point. Seuls l'instant et le niveau comptent — l'identité du point
    /// ne change pas le tracé.
    nonisolated static func volumeSignature(_ keyframes: [StoryKeyframe]) -> [Float] {
        keyframes
            .compactMap { kf -> (Float, Float)? in
                guard let v = kf.volume else { return nil }
                return (kf.time, v)
            }
            .sorted { $0.0 < $1.0 }
            .flatMap { [$0.0, $0.1] }
    }

    /// Projette les points de volume dans le repère de la piste.
    ///
    /// `x` suit le temps, `y` est INVERSÉ — volume fort en haut, comme dans
    /// tous les éditeurs. Le niveau nominal (100 %) occupe le haut : c'est la
    /// référence que l'œil cherche, et un gain au-delà y reste collé plutôt que
    /// d'écraser toute la courbe vers le bas. La valeur exacte se lit dans la
    /// fiche ; la piste ne donne que la forme.
    nonisolated static func points(keyframes: [StoryKeyframe],
                                   duration: Float,
                                   size: CGSize) -> [CGPoint] {
        guard duration > 0 else { return [] }
        return keyframes
            .compactMap { kf -> (Float, Float)? in
                guard let v = kf.volume else { return nil }
                return (kf.time, v)
            }
            .sorted { $0.0 < $1.0 }
            .map { time, volume in
                let height = min(1, max(0, volume))
                return CGPoint(
                    x: CGFloat(min(1, max(0, time / duration))) * size.width,
                    y: (1 - CGFloat(height)) * size.height
                )
            }
    }
}
