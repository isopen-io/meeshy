import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Publications enregistrées de l'utilisateur connecté — posts ET réels.
///
/// `GET /posts/bookmarks` ne filtre pas par type : un réel enregistré revient
/// dans la même page qu'un post. Les deux ne s'ouvrent pas au même endroit —
/// un post mène à sa page de détail, un réel au lecteur immersif — donc la
/// vue distingue les deux au tap plutôt que de tout envoyer sur le détail.
struct BookmarksView: View {
    @StateObject private var viewModel = BookmarksViewModel()
    /// `@StateObject` sur le singleton, PAS `@EnvironmentObject` : ni `RootView`
    /// ni `iPadRootView` n'injectent `ThemeManager`, et l'exiger de
    /// l'environnement faisait planter l'app à l'ouverture de cet écran
    /// (« No ObservableObject of type ThemeManager found »). Le défaut est
    /// resté invisible tant que l'écran n'avait aucun point d'entrée.
    /// Observé — un basculement Clair/Sombre doit repeindre la liste, ce que le
    /// `{ ThemeManager.shared }` calculé des écrans voisins ne fait pas.
    @StateObject private var theme = ThemeManager.shared
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    /// Avatar d'auteur tappé → story de cet auteur (singleGroup, 1re non-vue).
    @State private var storyAuthorUserId: String?
    @State private var filter: BookmarkFilter = .all

    @StateObject private var impressions = ImpressionBatcher(source: "profile")

    /// Facette de tri de l'écran. `nonisolated` sur le TYPE : `CaseIterable` et
    /// `Identifiable` sont exercés hors du MainActor par le `ForEach` du picker.
    nonisolated enum BookmarkFilter: String, CaseIterable, Identifiable {
        case all, posts, reels

        var id: String { rawValue }

        var label: String {
            switch self {
            case .all: return String(localized: "bookmarks.filter.all", defaultValue: "Tout", bundle: .main)
            case .posts: return String(localized: "bookmarks.filter.posts", defaultValue: "Postes", bundle: .main)
            case .reels: return String(localized: "bookmarks.filter.reels", defaultValue: "Réels", bundle: .main)
            }
        }

        func matches(_ post: FeedPost) -> Bool {
            switch self {
            case .all: return true
            case .posts: return !post.isReel
            case .reels: return post.isReel
            }
        }
    }

    private var visiblePosts: [FeedPost] {
        viewModel.posts.filter(filter.matches)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 12) {
                // Le sélecteur ne s'affiche que si la liste contient bien les
                // deux natures : proposer « Réels » sur une liste sans réel
                // n'offre qu'un moyen de vider l'écran.
                if viewModel.posts.contains(where: \.isReel) && viewModel.posts.contains(where: { !$0.isReel }) {
                    filterPicker
                }

                if visiblePosts.isEmpty && !viewModel.isLoading {
                    emptyState
                } else {
                    ForEach(visiblePosts) { post in
                        FeedPostCard(
                            post: post,
                            onBookmark: { postId in
                                Task { await viewModel.removeBookmark(postId) }
                            },
                            onTapPost: { post in
                                openBookmark(post)
                            },
                            onReport: { postId in
                                Task {
                                    do {
                                        try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
                                        FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.reported", defaultValue: "Publication signalée", bundle: .main))
                                    } catch {
                                        FeedbackToastManager.shared.showError(String(localized: "feed.post.reportError", defaultValue: "Erreur lors du signalement", bundle: .main))
                                    }
                                }
                            },
                            authorStoryRing: storyViewModel.storyRingState(forUserId: post.authorId),
                            onViewAuthorStory: { storyAuthorUserId = post.authorId }
                        )
                        .equatable()
                        // La liste des favoris affiche des posts et des réels
                        // comme n'importe quelle autre surface : leur apparition
                        // compte une impression. Elle était la dernière vue de
                        // contenu à ne rien remonter.
                        .onAppear { trackImpression(postId: post.id) }
                    }

                    if viewModel.isLoading {
                        ProgressView()
                            .padding()
                    }

                    if viewModel.hasMore && !viewModel.isLoading {
                        Color.clear
                            .frame(height: 1)
                            .onAppear {
                                Task { await viewModel.loadMore() }
                            }
                    }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .navigationTitle(String(localized: "bookmarks.title", defaultValue: "Favoris", bundle: .main))
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.loadBookmarks() }
        .fullScreenCover(isPresented: Binding(
            get: { storyAuthorUserId != nil },
            set: { if !$0 { storyAuthorUserId = nil } }
        )) {
            StoryViewerContainer(
                viewModel: storyViewModel,
                userId: storyAuthorUserId,
                isPresented: Binding(
                    get: { storyAuthorUserId != nil },
                    set: { if !$0 { storyAuthorUserId = nil } }
                ),
                singleGroup: true,
                startAtFirstUnviewed: true,
                presentationSource: "BookmarksView.authorAvatar"
            )
            // fullScreenCover n'hérite pas des EnvironmentObjects — trio
            // requis par StoryViewerView (SharePickerView interne).
            .environmentObject(router)
            .environmentObject(statusViewModel)
            .environmentObject(conversationListViewModel)
        }
    }

    private var filterPicker: some View {
        Picker("", selection: $filter) {
            ForEach(BookmarkFilter.allCases) { option in
                Text(option.label).tag(option)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .accessibilityLabel(String(localized: "bookmarks.filter.a11y", defaultValue: "Filtrer les favoris", bundle: .main))
    }

    private func trackImpression(postId: String) {
        impressions.record(postId)
    }

    /// Un réel s'ouvre dans le lecteur immersif, amorcé avec les SEULS réels
    /// enregistrés : y glisser les posts enregistrés donnerait des pages vides
    /// entre deux vidéos.
    private func openBookmark(_ post: FeedPost) {
        HapticFeedback.medium()
        if post.isReel {
            ReelsPresenter.shared.present(
                posts: FeedPost.reels(from: viewModel.posts),
                startId: post.id
            )
        } else {
            router.push(.postDetail(post.id, post))
        }
        Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
    }

    private var bookmarksEmptyTitle: String {
        String(localized: "bookmarks.empty.title", defaultValue: "Aucun favori", bundle: .main)
    }

    private var bookmarksEmptySubtitle: String {
        String(localized: "bookmarks.empty.subtitle", defaultValue: "Les posts et les réels que vous enregistrez apparaîtront ici", bundle: .main)
    }

    // Reconstruit localement le rendu de `EmptyStateView` : ce composant
    // partagé encapsule son icône, ce qui empêche de la masquer
    // individuellement depuis un site d'appel. Le glyphe (bookmark) est
    // purement décoratif — le titre et le sous-titre disent déjà tout — donc
    // `.accessibilityHidden(true)` l'exclut explicitement avant que
    // `.accessibilityElement(children: .combine)` ne fusionne le reste
    // (titre + sous-titre) en un seul arrêt VoiceOver ; sans ce masquage, le
    // nom brut du symbole ("bookmark") s'ajoutait à l'annonce.
    private var emptyState: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Image(systemName: "bookmark")
                .font(MeeshyFont.relative(52, weight: .light))
                .foregroundColor(Color(hex: MeeshyColors.brandPrimaryHex).opacity(0.4))
                .accessibilityHidden(true)

            Text(bookmarksEmptyTitle)
                .font(MeeshyFont.relative(18, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Text(bookmarksEmptySubtitle)
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xxxl)
        }
        .padding(.top, 80)
        .accessibilityElement(children: .combine)
    }
}
