import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Publications » sur la Vitrine (planche `Main`) : mes trois dernières publications dans la grille du kit (K49), et
/// « Tout voir » qui ouvre toute la liste. Les publications viennent du même modèle que la liste du profil (cache
/// d'abord, puis le réseau) : trois squelettes seulement sur un cache vide, jamais un spinner ; rien de publié ⇒ la
/// section se tait ; un premier chargement en échec propose Réessayer.
struct ProfilePublicationsSection: View {
    let userId: String
    let accentColor: String

    @StateObject private var viewModel: ProfileUserPostsViewModel
    @State private var showsAll = false
    @Environment(\.routerCommands) private var router

    init(userId: String, accentColor: String) {
        self.userId = userId
        self.accentColor = accentColor
        _viewModel = StateObject(wrappedValue: ProfileUserPostsViewModel(userId: userId))
    }

    var body: some View {
        let state = ProfilePublicationTiles.state(posts: viewModel.posts, isLoading: viewModel.isLoading,
                                                  pagination: viewModel.paginationState)
        // Un ancrage réel, même sans tuile : `.task` ne part pas sur une vue vide, et c'est lui qui charge.
        ZStack(alignment: .top) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            switch state {
            case .silent:
                EmptyView()
            case .tiles(let items):
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    header
                    MeeshyMediaGrid(label: ProfilePublicationsCopy.title, items: items, layout: .row, columns: 3,
                                    shape: .tall, tint: Color(hex: accentColor),
                                    onOpen: { id in open(id) },
                                    content: { item, size in thumbnail(of: item, size: size) })
                }
                .meeshyTransition(.opacity)
            case .failed:
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    header
                    failure
                }
                .meeshyTransition(.opacity)
            case .empty:
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    header
                    emptyState
                }
                .meeshyTransition(.opacity)
            }
        }
        .task { await viewModel.loadInitial() }
        .sheet(isPresented: $showsAll) { allPublications }
    }

    private var header: some View {
        MeeshySectionHeader(title: ProfilePublicationsCopy.title, lead: { EmptyView() }, accessory: { seeAllButton })
    }

    @ViewBuilder
    private var seeAllButton: some View {
        if !viewModel.posts.isEmpty {
            Button(ProfilePublicationsCopy.seeAll) { showsAll = true }
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                .foregroundStyle(Color(hex: accentColor))
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .buttonStyle(PressableButtonStyle())
                .accessibilityIdentifier("profile.posts.seeAll")
        }
    }

    /// Le premier chargement a échoué sur un cache vide : le bloc d'état du kit (K38), avec Réessayer.
    private var failure: some View {
        MeeshyStateBlock(kind: .error, title: ProfilePublicationsCopy.failed,
                         primary: MeeshyStateBlockAction(title: ProfilePublicationsCopy.retry,
                                                         systemImage: "arrow.clockwise",
                                                         perform: { Task { await viewModel.loadInitial() } }),
                         art: .none, size: .compact, tint: Color(hex: accentColor))
            .accessibilityIdentifier("profile.posts.failed")
    }

    /// Rien de publié (planche `Etat-Vide` vue 3) : trois tuiles fantômes — réel, photo, story —, le titre, et
    /// « Publier quelque chose » qui ouvre le composer.
    private var emptyState: some View {
        MeeshyStateBlock(kind: .empty, title: ProfilePublicationsCopy.emptyTitle,
                         primary: MeeshyStateBlockAction(title: ProfilePublicationsCopy.publish, systemImage: "plus",
                                                         perform: { router.requestFeedComposer() }),
                         art: .ghostTiles(ProfilePublicationsCopy.emptyGhostTiles), tint: Color(hex: accentColor))
            .accessibilityIdentifier("profile.posts.empty")
    }

    @ViewBuilder
    private func thumbnail(of item: MeeshyMediaGridItem, size: CGSize) -> some View {
        let post = viewModel.posts.first { $0.id == item.id }
        CachedAsyncImage(url: post.flatMap { ProfilePublicationTiles.thumbnail(of: $0) }, targetSize: size,
                         thumbHash: post?.media.first?.thumbHash, showsStatusOverlays: false) {
            Color(hex: accentColor).opacity(MeeshyOpacity.light)
        }
        .scaledToFill()
    }

    private var allPublications: some View {
        ScrollView {
            ProfileUserPostsList(userId: userId, leavingHost: { showsAll = false })
                .padding(.vertical, MeeshySpacing.md)
        }
        .presentationDragIndicator(.visible)
        .closesForConversationOpening(.sheet)
    }

    /// Un réel s'ouvre dans le lecteur immersif avec mes réels ; une publication, dans son détail. L'ouverture est
    /// comptée comme depuis la liste du profil.
    private func open(_ id: String) {
        guard let post = viewModel.posts.first(where: { $0.id == id }) else { return }
        let opening = ProfilePostOpening(
            onOpenPost: { tapped in router.push(.postDetail(tapped.id, tapped)) },
            onOpenReel: { reel, reels in ReelsPresenter.shared.present(posts: reels, startId: reel.id) }
        )
        if post.isReel {
            opening.openReel(post, in: viewModel.posts.filter(\.isReel))
        } else {
            opening.openPost(post)
        }
    }
}
