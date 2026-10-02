import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les mots de la carte (#9171 — mêmes sens que le web, #9149)

enum VisitorInvitationCopy {

    /// Le nom affiché, sinon le pseudo précédé de « @ ».
    static func sharerName(_ sharer: TrackedLinkSharer) -> String {
        let displayName = sharer.displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return displayName.isEmpty ? "@\(sharer.username)" : displayName
    }

    /// « {nom} vous a partagé ce réel / cette publication », ou « Rejoignez
    /// Meeshy » quand le lien ne nomme personne.
    static func title(kind: VisitorContentKind, sharer: TrackedLinkSharer?) -> String {
        guard let sharer else {
            return String(localized: "visitor.title", defaultValue: "Rejoignez Meeshy", bundle: .main)
        }
        let format: String
        switch kind {
        case .reel:
            format = String(localized: "visitor.sharedBy.reel", defaultValue: "%@ vous a partagé ce réel", bundle: .main)
        case .post:
            format = String(localized: "visitor.sharedBy.post", defaultValue: "%@ vous a partagé cette publication", bundle: .main)
        }
        return String(format: format, sharerName(sharer))
    }

    static var body: String {
        String(localized: "visitor.body",
               defaultValue: "Créez votre compte ou connectez-vous pour réagir, commenter et tout lire dans votre langue.",
               bundle: .main)
    }

    static var signUp: String {
        String(localized: "visitor.signup", defaultValue: "Créer un compte", bundle: .main)
    }

    static var signIn: String {
        String(localized: "visitor.login", defaultValue: "Se connecter", bundle: .main)
    }

    static var keepWatching: String {
        String(localized: "visitor.later", defaultValue: "Continuer à regarder", bundle: .main)
    }

    static var refusedTitle: String {
        String(localized: "visitor.refused.title", defaultValue: "Ce contenu n’est pas accessible", bundle: .main)
    }

    static var refusedBody: String {
        String(localized: "visitor.refused.body",
               defaultValue: "Il n’existe plus, ou il est réservé à son audience. Connectez-vous pour le voir s’il vous est destiné.",
               bundle: .main)
    }

    static var failedBody: String {
        String(localized: "visitor.failed.body",
               defaultValue: "Ce contenu n’a pas pu être chargé. Vérifiez votre connexion et réessayez.",
               bundle: .main)
    }

    static var retry: String {
        String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main)
    }

    static var close: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .main)
    }
}

// MARK: - L'écran visiteur

/// **Le contenu d'un lien universel, en lecture seule, pour qui n'a pas de
/// session** (#9171). Le média et le texte du post (dans la langue du lecteur
/// quand une traduction existe — le Prisme de `toFeedPost`), et par-dessus la
/// carte qui invite à se connecter en nommant qui a partagé le lien.
///
/// Aucun geste n'exige de compte ici : réagir, commenter, partager passent par
/// la connexion, après laquelle le lien en attente ouvre le vrai écran.
struct VisitorContentView: View {
    let request: VisitorContentRequest
    let loader: VisitorContentProviding
    let onAccount: (InviteLandingChoice) -> Void
    let onClose: () -> Void

    @State private var state: VisitorContentState = .pending
    @State private var attempt = 0
    @State private var isCardDismissed = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Color(.systemBackground).ignoresSafeArea()
            content
            if showsCard {
                card
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .overlay(alignment: .topLeading) { closeButton }
        .animation(.easeOut(duration: 0.25), value: showsCard)
        .task(id: attempt) {
            state = .pending
            state = await loader.load(request)
        }
    }

    private var showsCard: Bool {
        switch state {
        case .pending: return false
        case .served: return !isCardDismissed
        case .refused, .failed: return true
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .pending:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .served(let post, _):
            VisitorPostReader(post: post, kind: request.kind)
        case .refused, .failed:
            Color.clear
        }
    }

    private var closeButton: some View {
        Button(action: onClose) {
            Image(systemName: "xmark")
                .font(.body.weight(.semibold))
                .foregroundStyle(.primary)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .background(.ultraThinMaterial, in: Circle())
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityLabel(VisitorInvitationCopy.close)
    }

    private var card: some View {
        VisitorInvitationCard(
            kind: request.kind,
            state: state,
            onSignUp: { onAccount(.signUp) },
            onSignIn: { onAccount(.signIn) },
            onKeepWatching: { isCardDismissed = true },
            onRetry: { attempt += 1 }
        )
    }
}

// MARK: - La carte d'invitation

struct VisitorInvitationCard: View {
    let kind: VisitorContentKind
    let state: VisitorContentState
    let onSignUp: () -> Void
    let onSignIn: () -> Void
    let onKeepWatching: () -> Void
    let onRetry: () -> Void

    private var sharer: TrackedLinkSharer? {
        if case .served(_, let sharer) = state { return sharer }
        return nil
    }

    private var title: String {
        switch state {
        case .refused: return VisitorInvitationCopy.refusedTitle
        default: return VisitorInvitationCopy.title(kind: kind, sharer: sharer)
        }
    }

    private var message: String {
        switch state {
        case .refused: return VisitorInvitationCopy.refusedBody
        case .failed: return VisitorInvitationCopy.failedBody
        case .pending, .served: return VisitorInvitationCopy.body
        }
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            if let sharer {
                MeeshyAvatar(
                    name: VisitorInvitationCopy.sharerName(sharer),
                    context: .postAuthor,
                    avatarURL: sharer.avatar
                )
                .accessibilityHidden(true)
            }
            Text(title)
                .font(.title3.weight(.bold))
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            actions
        }
        .padding(MeeshySpacing.xxl)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: MeeshyRadius.xxl))
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.lg)
        .accessibilityElement(children: .contain)
    }

    private var actions: some View {
        VStack(spacing: MeeshySpacing.sm) {
            if case .failed = state {
                Button(action: onRetry) {
                    Text(VisitorInvitationCopy.retry).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            Button(action: onSignUp) {
                Text(VisitorInvitationCopy.signUp).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(MeeshyColors.brandPrimary)
            .controlSize(.large)
            Button(action: onSignIn) {
                Text(VisitorInvitationCopy.signIn).frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(MeeshyColors.brandPrimary)
            .controlSize(.large)
            if state.isServed {
                Button(action: onKeepWatching) {
                    Text(VisitorInvitationCopy.keepWatching)
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
                }
                .buttonStyle(.plain)
                .foregroundStyle(MeeshyColors.brandPrimary)
            }
        }
    }
}

// MARK: - Le contenu, en lecture seule

/// Le post servi au visiteur : son auteur, ses médias (image ou vidéo), son
/// texte. Rien d'interactif hors de la lecture du média.
struct VisitorPostReader: View {
    let post: FeedPost
    let kind: VisitorContentKind

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                author
                ForEach(Array(post.media.enumerated()), id: \.element.id) { index, media in
                    VisitorMediaView(media: media, isPrimaryVideo: index == primaryVideoIndex)
                }
                if !post.displayContent.isEmpty {
                    Text(post.displayContent)
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshyControlSize.tapTarget + MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.xxxl * 8)
        }
    }

    private var primaryVideoIndex: Int? {
        post.media.firstIndex { $0.type == .video }
    }

    private var author: some View {
        HStack(spacing: MeeshySpacing.sm) {
            MeeshyAvatar(name: post.author, context: .postAuthor, avatarURL: post.authorAvatarURL)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(post.author)
                    .font(.headline)
                if let username = post.authorUsername, !username.isEmpty {
                    Text(verbatim: "@\(username)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }
}

struct VisitorMediaView: View {
    let media: FeedMedia
    let isPrimaryVideo: Bool

    var body: some View {
        switch media.type {
        case .image:
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url,
                autoLoad: true
            ) {
                Color(hex: media.thumbnailColor)
            }
            .aspectRatio(aspectRatio, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
            .accessibilityLabel(media.alt ?? String(localized: "a11y.post.media.image", defaultValue: "Image partagée", bundle: .main))
        case .video:
            let attachment = media.toMessageAttachment()
            VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
                MeeshyVideoPlayer(
                    attachment: attachment,
                    style: .inline,
                    controls: .inlineDefault,
                    accentColor: MeeshyColors.brandPrimaryHex,
                    frame: .card,
                    availability: availability,
                    performance: .inline,
                    autoplayOnAppear: isPrimaryVideo,
                    autoplayMuted: true,
                    onDownload: onDownload
                )
            }
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        default:
            EmptyView()
        }
    }

    private var aspectRatio: CGFloat? {
        guard let width = media.width, let height = media.height, width > 0, height > 0 else { return nil }
        return CGFloat(width) / CGFloat(height)
    }
}
