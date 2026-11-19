import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Lui envoyer un contenu » (#19628, planche `Autre-Actions`, rangée « Ensemble ») : mes publications, mes réels et
/// mes stories en rangée de vignettes du kit (K20), un toucher choisit, « Envoyer » part vers notre conversation
/// directe. Cache d'abord : le modèle des publications du profil sert ce qu'il a, les squelettes ne paraissent que sur
/// un cache vide.
struct ProfileSendContentSheet: View {
    let tint: Color

    @StateObject private var model: ProfileSendContentViewModel
    @StateObject private var posts: ProfileUserPostsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var hasSettled = false

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
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ProfileSendContentCopy.title)
                kindChips
                content
                MeeshyButton(ProfileSendContentCopy.send(to: model.displayName), systemImage: "paperplane.fill",
                             width: .fill, tint: tint, isPending: model.isSending,
                             disabledReason: selected == nil ? ProfileSendContentCopy.pickFirst : nil,
                             action: { send() })
                    .disabled(selected == nil)
                    .accessibilityIdentifier("profile.sendContent.send")
            }
            .padding(MeeshySpacing.xl)
        }
        .task {
            await posts.loadInitial()
            hasSettled = true
        }
        .task(id: PagingKey(kind: model.kind, served: posts.posts.count, wanted: pagesFurther)) {
            guard pagesFurther else { return }
            await posts.loadMore()
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
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

    private static let words = MeeshyThumbnailRowWords(
        add: ProfileSendContentCopy.pick, duplicate: ProfileSendContentCopy.pick,
        moveEarlier: ProfileSendContentCopy.pick, moveLater: ProfileSendContentCopy.pick
    )

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
            loadingRow
        case .failed:
            failure
        case .empty:
            MeeshyNote(ProfileSendContentCopy.nothing(model.kind), lead: .systemImage("tray"), tint: tint)
        case .choices:
            choiceRow(choices)
            if posts.hasMore && posts.paginationState != .exhausted {
                MeeshyButton(ProfileSendContentCopy.older, systemImage: "clock.arrow.circlepath", kind: .tinted,
                             size: .s44, tint: tint, isPending: posts.isLoadingMore,
                             action: { Task { await posts.loadMore() } })
                    .accessibilityIdentifier("profile.sendContent.older")
            }
        }
    }

    private func choiceRow(_ shown: [FeedPost]) -> some View {
        MeeshyThumbnailRow(
            shown.map { MeeshyThumbnail(id: $0.id, accessibilityLabel: ProfileSendContentCopy.label(of: $0)) },
            current: model.selectedId,
            label: ProfileSendContentCopy.kind(model.kind),
            words: Self.words,
            alignment: .leading,
            onSelect: { id in model.selectedId = id },
            content: { thumbnail, state in
                ProfileSendContentTile(post: shown.first { $0.id == thumbnail.id }, size: state.size, tint: tint)
            }
        )
    }

    /// Le chargement a la forme de la rangée qui le remplace : trois vignettes K20 « en préparation », aux mesures
    /// de la rangée servie — rien ne saute à l'arrivée des contenus.
    private var loadingRow: some View {
        MeeshyThumbnailRow(
            (0..<3).map { MeeshyThumbnail(id: "loading-\($0)", accessibilityLabel: ProfileSendContentCopy.kind(model.kind),
                                          status: .preparing) },
            current: nil,
            label: ProfileSendContentCopy.kind(model.kind),
            words: Self.words,
            alignment: .leading,
            content: { _, _ in tint.opacity(MeeshyOpacity.light) }
        )
        .allowsHitTesting(false)
        .accessibilityHidden(true)
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

/// Une vignette de « Lui envoyer un contenu » : l'image servie du contenu, ou, pour une publication sans média, la
/// première ligne de son texte posée sur l'aplat — deux publications texte se distinguent à l'œil.
private struct ProfileSendContentTile: View {
    let post: FeedPost?
    let size: CGSize
    let tint: Color

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if let post, let text = ProfileSendContentCopy.textTile(of: post) {
            ZStack(alignment: .topLeading) {
                tint.opacity(MeeshyOpacity.light)
                Text(text)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .padding(MeeshySpacing.xs)
                    .accessibilityHidden(true)
            }
        } else {
            CachedAsyncImage(url: post.flatMap { ProfilePublicationTiles.thumbnail(of: $0) },
                             targetSize: size, showsStatusOverlays: false) {
                tint.opacity(MeeshyOpacity.light)
            }
            .scaledToFill()
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
