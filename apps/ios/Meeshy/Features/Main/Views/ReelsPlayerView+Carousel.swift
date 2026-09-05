import SwiftUI
import MeeshySDK
import MeeshyUI

// =============================================================================
// Le CARROUSEL de médias d'un réel — sorti de `ReelsPlayerView.swift` (#4927).
//
// La découpe précède l'ajout, et ce n'est pas une formalité : le fichier hôte
// pesait 1 737 lignes, donc au-delà du plafond de 1 200, et le cliquet
// `FileSizeBudgetGuardTests` interdit d'AJOUTER à un fichier de la dette
// héritée. Extraire d'abord le code qu'on vient modifier est le geste que la
// règle demande — et il tombe juste ici, puisque c'est ce carrousel qui doit
// apprendre à feuilleter autre chose que des images.
//
// Même motif que `ReelsPlayerView+Video.swift` (#4628). Les gardes qui nomment
// l'hôte par son CHEMIN concatènent leurs sources : elles reçoivent ce fichier
// dans leur liste, parce qu'une découpe se DÉCLARE — elle ne se subit pas.
// =============================================================================

// MARK: - Reel Image Carousel

/// Image reel: a single image, or a horizontal page-snapping carousel of images
/// (orthogonal to the vertical reel paging) with dots.
///
/// Mirrors the proven `ConversationMediaGalleryView` composition to fix three
/// carousel defects: ONE `.ignoresSafeArea()` at the pager level (never per
/// cell), each page pinned to the EXACT viewport so the paging stride equals the
/// page width (no half-shown image), and the visible index seeded SYNCHRONOUSLY
/// at init (the first image is present from the first frame — not set in
/// `.onAppear`, which raced `scrollPosition(id:)` and could open scrolled past
/// the first image).
/// `internal` depuis la découpe #4927 — `ReelPageView`, resté dans le fichier
/// hôte, la monte. Même geste que `ReelVideoView` à la découpe #4628.
struct ReelImageView: View {
    let reel: FeedPost
    /// **Ce que la page RÉELLEMENT visible est** (#4927), publié vers l'hôte.
    ///
    /// L'index reste un `@State` interne — le seeder depuis l'extérieur
    /// ré-ouvrirait la course avec `scrollPosition(id:)` que l'init synchrone a
    /// fermée. L'hôte est donc NOTIFIÉ, il ne pilote pas : c'est ce qui permet à
    /// la pastille de dire « 2 / 3 » sans que le carrousel dépende d'elle.
    var onVisibleMediaChange: ((String) -> Void)?
    private let images: [FeedMedia]
    @State private var currentImageId: String?

    init(reel: FeedPost, onVisibleMediaChange: ((String) -> Void)? = nil) {
        self.reel = reel
        self.onVisibleMediaChange = onVisibleMediaChange
        // Repost-aware: a republished reel's images live on the reposted reel.
        let imgs = reel.reelDisplayMedia.filter { $0.type == .image }
        self.images = imgs
        _currentImageId = State(initialValue: imgs.first?.id)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            if images.count <= 1 {
                if let media = images.first {
                    ReelImageCell(media: media)
                } else {
                    Color.black
                }
            } else {
                AdaptiveHorizontalPager(items: images, currentPageID: $currentImageId, fillVertical: true) { _, media in
                    ReelImageCell(media: media)
                }
                dots
                    .padding(.bottom, 150)
            }
        }
        .ignoresSafeArea()
        .onAppear { if let currentImageId { onVisibleMediaChange?(currentImageId) } }
        .adaptiveOnChange(of: currentImageId) { _, id in
            if let id { onVisibleMediaChange?(id) }
        }
    }

    private var dots: some View {
        HStack(spacing: 6) {
            ForEach(images) { media in
                Circle()
                    .fill(Color.white.opacity(media.id == currentImageId ? 0.95 : 0.4))
                    .frame(width: 6, height: 6)
            }
        }
        // Decorative dots → expose the position to VoiceOver ("2 / 5") instead of
        // announcing each anonymous circle.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "reels.carousel.image", defaultValue: "Image", bundle: .main))
        // Le séparateur « / » reste : sa forme EST la donnée (« 3 / 10 » se lit
        // comme une seule position), et 239i l'a explicitement distingué de la
        // puce de mise en page qu'elle bannissait. Seuls les CHIFFRES changent.
        .accessibilityValue(
            LocalizedNumber.exact((images.firstIndex { $0.id == currentImageId } ?? 0) + 1)
            + " / " + LocalizedNumber.exact(images.count)
        )
    }
}

/// One carousel page: the whole image, centred (`.fit`), over a blurred ambient
/// backdrop of itself. A ~9:16 image fills the screen (its `.fit` foreground
/// covers the backdrop); any other ratio shows the WHOLE image centred over the
/// blurred backdrop — never black bars, never a cropped/off-centre image.
///
/// The page is already sized to the viewport by the pager (one
/// `.ignoresSafeArea()` + `fillVertical`), so the image is fit/filled with a
/// plain `.frame(maxWidth/maxHeight: .infinity)` — no per-cell `GeometryReader`
/// (which under the iOS 16 `TabView` fallback can report `.zero` on the first
/// pass). Mirrors `ConversationMediaGalleryView` / `ReelPoster`.
private struct ReelImageCell: View {
    let media: FeedMedia

    /// Explicit ratio from the media dimensions so `.fit` actually constrains the
    /// frame (ProgressiveCachedImage has no intrinsic ratio at first render — its
    /// placeholder is `Color.clear` — so a `.aspectRatio(contentMode:)` alone
    /// established a full-screen frame and the loaded image then stretched/filled
    /// it). With an explicit ratio the whole image shows, letterboxed over the
    /// blurred backdrop. Falls back to 9:16 when dimensions are missing.
    private var mediaAspect: CGFloat {
        guard let w = media.width, let h = media.height, w > 0, h > 0 else { return 9.0 / 16.0 }
        return CGFloat(w) / CGFloat(h)
    }

    var body: some View {
        GeometryReader { geo in
            // Exact fitted size from the media ratio — bulletproof: the image is
            // framed to its computed fit box (≤ viewport in both axes), so it can
            // NEVER overflow the viewport. The blurred backdrop fills behind.
            let fit = fittedSize(in: geo.size)
            ZStack {
                ReelImageBackdrop(media: media).equatable()

                ProgressiveCachedImage(
                    thumbHash: media.thumbHash,
                    thumbnailUrl: media.thumbnailUrl ?? media.url,
                    fullUrl: media.url ?? media.thumbnailUrl,
                    autoLoad: true
                ) {
                    Color.clear
                }
                .frame(width: fit.width, height: fit.height)
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
    }

    /// Largest box with `mediaAspect` that fits inside `container` (letterbox).
    /// Guards a zero container (first layout pass) by returning it unchanged.
    private func fittedSize(in container: CGSize) -> CGSize {
        guard container.width > 0, container.height > 0 else { return container }
        let containerAspect = container.width / container.height
        if mediaAspect > containerAspect {
            return CGSize(width: container.width, height: container.width / mediaAspect)
        } else {
            return CGSize(width: container.height * mediaAspect, height: container.height)
        }
    }
}

/// Ambient blurred fill behind a `.fit` carousel image/video — the media's
/// **thumbHash** decoded locally, scaled to fill, blurred and slightly dimmed.
/// Falls back to the media's tint colour when no thumbHash exists.
///
/// Deliberately renders ONLY the thumbHash (via `UIImage.fromThumbHash`) — it
/// NEVER loads the thumbnail URL. A sharp thumbnail popping into the blurred
/// letterbox fill reads as a rendering glitch (user report 2026-07-08 : « le
/// thumbnail donne l'impression d'un bogue »). This mirrors the story letterbox
/// backdrop (`storyBlurredBackdrop`), which is thumbHash-only too. The full
/// image is already fetched by the `.fit` foreground; a 60pt blur over the
/// upscaled thumbHash hides its low resolution at zero extra network cost.
/// `internal` (et non `private`) depuis la découpe du cluster vidéo (#4628) :
/// `ReelVideoView` la monte pour ses barres latérales, et vit désormais dans
/// `ReelsPlayerView+Video.swift`. `private` porte sur le FICHIER.
struct ReelImageBackdrop: View, Equatable {
    let media: FeedMedia

    /// Decoded lazily inside `body` (≈16×16 → upscaled, < 0.5 ms). Because the
    /// view is `.equatable()`, `body` — and thus this decode — only runs when the
    /// media identity / thumbHash actually changes, not on the parent's 10 Hz
    /// playback-time re-renders (the real GPU/CPU heat win).
    private var backdropImage: UIImage? {
        guard let hash = media.thumbHash, !hash.isEmpty else { return nil }
        return UIImage.fromThumbHash(hash)
    }

    static func == (lhs: ReelImageBackdrop, rhs: ReelImageBackdrop) -> Bool {
        lhs.media.id == rhs.media.id
            && lhs.media.thumbHash == rhs.media.thumbHash
            && lhs.media.thumbnailColor == rhs.media.thumbnailColor
    }

    var body: some View {
        ZStack {
            Color(hex: media.thumbnailColor)
            if let img = backdropImage {
                Image(uiImage: img)
                    .resizable()
                    .interpolation(.low)
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .scaleEffect(1.18)
                    .blur(radius: 60)
                    .opacity(0.85)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .overlay(Color.black.opacity(0.22))
    }
}

// MARK: - Reel Media Count Badge

/// **La pastille qui dit qu'un réel porte PLUSIEURS médias — et qui y mène**
/// (#4927).
///
/// ## Le défaut qu'elle ferme
///
/// `mediaLayer` aiguille sur le type du média PRIMAIRE, et
/// `primaryReelDisplayMedia` préfère la vidéo. Un réel « une vidéo + deux
/// photos » rendait donc `ReelVideoView(media:)` — **une seule pièce** — et les
/// deux photos n'avaient aucun chemin, nulle part. Le chemin IMAGE, lui, avait
/// déjà son carrousel : le trou ne concernait que les réels MIXTES, ce qui le
/// rendait invisible à une lecture rapide du fichier.
///
/// > Ce n'est pas un contrôle inerte — le lecteur fait exactement ce qu'il dit.
/// > C'est plus discret : un auteur publie trois médias, deux ne sont servis à
/// > personne, et rien dans l'app ne le signale.
///
/// ## Pourquoi une pastille, et pas un geste
///
/// Le réel a déjà ses quatre gestes (tap, appui long, glissement vertical vers
/// le réel suivant, glissement horizontal du carrousel d'images). En ajouter un
/// cinquième obligerait à en déplacer un autre — la directive demande d'ATTEINDRE
/// les autres médias, pas de renégocier l'idiome du format.
///
/// La pastille reprend le vocabulaire du fil (`FeedPostCardCarousel.counter` :
/// « 1 / 3 », capsule noire translucide, chiffres monospacés) parce que c'est le
/// même fait montré au même endroit — coin haut, sur le média. Elle est en
/// revanche TAPABLE, là où celle du fil est décorative : ici, elle est le seul
/// chemin.
struct ReelMediaCountBadge: View {

    let total: Int
    let currentIndex: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("\(currentIndex + 1) / \(total)")
                .font(MeeshyFont.relative(12, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(.black.opacity(0.5)))
                // La capsule mesure ~28 pt de haut : le cadre porte la cible à
                // 44 pt sans épaissir le dessin, la zone tactile débordant
                // au-dessus et au-dessous de ce qui est peint.
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "reels.media.count.open",
                                   defaultValue: "Voir les \(total) médias",
                                   bundle: .main))
        .accessibilityValue(String(localized: "reels.media.count.position",
                                   defaultValue: "\(currentIndex + 1) sur \(total)",
                                   bundle: .main))
        .accessibilityAddTraits(.isButton)
    }
}
