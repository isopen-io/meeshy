import SwiftUI
import MeeshySDK

/// Overlay placeholder pour le reader stories. Affiche le ThumbHash du fond
/// de la slide plein écran (ou un dégradé indigo neutre pour les slides sans
/// ThumbHash) éventuellement surmonté d'un spinner discret + le pourcentage
/// de progression. L'overlay reste rendu tant que `progress < threshold`
/// (par défaut 95 %) — il sert de placeholder Cache-First instantané pendant
/// que le canvas média se résout. Le caller contrôle `showSpinner` pour
/// gater l'indicateur de progression (typique : on garde le backdrop visible
/// dès le frame 0, on n'arme le spinner qu'après un délai de grâce de
/// 200 ms afin de ne pas flasher sur les cache-hits rapides).
///
/// Conçu pour être monté en `ZStack` au-dessus de `StoryReaderRepresentable`
/// côté parent SwiftUI ; le composant ne se branche pas sur les KVO du canvas.
///
/// Spec : `2026-05-20-stories-video-layers-text-sprint-design.md` § 3.D.4.
@MainActor
public struct StoryReaderLoadingOverlay: View {
    /// Slide à afficher en placeholder ThumbHash. `nil` autorisé pour les cas
    /// où le caller n'a pas encore décodé la slide — ou si la slide est une
    /// ancienne version publiée avant l'ajout du champ `thumbHash`. Dans ces
    /// deux cas, l'overlay tombe sur un dégradé indigo doux (palette brand)
    /// plutôt qu'un noir brut.
    public let slide: StorySlide?
    /// Progression de chargement `[0, 1]`. À `1.0` l'overlay est invisible.
    public let progress: Double
    /// Seuil de retrait de l'overlay entier (backdrop + spinner). Sous cette
    /// valeur l'overlay reste rendu pour servir de placeholder; au-dessus, il
    /// fade out et libère le canvas média.
    public let threshold: Double
    /// Affiche le spinner circulaire + le pourcentage de progression au centre.
    /// Couper ce flag permet au caller de monter l'overlay en mode
    /// "backdrop only" — ThumbHash placeholder immédiat sans indicateur visuel
    /// (le spinner peut être armé après un délai de grâce pour ne pas flasher
    /// sur les cache-hits rapides).
    public let showSpinner: Bool

    public init(
        slide: StorySlide?,
        progress: Double,
        threshold: Double = 0.95,
        showSpinner: Bool = true
    ) {
        self.slide = slide
        self.progress = progress
        self.threshold = threshold
        self.showSpinner = showSpinner
    }

    public var body: some View {
        ZStack {
            if let hash = slide?.effects.thumbHash,
               !hash.isEmpty,
               let img = UIImage.fromThumbHash(hash) {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .blur(radius: 8)
                    .clipped()
            } else {
                // Fallback pour les stories qui ne portent pas (encore) de
                // ThumbHash (anciennes versions publiées avant l'ajout du champ,
                // ou échec de décodage). On évite le `Color.black` brut qui
                // donne un trou noir disgracieux : à la place, un dégradé doux
                // indigo aligné sur la palette brand. C'est neutre, lisible,
                // et reste cohérent avec le reste de l'app pendant que le
                // canvas se résout.
                LinearGradient(
                    colors: [
                        Color(red: 0.07, green: 0.07, blue: 0.10),   // ~indigo950 darkened
                        Color(red: 0.12, green: 0.10, blue: 0.18),   // indigo950
                        Color(red: 0.19, green: 0.17, blue: 0.29)    // indigo900
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }

            if showSpinner {
                // Indicateur central — frame explicite 100×100 sur le cercle
                // pour éviter que `.background(Circle())` inscrive un disque
                // déformé autour du bounding-box vertical du `VStack` (qui
                // rendait spinner et % désaxés et collés en bas). Avec un
                // `ZStack` aligné par défaut, le `VStack` reste centré dans
                // le cercle, et le spacing 12pt entre le spinner et le %
                // garantit une vraie respiration visuelle (pas de chevauchement
                // sur les variants de spinner iOS qui prennent plus de hauteur
                // en mode large dynamic type).
                ZStack {
                    Circle()
                        .fill(Color.black.opacity(0.35))
                    VStack(spacing: 12) {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                            .scaleEffect(1.4)
                        Text("\(Int((progress.isFinite ? progress : 0) * 100))%")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.white.opacity(0.85))
                    }
                }
                .frame(width: 100, height: 100)
                .transition(.opacity)
            }
        }
        // Self-contained full-bleed: thumbhash Image with .scaledToFill() +
        // .blur() can otherwise propose an intrinsic size larger than the
        // viewport, which inflates the parent ZStack and pushes the sidebar
        // off-screen (the parent's .clipped() only hides pixels, the layout
        // is already deformed). Lock the overlay to the proposed size and
        // clip its content so siblings keep their slot.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
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
