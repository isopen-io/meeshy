import SwiftUI
import MeeshySDK
import MeeshyUI

/// La page plein écran d'une humeur reçue (#10814), ouverte par la notification
/// « nouvelle humeur » : la bannière de l'auteur en fond total, son avatar au
/// centre, le texte de l'humeur décoré, l'emoji qui peuple la vue, et un champ
/// qui répond en privé — la réponse part en citation de l'humeur dans la
/// conversation directe avec l'auteur.
struct MoodSpotlightView: View {
    @StateObject private var viewModel: MoodSpotlightViewModel
    @Environment(\.dismiss) private var dismiss
    // iPad : posée en racine du panneau de droite, où `dismiss()` est un no-op — et la barre masquée
    // cache aussi le chevron de repli du panneau. Sans ce relais, la croix ne fermait rien.
    @Environment(\.isPresented) private var isPresented
    @Environment(\.meeshyPanelDismiss) private var panelDismiss
    private var close: PanelBackAction { .init(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss) }
    @FocusState private var replyFocused: Bool

    init(statusId: String) {
        _viewModel = StateObject(wrappedValue: MoodSpotlightViewModel(statusId: statusId))
    }

    var body: some View {
        ZStack {
            MoodSpotlightBackdrop(
                bannerURL: viewModel.author?.banner,
                bannerThumbHash: viewModel.author?.bannerThumbHash,
                bannerDecor: viewModel.author?.profileDecor?.banner,
                fallbackHex: viewModel.entry?.avatarColor ?? "6366F1"
            )
            .ignoresSafeArea()

            if let entry = viewModel.entry {
                MoodEmojiRainView(emoji: entry.moodEmoji)
                    .ignoresSafeArea()
                    .id(entry.id)
            }

            centerContent
                .padding(.horizontal, 28)
                .contentShape(Rectangle())
                .onTapGesture { replyFocused = false }
        }
        .safeAreaInset(edge: .top) { header }
        .safeAreaInset(edge: .bottom) {
            if viewModel.canReply {
                MoodSpotlightReplyBar(
                    text: $viewModel.replyText,
                    authorName: viewModel.entry?.username ?? "",
                    isSending: viewModel.replyState == .sending,
                    canSend: viewModel.canSend,
                    focus: $replyFocused,
                    onSend: { Task { await viewModel.sendReply() } }
                )
            }
        }
        .navigationBarHidden(true)
        .environment(\.colorScheme, .dark)
        .task { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.replyState) { _, state in
            switch state {
            case .sent:
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "mood.spotlight.reply.sent", defaultValue: "Réponse envoyée", bundle: .main))
            case .failed:
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "mood.spotlight.reply.failed", defaultValue: "La réponse n'est pas partie", bundle: .main))
            case .idle, .sending:
                break
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                close()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .accessibilityLabel(String(localized: "mood.spotlight.close", defaultValue: "Fermer", bundle: .main))
            .accessibilityIdentifier("mood.spotlight.close")
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.xs)
    }

    // MARK: - Center

    @ViewBuilder
    private var centerContent: some View {
        switch viewModel.content {
        case .loading:
            Circle()
                .fill(Color.white.opacity(0.18))
                .frame(width: MoodSpotlightCard.avatarSize, height: MoodSpotlightCard.avatarSize)
                .skeletonShimmer()
                .accessibilityLabel(String(localized: "mood.spotlight.loading", defaultValue: "Chargement de l'humeur", bundle: .main))
        case .mood(let entry):
            MoodSpotlightCard(
                entry: entry,
                avatarURL: viewModel.author?.avatar,
                avatarThumbHash: viewModel.author?.avatarThumbHash,
                ring: viewModel.author?.profileDecor?.avatarRing
            )
        case .unavailable:
            VStack(spacing: 12) {
                Text(verbatim: "🌙").font(MeeshyFont.emoji(56)).accessibilityHidden(true)
                Text(String(localized: "mood.spotlight.unavailable", defaultValue: "Cette humeur n'est plus disponible", bundle: .main))
                    .font(.headline)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

// MARK: - Backdrop

/// La bannière de l'auteur en fond TOTAL, voilée pour que le texte se lise ;
/// sans bannière, un dégradé tiré de la couleur de l'auteur.
private struct MoodSpotlightBackdrop: View {
    let bannerURL: String?
    let bannerThumbHash: String?
    /// La bannière de design équipée (#10946) — peinte seulement sans photo (`bannerPaint`).
    let bannerDecor: ServedProfileDecorItem?
    let fallbackHex: String

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                LinearGradient(
                    colors: [Color(hex: fallbackHex), MeeshyColors.indigo950],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                switch ProfileDecorResolver.bannerPaint(photo: bannerURL, decor: bannerDecor) {
                case .photo(let bannerURL):
                    CachedAsyncImage(url: bannerURL, thumbHash: bannerThumbHash,
                                     showsStatusOverlays: false, autoLoad: true) { Color.clear }
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .clipped()
                case .design(let design):
                    BannerDesignView(design: design, isDark: true, accentHex: fallbackHex)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .clipped()
                case .plain:
                    EmptyView()
                }
                LinearGradient(
                    colors: [.black.opacity(0.5), .black.opacity(0.35), .black.opacity(0.7)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        }
        .accessibilityHidden(true)
    }
}
