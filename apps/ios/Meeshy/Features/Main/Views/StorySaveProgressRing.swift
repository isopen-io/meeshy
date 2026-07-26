import SwiftUI
import MeeshyUI

// MARK: - StorySaveProgressRing

/// Anneau de progression d'une sauvegarde de story vers la photothèque.
/// Partagé par la ligne « Mes stories » (`MyStoryRow.saveRing(progress:)`) et
/// le rail d'actions du reader (`StoryActionSidebarView`) : une seule
/// définition, sinon les deux rendus divergeraient dès la première retouche
/// (épaisseur, arrondi, sens de rotation).
struct StorySaveProgressRing: View {
    let progress: Double
    var tint: Color
    var diameter: CGFloat = 28

    /// Ramène une progression quelconque dans `0...1` — pure, statique et
    /// testable sans instancier de vue SwiftUI (`StorySaveProgressRingTests`).
    static func clamp(_ progress: Double) -> Double {
        min(max(progress, 0), 1)
    }

    /// Pourcentage entier affiché au centre de l'anneau, arrondi au plus
    /// proche — dérivé de la MÊME fonction pure `clamp(_:)` que le trim du
    /// cercle ci-dessous, pour que le chiffre affiché et la portion tracée ne
    /// divergent jamais l'un de l'autre.
    static func percent(_ progress: Double) -> Int {
        Int((clamp(progress) * 100).rounded())
    }

    private var clamped: Double { Self.clamp(progress) }

    var body: some View {
        ZStack {
            Circle().stroke(Color.secondary.opacity(0.25), lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: clamped)
                .stroke(tint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.2), value: clamped)
            Text("\(Self.percent(progress))")
                .font(MeeshyFont.relative(9, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundColor(.secondary)
        }
        .frame(width: diameter, height: diameter)
    }
}
