import SwiftUI
import MeeshySDK

/// Overlay placeholder pour le reader stories. Cascade de placeholders
/// Cache-First, du plus immédiat au plus fidèle :
///   1. ThumbHash flouté de la slide (décodage sync, frame 0) — ou dégradé
///      indigo neutre pour les slides sans ThumbHash ;
///   2. miniature réelle du fond (`coverThumbnailURL`, typiquement déjà
///      chaude en cache : la tray vient de l'afficher) rendue NETTE dès
///      qu'elle est résidente — bien avant que la vidéo/image pleine
///      résolution n'arrive ;
///   3. spinner discret, gaté par `showSpinner`.
/// L'overlay reste rendu tant que `progress < threshold` (par défaut 95 %)
/// pendant que le canvas média se résout. Le caller contrôle `showSpinner`
/// (typique : backdrop visible dès le frame 0, spinner armé après un délai
/// de grâce de 200 ms pour ne pas flasher sur les cache-hits rapides).
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
    /// Affiche le spinner circulaire au centre. Couper ce flag permet au
    /// caller de monter l'overlay en mode "backdrop only" — ThumbHash
    /// placeholder immédiat sans indicateur visuel (le spinner peut être armé
    /// après un délai de grâce pour ne pas flasher sur les cache-hits rapides).
    public let showSpinner: Bool
    /// URL (string brute, résolue par `CachedAsyncImage`) de la miniature
    /// réelle du fond — typiquement `media.thumbnailUrl` de la story, que la
    /// tray vient d'afficher donc déjà résidente en cache. Affichée NETTE
    /// par-dessus le ThumbHash flouté dès qu'elle est disponible, en attendant
    /// le média pleine résolution. `nil` = étage ignoré (comportement
    /// historique ThumbHash seul).
    public let coverThumbnailURL: String?

    public init(
        slide: StorySlide?,
        progress: Double,
        threshold: Double = 0.95,
        showSpinner: Bool = true,
        coverThumbnailURL: String? = nil
    ) {
        self.slide = slide
        self.progress = progress
        self.threshold = threshold
        self.showSpinner = showSpinner
        self.coverThumbnailURL = coverThumbnailURL
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

            // Étage 2 — miniature réelle du fond, NETTE, par-dessus le
            // ThumbHash flouté. `CachedAsyncImage` la résout warm-cache de
            // façon synchrone à l'init (la tray vient de l'afficher) et le
            // placeholder transparent laisse le ThumbHash visible le temps
            // d'un éventuel chargement disque/réseau. User 2026-06-11 :
            // « si le thumbnail est disponible avant le contenu, l'afficher
            // juste après le ThumbHash ».
            if let cover = coverThumbnailURL, !cover.isEmpty {
                CachedAsyncImage(url: cover) { Color.clear }
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
            }

            if showSpinner {
                // Cercle frosted (80×80) qui sert d'écrin au spinner ; le
                // spinner est scalé (2.0) pour OCCUPER tout l'espace du
                // cercle moins une petite marge interne, donnant l'illusion
                // que le cercle EST le spinner. (Le pourcentage sous le
                // cercle a été retiré — user 2026-06-11 « enlever le % en
                // bas du spinner ».)
                ZStack {
                    Circle()
                        .fill(Color.black.opacity(0.35))
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                        .scaleEffect(2.0)
                }
                .frame(width: 80, height: 80)
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
