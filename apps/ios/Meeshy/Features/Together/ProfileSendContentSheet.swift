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
        .task { await posts.loadInitial() }
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

    @ViewBuilder
    private var content: some View {
        let shown = choices
        if shown.isEmpty && posts.isLoading {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(0..<3, id: \.self) { _ in MeeshyTicket(title: "", code: "", size: .mini, kind: .loading) }
            }
            .accessibilityHidden(true)
        } else if shown.isEmpty {
            MeeshyNote(ProfileSendContentCopy.nothing(model.kind), lead: .systemImage("tray"), tint: tint)
        } else {
            MeeshyThumbnailRow(
                shown.map { MeeshyThumbnail(id: $0.id, accessibilityLabel: ProfileSendContentCopy.label(of: $0)) },
                current: model.selectedId,
                label: ProfileSendContentCopy.kind(model.kind),
                words: Self.words,
                alignment: .leading,
                onSelect: { id in model.selectedId = id },
                content: { thumbnail, state in
                    CachedAsyncImage(url: shown.first { $0.id == thumbnail.id }.flatMap { ProfilePublicationTiles.thumbnail(of: $0) },
                                     targetSize: state.size, showsStatusOverlays: false) {
                        tint.opacity(MeeshyOpacity.light)
                    }
                    .scaledToFill()
                }
            )
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

    static func label(of post: FeedPost) -> String {
        let text = post.content.trimmingCharacters(in: .whitespacesAndNewlines)
        let firstLine = text.split(separator: "\n").first.map(String.init) ?? ""
        guard firstLine.isEmpty else { return String(firstLine.prefix(60)) }
        return kind(ProfileSendContentKind.allCases.first { $0.accepts(post) } ?? .publication)
    }
}
