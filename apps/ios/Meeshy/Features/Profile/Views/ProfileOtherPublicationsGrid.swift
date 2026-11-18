import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les publications d'un autre** (planche `Autre-Publications`) : « À la une » quand la passerelle la sert, puis
/// « Publications · 64 au total », les puces du kit par genre (K04), la grille du kit (K49) et « Tu as tout vu ».
/// Fait du kit (loi 12) : aucune tuile, aucune puce, aucun bloc dessiné ici. Le modèle est celui de la liste du
/// profil — cache d'abord, squelettes sur un cache vide, la suite par fenêtre de rendu.
struct ProfileOtherPublicationsGrid: View {
    @ObservedObject var viewModel: ProfileUserPostsViewModel
    let accentColor: String
    let highlights: [ProfileHighlight]
    let onOpen: (FeedPost) -> Void
    let onOpenHighlight: (ProfileHighlight) -> Void

    @State private var genre: ProfilePublicationGenre = .all
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    private var tint: Color { Color(hex: accentColor) }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            ProfileHighlightsRail(highlights: ProfileHighlight.shown(highlights), tint: tint, onOpen: onOpenHighlight)
            header
            genreChips
            grid
            endOfContent
        }
        .padding(.horizontal, MeeshySpacing.xl)
    }

    private var header: some View {
        MeeshySectionHeader(title: ProfilePublicationsGridCopy.title, lead: { EmptyView() }, accessory: {
            if let total = ProfilePublicationsGrid.totalLine(counts: viewModel.postsCounts) {
                Text(total)
                    .meeshyScaledFont(MeeshyFont.subheadSize)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        })
    }

    private var genreChips: some View {
        MeeshyChipRow(
            ProfilePublicationGenre.allCases.map { MeeshyChip(id: $0, title: $0.title) },
            selection: [genre],
            label: ProfilePublicationsGridCopy.genres,
            surface: .theme,
            size: .compact,
            onChange: { _, tapped in select(tapped) }
        )
    }

    @ViewBuilder
    private var grid: some View {
        let tiles = ProfilePublicationsGrid.tiles(posts: viewModel.visiblePosts, isLoading: viewModel.isLoading,
                                                  genre: genre)
        if tiles.isEmpty {
            emptyGenre
        } else {
            MeeshyMediaGrid(label: ProfilePublicationsGridCopy.title, items: tiles, layout: .masonry, columns: 2,
                            shape: .free, tint: tint,
                            onOpen: { id in open(id) },
                            onReachEnd: { viewModel.scheduleReveal() },
                            content: { item, size in thumbnail(of: item, size: size) })
        }
        if viewModel.hasMoreToRender || viewModel.hasMore {
            Color.clear
                .frame(height: 1)
                .onAppear { viewModel.scheduleReveal() }
                .accessibilityHidden(true)
        }
    }

    /// Aucun contenu du genre choisi, une fois tout servi : le bloc vide du kit (K38), et « Tout voir » pour revenir.
    @ViewBuilder
    private var emptyGenre: some View {
        if !viewModel.hasMore && !viewModel.isLoading {
            MeeshyStateBlock(kind: .empty, title: genre.emptyTitle,
                             primary: genre == .all ? nil : MeeshyStateBlockAction(
                                title: ProfilePublicationsGridCopy.seeAll, systemImage: "square.grid.2x2",
                                perform: { select(.all) }),
                             art: .none, size: .compact, tint: tint)
                .accessibilityIdentifier("profile.posts.genre.empty")
        }
    }

    /// Tout est servi et rendu : « Tu as tout vu · Tout ce que Léo a publié depuis janvier 2026. »
    @ViewBuilder
    private var endOfContent: some View {
        if case .exhausted = viewModel.paginationState, !viewModel.hasMoreToRender, let first = viewModel.posts.last {
            MeeshyStateBlock(kind: .success, title: ProfilePublicationsGridCopy.endTitle,
                             message: ProfilePublicationsGrid.endMessage(authorName: first.author,
                                                                         firstPublished: first.timestamp),
                             art: .glyph, size: .compact, tint: tint, announces: false,
                             systemImage: "checkmark.circle")
                .accessibilityIdentifier("profile.posts.end")
        }
    }

    @ViewBuilder
    private func thumbnail(of item: MeeshyMediaGridItem, size: CGSize) -> some View {
        let post = viewModel.posts.first { $0.id == item.id }
        CachedAsyncImage(url: post.flatMap { ProfilePublicationTiles.thumbnail(of: $0) }, targetSize: size,
                         thumbHash: post?.media.first?.thumbHash, showsStatusOverlays: false) {
            tint.opacity(MeeshyOpacity.light)
        }
        .scaledToFill()
        .countsListedImpression(of: item.id, isVideo: post?.isReel ?? false, in: viewModel.listedImpressions) {
            viewModel.visiblePosts.firstIndex { $0.id == item.id }
        }
    }

    private func select(_ tapped: ProfilePublicationGenre) {
        meeshyWithAnimation(MeeshyAnimation.springFast, reduced: MeeshyMotion.reducedFade, reduceMotion: reduceMotion) {
            genre = tapped
        }
    }

    private func open(_ id: String) {
        guard let post = viewModel.posts.first(where: { $0.id == id }) else { return }
        onOpen(post)
    }
}

/// **« À la une »** : les albums de stories mis en avant par la personne, en rangée nommée du kit (K48). Aucun album
/// servi ⇒ aucun rail, ni titre ni marge.
struct ProfileHighlightsRail: View {
    let highlights: [ProfileHighlight]
    let tint: Color
    let onOpen: (ProfileHighlight) -> Void

    var body: some View {
        if !highlights.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ProfilePublicationsGridCopy.highlights, count: highlights.count)
                MeeshyAvatarGroup(count: highlights.count, layout: .rail, size: .s56, max: highlights.count,
                                  selection: .single(nil),
                                  onSelectionChange: { selection in open(selection) },
                                  label: ProfilePublicationsGridCopy.highlights,
                                  caption: { index in highlights[index].title },
                                  tint: tint,
                                  breathes: false,
                                  cell: { index, diameter in cover(of: highlights[index], diameter: diameter) })
            }
            .accessibilityIdentifier("profile.posts.highlights")
        }
    }

    private func open(_ selection: MeeshyAvatarGroupSelection) {
        guard case .single(let index?) = selection, highlights.indices.contains(index) else { return }
        onOpen(highlights[index])
    }

    @ViewBuilder
    private func cover(of highlight: ProfileHighlight, diameter: CGFloat) -> some View {
        if let url = highlight.coverUrl, !url.isEmpty {
            CachedAsyncImage(url: url, targetSize: CGSize(width: diameter, height: diameter),
                             showsStatusOverlays: false) {
                tint.opacity(MeeshyOpacity.light)
            }
            .scaledToFill()
        } else {
            ZStack {
                tint.opacity(MeeshyOpacity.light)
                Image(systemName: ProfileHighlightGlyph.systemImage(for: highlight.glyph))
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                    .foregroundStyle(tint)
            }
            .accessibilityHidden(true)
        }
    }
}

/// Le glyphe d'un album servi par son nom de planche (`map-pin`, `moon`…) ; un nom inconnu ⇒ l'étincelle.
nonisolated enum ProfileHighlightGlyph {
    static let fallback = "sparkles"

    private static let table: [String: String] = [
        "map-pin": "mappin.and.ellipse", "buildings": "building.2", "film-strip": "film", "moon": "moon",
        "storefront": "storefront", "camera": "camera", "heart": "heart", "star": "star", "airplane": "airplane",
        "music-note": "music.note", "sun": "sun.max", "fork-knife": "fork.knife"
    ]

    static func systemImage(for glyph: String?) -> String {
        guard let glyph else { return fallback }
        return table[glyph.lowercased()] ?? fallback
    }
}
