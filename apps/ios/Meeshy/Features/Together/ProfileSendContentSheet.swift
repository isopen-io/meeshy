import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Lui envoyer un contenu » (#19628, planche `Autre-Actions`, rangée « Ensemble ») : mes publications, mes réels et
/// mes stories en grille de cartes larges, trois par ligne, défilement vertical (#20243) ; un toucher choisit,
/// « Envoyer » part vers notre conversation directe. Cache d'abord : le modèle des publications du profil sert ce
/// qu'il a, les squelettes ne paraissent que sur un cache vide. Une vidéo seule se joue sur place, muette, une seule à
/// la fois — celle que la politique du fil élit.
struct ProfileSendContentSheet: View {
    let tint: Color

    @StateObject private var model: ProfileSendContentViewModel
    @StateObject private var posts: ProfileUserPostsViewModel
    @StateObject private var autoplay = ReelFeedAutoplayCoordinator()
    @Environment(\.dismiss) private var dismiss
    @State private var hasSettled = false
    @State private var gridWidth: CGFloat = 0

    init(userId: String, displayName: String, tint: Color,
         meId: String = AuthManager.shared.currentUser?.id ?? "") {
        self.tint = tint
        _model = StateObject(wrappedValue: ProfileSendContentViewModel(userId: userId, displayName: displayName))
        _posts = StateObject(wrappedValue: ProfileUserPostsViewModel(userId: meId))
    }

    private var choices: [FeedPost] { model.choices(from: posts.posts) }

    private var selected: FeedPost? {
        guard let id = model.selectedId else { return nil }
        return choices.first { $0.id == id }
    }

    var body: some View {
        GeometryReader { viewport in
            let viewportFrame = viewport.frame(in: .global)
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    MeeshySectionHeader(title: ProfileSendContentCopy.title)
                    kindChips
                    content
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(widthReader)
                }
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.xl)
            }
            .onPreferenceChange(ReelVisibilityPreferenceKey.self) { frames in
                autoplay.update(frames: frames, viewportMinY: viewportFrame.minY, viewportMaxY: viewportFrame.maxY)
            }
        }
        .safeAreaInset(edge: .bottom) { sendBar }
        .task {
            await posts.loadInitial()
            hasSettled = true
        }
        .task(id: PagingKey(kind: model.kind, served: posts.posts.count, wanted: pagesFurther)) {
            guard pagesFurther else { return }
            await posts.loadMore()
        }
        .onDisappear(perform: releasePlayback)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var sendBar: some View {
        MeeshyButton(ProfileSendContentCopy.send(to: model.displayName), systemImage: "paperplane.fill",
                     width: .fill, tint: tint, isPending: model.isSending,
                     disabledReason: selected == nil ? ProfileSendContentCopy.pickFirst : nil,
                     action: { send() })
            .disabled(selected == nil)
            .accessibilityIdentifier("profile.sendContent.send")
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(.bar)
    }

    private var widthReader: some View {
        GeometryReader { proxy in
            Color.clear
                .onAppear { gridWidth = proxy.size.width }
                .adaptiveOnChange(of: proxy.size.width) { _, width in gridWidth = width }
        }
    }

    private var kindChips: some View {
        MeeshyChipRow(
            ProfileSendContentKind.allCases.map { MeeshyChip(id: $0, title: ProfileSendContentCopy.kind($0)) },
            selection: [model.kind],
            label: ProfileSendContentCopy.kinds,
            surface: .theme,
            size: .compact,
            onChange: { _, tapped in
                model.kind = tapped
                model.selectedId = nil
            }
        )
    }

    nonisolated private struct PagingKey: Hashable {
        let kind: ProfileSendContentKind
        let served: Int
        let wanted: Bool
    }

    private var listing: ProfileSendContentListing {
        ProfileSendContentListing.resolve(hasChoices: !choices.isEmpty, settled: hasSettled,
                                          isLoading: posts.isLoading || posts.isLoadingMore,
                                          hasMore: posts.hasMore, pagination: posts.paginationState)
    }

    private var pagesFurther: Bool {
        ProfileSendContentListing.pagesFurther(hasChoices: !choices.isEmpty, settled: hasSettled,
                                               isLoading: posts.isLoading || posts.isLoadingMore,
                                               hasMore: posts.hasMore, pagination: posts.paginationState)
    }

    @ViewBuilder
    private var content: some View {
        switch listing {
        case .loading:
            ProfileSendContentGridSkeleton(kind: model.kind, tint: tint, width: gridWidth)
        case .failed:
            failure
        case .empty:
            MeeshyNote(ProfileSendContentCopy.nothing(model.kind), lead: .systemImage("tray"), tint: tint)
        case .choices:
            ProfileSendContentGrid(posts: choices, kind: model.kind, selectedId: model.selectedId, tint: tint,
                                   width: gridWidth, autoplay: autoplay,
                                   onSelect: { id in
                                       HapticFeedback.soft()
                                       model.selectedId = id
                                   })
            if posts.hasMore && posts.paginationState != .exhausted {
                MeeshyButton(ProfileSendContentCopy.older, systemImage: "clock.arrow.circlepath", kind: .tinted,
                             size: .s44, tint: tint, isPending: posts.isLoadingMore,
                             action: { Task { await posts.loadMore() } })
                    .accessibilityIdentifier("profile.sendContent.older")
            }
        }
    }

    private var failure: some View {
        let offline = NetworkMonitor.shared.isOffline
        return MeeshyStateBlock(
            kind: offline ? .offline : .error,
            title: offline ? ProfileSendContentCopy.offline : ProfileSendContentCopy.loadError,
            primary: MeeshyStateBlockAction(title: ProfileSendContentCopy.retry, systemImage: "arrow.clockwise",
                                            perform: { retry() }),
            art: .none,
            size: .compact,
            tint: tint
        )
    }

    private func retry() {
        Task {
            hasSettled = false
            if posts.posts.isEmpty {
                await posts.loadInitial()
            } else {
                await posts.loadMore()
            }
            hasSettled = true
        }
    }

    /// La feuille fermée ne garde rien : l'élection s'éteint et le moteur partagé se libère s'il jouait une de ses
    /// vidéos.
    private func releasePlayback() {
        autoplay.clear()
        let manager = SharedAVPlayerManager.shared
        guard ProfileSendContentPlayback.releasesEngine(activeURL: manager.activeURL, shown: choices) else { return }
        manager.stop()
    }

    private func send() {
        guard let post = selected else { return }
        HapticFeedback.light()
        Task {
            guard let outcome = await model.send(post) else { return }
            switch outcome {
            case .sent, .queued:
                FeedbackToastManager.shared.showSuccess(ShareSheetCopy.sentTo(model.displayName))
                dismiss()
            case .failed(let reason):
                FeedbackToastManager.shared.showError(reason)
            }
        }
    }
}

/// Les mots de « Lui envoyer un contenu ».
enum ProfileSendContentCopy {
    static var title: String {
        String(localized: "profile.sendContent.title", defaultValue: "Lui envoyer un contenu", bundle: .main)
    }

    /// Provisoire : l'icône de l'envoi d'un contenu attend la décision #18844.
    static let glyph = "arrowshape.turn.up.right"

    static var kinds: String {
        String(localized: "profile.sendContent.kinds", defaultValue: "Quel contenu ?", bundle: .main)
    }

    static var pick: String {
        String(localized: "profile.sendContent.pick", defaultValue: "Choisir", bundle: .main)
    }

    static var pickFirst: String {
        String(localized: "profile.sendContent.pickFirst", defaultValue: "Choisissez d'abord un contenu", bundle: .main)
    }

    static func send(to name: String) -> String {
        String(format: String(localized: "profile.sendContent.send", defaultValue: "Envoyer à %@", bundle: .main), name)
    }

    static func kind(_ kind: ProfileSendContentKind) -> String {
        switch kind {
        case .publication:
            return String(localized: "profile.sendContent.kind.publication", defaultValue: "Publications", bundle: .main)
        case .reel, .story:
            return kind.genre.title
        }
    }

    static func nothing(_ kind: ProfileSendContentKind) -> String {
        kind == .publication ? ProfilePublicationGenre.all.emptyTitle : kind.genre.emptyTitle
    }

    static var older: String {
        String(localized: "profile.sendContent.older", defaultValue: "Voir plus ancien", bundle: .main)
    }

    static var offline: String {
        String(localized: "profile.sendContent.offline", defaultValue: "Vous êtes hors ligne", bundle: .main)
    }

    static var loadError: String {
        String(localized: "profile.posts.loadError", defaultValue: "Erreur lors du chargement des publications",
               bundle: .main)
    }

    static var retry: String {
        String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main)
    }

    static func label(of post: FeedPost) -> String {
        let line = firstLine(of: post)
        guard line.isEmpty else { return String(line.prefix(60)) }
        return kind(ProfileSendContentKind.allCases.first { $0.accepts(post) } ?? .publication)
    }

    static var videoWord: String {
        String(localized: "profile.vitrine.posts.video", defaultValue: "Vidéo", bundle: .main)
    }

    static var soundWord: String {
        String(localized: "profile.sendContent.sound", defaultValue: "Son", bundle: .main)
    }

    static func mediaCount(_ count: Int) -> String {
        String(format: String(localized: "profile.sendContent.mediaCount", defaultValue: "%lld médias", bundle: .main),
               count)
    }

    /// Ce que VoiceOver dit d'une carte de la grille : ce qu'elle montre (vidéo, photo, « 3 médias », son, story…),
    /// puis le début de son texte.
    static func spokenLabel(of post: FeedPost, showcase: ContentCard.Showcase? = nil) -> String {
        let lead: String?
        switch (showcase ?? ContentCard.Showcase(post: post)).visual {
        case .slideshow(let pages): lead = mediaCount(pages.count)
        case .sound: lead = soundWord
        case .none: lead = nil
        case .media, .scene: lead = ProfilePublicationsCopy.kindName(of: post)
        }
        let line = String(firstLine(of: post).prefix(80))
        let spoken = [lead, line.isEmpty ? nil : line].compactMap { $0 }.joined(separator: ", ")
        return spoken.isEmpty ? label(of: post) : spoken
    }

    /// La première ligne d'une publication SANS média, posée dans sa vignette ; `nil` dès qu'une image la montre.
    static func textTile(of post: FeedPost) -> String? {
        guard ProfilePublicationTiles.thumbnail(of: post) == nil else { return nil }
        let line = firstLine(of: post)
        return line.isEmpty ? nil : line
    }

    private static func firstLine(of post: FeedPost) -> String {
        let text = post.content.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.split(separator: "\n").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
    }
}
