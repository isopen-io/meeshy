import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La carte vivante d'un post, d'un réel, d'une story ou d'une humeur
/// Meeshy** (#19332) — à la place de l'aperçu générique de son lien, dans une
/// bulle ou sous le texte d'un post.
///
/// Cache d'abord : une carte déjà vue paraît à la première image ; le
/// squelette n'apparaît que sur cache vide. Un toucher ouvre le contenu DANS
/// l'app par le routeur des liens profonds (`.inAppLinks`, le même chemin
/// qu'un lien meeshy.me touché) ; l'appui long reste celui de l'hôte.
struct ContentLinkCard: View {

    /// Ce que l'hôte montrait avant la carte, quand il n'y a pas de carte.
    enum Fallback {
        /// L'aperçu générique du lien (bulle de message).
        case linkPreview
        /// Rien (texte d'un post, qui ne déplie aucun lien générique).
        case nothing
    }

    let match: ContentLinkMatch
    let accentColor: String
    let isDark: Bool
    let fallback: Fallback

    @StateObject private var model: ContentLinkCardViewModel
    @Environment(\.openURL) private var openURL

    init(match: ContentLinkMatch, accentColor: String, isDark: Bool,
         fallback: Fallback = .linkPreview, excludedPostId: String? = nil,
         model: @autoclosure @escaping () -> ContentLinkCardViewModel? = nil) {
        self.match = match
        self.accentColor = accentColor
        self.isDark = isDark
        self.fallback = fallback
        _model = StateObject(wrappedValue: model() ?? ContentLinkCardViewModel(
            target: match.target, store: ContentCardStore.shared, excludedPostId: excludedPostId
        ))
    }

    var body: some View {
        content
            .task(id: match) { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            ContentLinkCardSkeleton(isDark: isDark)
        case .card(let card):
            Button {
                open()
            } label: {
                ContentLinkCardBody(card: card, accentColor: accentColor, isDark: isDark)
                    .equatable()
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ContentLinkCardCopy.accessibilityLabel(for: card))
            .accessibilityHint(ContentLinkCardCopy.opensHint)
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("content-link-card")
        case .unavailable(let kind):
            ContentLinkCardUnavailable(kind: kind, isDark: isDark)
                .equatable()
        case .fallback:
            if fallback == .linkPreview {
                LinkPreviewCard(urlString: match.url, accentColor: accentColor, isDark: isDark)
            }
        }
    }

    private func open() {
        guard let url = model.destinationURL(linkURL: match.url, webOrigin: MeeshyConfig.shared.webOrigin) else { return }
        HapticFeedback.light()
        openURL(url)
    }
}

// MARK: - Mesures (contrat § 4)

enum ContentLinkCardLayout {
    static let maxWidth: CGFloat = 280
    static let mediaMaxHeight: CGFloat = 220
    static let portraitMediaMaxHeight: CGFloat = 260
    static let skeletonMediaHeight: CGFloat = 160
    static let avatarSide: CGFloat = 20

    /// La hauteur du bloc média pour la largeur maximale de la carte, bornée :
    /// 260 pour le portrait d'un réel ou d'une story, 220 sinon.
    static func mediaHeight(aspectRatio: Double) -> CGFloat {
        let maxHeight = aspectRatio <= ContentCard.portraitAspectRatio ? portraitMediaMaxHeight : mediaMaxHeight
        guard aspectRatio > 0 else { return maxHeight }
        return min(maxHeight, maxWidth / CGFloat(aspectRatio))
    }
}

// MARK: - Surface (celle de la carte de conversation)

struct ContentLinkCardSurface: ViewModifier {
    let isDark: Bool

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: ContentLinkCardLayout.maxWidth, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                    .fill(isDark ? MeeshyColors.indigo950.opacity(MeeshyOpacity.strong) : Color.white.opacity(MeeshyOpacity.intense))
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                    .stroke(isDark ? MeeshyColors.indigo800.opacity(MeeshyOpacity.heavy) : MeeshyColors.indigo100,
                            lineWidth: MeeshyBorder.regular)
            )
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
    }
}

// MARK: - Squelette (cache vide seulement)

struct ContentLinkCardSkeleton: View {
    let isDark: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SkeletonShape(height: ContentLinkCardLayout.skeletonMediaHeight, cornerRadius: MeeshyRadius.xxs)
            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                SkeletonShape(width: 140, height: 12, cornerRadius: MeeshyRadius.xxs)
                SkeletonShape(height: 10, cornerRadius: MeeshyRadius.xxs)
            }
            .padding(MeeshySpacing.smPlus)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(ContentLinkCardSurface(isDark: isDark))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ContentLinkCardCopy.loading)
    }
}

// MARK: - Contenu indisponible (404)

/// Une ligne compacte, atténuée, non cliquable — jamais le texte du lien.
struct ContentLinkCardUnavailable: View, Equatable {
    let kind: PostType?
    let isDark: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: kind?.icon ?? "link")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                .accessibilityHidden(true)
            Text(ContentLinkCardCopy.unavailable)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .foregroundStyle(isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral500)
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.smPlus)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .modifier(ContentLinkCardSurface(isDark: isDark))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("content-link-card-unavailable")
    }
}
