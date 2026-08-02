import SwiftUI
import MeeshyUI

// MARK: - StorySaveProgressRing

/// Anneau de progression d'une sauvegarde de story vers la photothèque,
/// rendu par le rail d'actions du reader (`StoryActionSidebarView`). Une
/// seule définition pour toute surface future — l'ancienne ligne « Mes
/// stories » (`MyStoryRow`, supprimée avec la migration en grille) le
/// partageait déjà.
struct StorySaveProgressRing: View {
    let progress: Double
    var tint: Color
    var diameter: CGFloat = 28
    /// `false` dès que l'écriture photothèque a commencé — voir
    /// `StoryPhotoSaveService.isCancellable(storyId:)`.
    ///
    /// La DÉCISION de rendu vit ici, pas chez l'appelant : le rail du reader
    /// ne transmet que le booléen du service — toute surface future fera de
    /// même, sinon les rendus divergeraient au premier ajustement.
    var isCancellable: Bool = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Phase du balayage indéterminé. Monotone (jamais remise à zéro), même
    /// patron que `SyncPill.dotPhase` : un `@State` déjà à sa valeur finale ne
    /// relancerait aucune animation à la réapparition suivante.
    @State private var sweepPhase: Double = 0

    // MARK: - Rendu résolu (pur)

    /// Teinte de l'arc de progression.
    enum ArcTint: Equatable {
        /// Encore annulable : l'anneau porte la couleur d'accent de sa surface.
        case accent
        /// Plus annulable : l'anneau perd sa couleur d'accent.
        case inert
    }

    /// Rendu dépendant de l'état, résolu par une fonction PURE — testable sans
    /// monter de vue SwiftUI, comme `clamp(_:)` / `percent(_:)`.
    struct Appearance: Equatable {
        let arcTint: ArcTint
        /// Balayage indéterminé superposé : la seule chose qui bouge encore
        /// pendant `StoryExportIntro.prepend` puis `StoryExportOutro.append`,
        /// deux passes AVFoundation qui ne publient AUCUNE progression —
        /// l'anneau y reste figé à `StorySaveProgressMapper.bakeShare` (90 %).
        let showsIndeterminateSweep: Bool

        /// Couleur effective de l'arc. `Color.secondary` est sémantique : elle
        /// s'adapte aux deux `colorScheme`, là où une teinte claire codée en
        /// dur deviendrait illisible en mode clair sur les surfaces de verre.
        func arcColor(accent: Color) -> Color {
            switch arcTint {
            case .accent: return accent
            case .inert: return .secondary
            }
        }
    }

    /// Le basculement « plus annulable » DOIT se voir.
    ///
    /// `.buttonStyle(.plain)` + `.disabled` ne produisent aucun changement
    /// visuel sur des `Shape` à couleur explicite : sans cette résolution,
    /// l'anneau restait rigoureusement identique une fois inerte — l'utilisateur
    /// tapait au même endroit, sans haptique, sans toast, sans rien.
    ///
    /// Sous `reduceMotion`, seul le balayage disparaît : la perte de la couleur
    /// d'accent, elle, subsiste — le signal ne dépend jamais d'une animation.
    static func appearance(isCancellable: Bool, reduceMotion: Bool) -> Appearance {
        guard !isCancellable else {
            return Appearance(arcTint: .accent, showsIndeterminateSweep: false)
        }
        return Appearance(arcTint: .inert, showsIndeterminateSweep: !reduceMotion)
    }

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
        let appearance = Self.appearance(isCancellable: isCancellable, reduceMotion: reduceMotion)
        ZStack {
            Circle().stroke(Color.secondary.opacity(0.25), lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: clamped)
                .stroke(appearance.arcColor(accent: tint), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.2), value: clamped)
            if appearance.showsIndeterminateSweep {
                // Court arc qui tourne sans fin par-dessus l'arc figé : l'export
                // continue (deux passes AVFoundation muettes), il n'est
                // simplement plus interruptible.
                Circle()
                    .trim(from: 0, to: 0.18)
                    .stroke(tint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .rotationEffect(.degrees(sweepPhase * 360 - 90))
                    .animation(.linear(duration: 1.1).repeatForever(autoreverses: false), value: sweepPhase)
                    .onAppear { sweepPhase += 1 }
            }
            Text("\(Self.percent(progress))")
                .font(MeeshyFont.relative(9, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundColor(.secondary)
        }
        .frame(width: diameter, height: diameter)
    }
}
