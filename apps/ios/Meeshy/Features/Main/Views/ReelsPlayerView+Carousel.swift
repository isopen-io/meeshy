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
        ReelMediaDots(total: images.count,
                      currentIndex: images.firstIndex { $0.id == currentImageId } ?? 0)
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
        // Repli 9:16 — le même gabarit que la scène (`SceneShape.aspect`,
        // #6896/#6904), site unique du rapport dans le dépôt.
        guard let w = media.width, let h = media.height, w > 0, h > 0 else { return SceneShape.aspect }
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
                // **Aucun `.blur` ici, et c'est délibéré** (#7009). La source
                // est un ThumbHash de 16×16 étiré plein écran : l'interpolation
                // bilinéaire le rend DÉJÀ flou, et le `.blur(radius: 60)` qui
                // vivait là ajoutait une passe GPU plein cadre à chaque frame du
                // swipe pour flouter ce qui l'était déjà. Si un rendu plus doux
                // redevenait nécessaire, la bonne réponse est `.drawingGroup()`
                // (une seule rasterisation), pas un flou par frame.
                Image(uiImage: img)
                    .resizable()
                    .interpolation(.low)
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .scaleEffect(1.18)
                    .opacity(MeeshyOpacity.intense)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .overlay(Color.black.opacity(0.22))
    }
}

// MARK: - Reel Media Indicator

/// **Ce qui dit qu'un réel porte PLUSIEURS médias — une seule fois** (#16321).
///
/// Le carrousel d'images dessine ses points ; la pastille « 2 / 3 » posée au
/// coin haut redisait le même fait (recette porteur du 2026-11-05). Un réel
/// élit donc UN indicateur : les points du carrousel quand le carrousel les
/// dessine, des points TAPABLES menant à la galerie quand le média affiché
/// n'en a pas (réel mixte dont la vidéo gagne, réel composé), rien pour un
/// seul média — loi 4 : un contrôle sans effet est absent.
enum ReelMediaIndicator: Equatable {
    case none
    case carouselDots
    case galleryDots(total: Int, currentIndex: Int)

    static func resolve(isScene: Bool, primaryType: FeedMediaType?,
                        visualCount: Int, currentIndex: Int) -> ReelMediaIndicator {
        guard visualCount > 1 else { return .none }
        if !isScene && primaryType == .image { return .carouselDots }
        return .galleryDots(total: visualCount, currentIndex: min(max(currentIndex, 0), visualCount - 1))
    }
}

/// Les points ○ ○ ○ d'un réel, site UNIQUE de leur dessin : le carrousel et
/// le chemin vers la galerie montrent la même chose de la même façon.
struct ReelMediaDots: View {
    let total: Int
    let currentIndex: Int

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            ForEach(0..<total, id: \.self) { index in
                Circle()
                    .fill(Color.white.opacity(index == currentIndex ? 0.95 : 0.4))
                    .frame(width: 6, height: 6)
            }
        }
        // Decorative dots → expose the position to VoiceOver ("2 / 5") instead of
        // announcing each anonymous circle. Le séparateur « / » reste pour
        // VoiceOver seul : sa forme EST la donnée (239i).
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "reels.carousel.image", defaultValue: "Image", bundle: .main))
        .accessibilityValue(LocalizedNumber.exact(currentIndex + 1) + " / " + LocalizedNumber.exact(total))
    }
}

/// **Le chemin vers les AUTRES médias d'un réel mixte** (#4927), dessiné en
/// points depuis #16321. `mediaLayer` aiguille sur le média primaire — la
/// vidéo gagne — donc un réel « une vidéo + deux photos » ne servait jamais
/// les photos : ces points sont leur seul chemin, d'où le bouton.
struct ReelMediaGalleryDots: View {

    let total: Int
    let currentIndex: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ReelMediaDots(total: total, currentIndex: currentIndex)
                .accessibilityHidden(true)
                .padding(.horizontal, MeeshySpacing.smPlus)
                .padding(.vertical, MeeshySpacing.sm)
                .background(Capsule().fill(MeeshyColors.mediaScrim))
                // La capsule est fine : le cadre porte la cible à 44 pt sans
                // épaissir le dessin.
                .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
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
