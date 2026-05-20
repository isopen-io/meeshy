import SwiftUI
import MeeshySDK

/// Overlay loader pour le reader stories. Affiche le ThumbHash du fond de la
/// slide plein écran + un spinner discret + le pourcentage de progression
/// pendant que la slide télécharge ses assets. Apparaît tant que `progress`
/// est sous le seuil (par défaut 20 %), fade out automatique au-dessus.
///
/// Conçu pour être monté en `ZStack` au-dessus de `StoryReaderRepresentable`
/// côté parent SwiftUI ; le composant ne se branche pas sur les KVO du canvas.
///
/// Spec : `2026-05-20-stories-video-layers-text-sprint-design.md` § 3.D.4.
@MainActor
public struct StoryReaderLoadingOverlay: View {
    /// Slide à afficher en placeholder ThumbHash. `nil` autorisé pour les cas
    /// où le caller n'a pas encore décodé la slide ; l'overlay tombe sur un
    /// fond noir + spinner.
    public let slide: StorySlide?
    /// Progression de chargement `[0, 1]`. À `1.0` l'overlay est invisible.
    public let progress: Double
    /// Seuil d'affichage : sous cette valeur l'overlay est rendu. Au-dessus,
    /// l'opacité tombe à 0 et l'overlay se retire au prochain tick.
    public let threshold: Double

    public init(slide: StorySlide?, progress: Double, threshold: Double = 0.20) {
        self.slide = slide
        self.progress = progress
        self.threshold = threshold
    }

    public var body: some View {
        ZStack {
            if let hash = slide?.effects.thumbHash,
               !hash.isEmpty,
               let img = UIImage.fromThumbHash(hash) {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .blur(radius: 8)
            } else {
                Color.black
            }

            VStack(spacing: 8) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white.opacity(0.85))
                Text("\(Int((progress.isFinite ? progress : 0) * 100))%")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.white.opacity(0.75))
            }
        }
        .opacity(progress >= threshold ? 0 : 1)
        .animation(.easeOut(duration: 0.25), value: progress >= threshold)
        .allowsHitTesting(progress < threshold)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(
            localized: "story.reader.loading",
            defaultValue: "Chargement de la story…",
            bundle: .module
        ))
    }
}
