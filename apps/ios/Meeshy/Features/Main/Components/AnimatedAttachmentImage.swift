import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce qu'une image jointe montre de son mouvement à un endroit donné (#4984).
nonisolated enum AttachmentAnimationPresentation: Equatable {
    /// Une image fixe : le chemin progressif, sans aucun décodage animé.
    case still
    /// Une image animable seule à sa place : elle joue en boucle.
    case animated
    /// Une image animée dans une grille : figée, marquée « GIF », elle joue en plein écran.
    case stillMarkedGIF
}

/// **Une image animée envoyée en PIÈCE JOINTE joue, seule ou en plein écran** (#4984).
///
/// Seul le TYPE déclaré par la pièce ouvre le chemin animé : une photo JPEG,
/// PNG ou HEIC ne lit jamais ses octets une seconde fois et ne monte jamais le
/// décodeur. Un WebP peut être fixe : il tente le chemin animé, et le décodeur
/// rend `nil` pour une image unique, ce qui garde la vue progressive.
nonisolated enum AttachmentAnimationRule {
    static let animatableMimeTypes: Set<String> = ["image/gif", "image/webp", "image/apng"]
    static let markedMimeTypes: Set<String> = ["image/gif", "image/apng"]

    /// Largeur d'une carte du fil ou d'un réel sur le plus grand iPhone : le
    /// budget de décodage d'une image pleine largeur dont la taille n'est pas
    /// encore mesurée.
    static let fullWidthPointSize: CGFloat = 440

    static func normalized(_ mimeType: String) -> String {
        let base = mimeType.split(separator: ";").first.map(String.init) ?? mimeType
        return base.trimmingCharacters(in: .whitespaces).lowercased()
    }

    static func declaresAnimatableContainer(mimeType: String) -> Bool {
        animatableMimeTypes.contains(normalized(mimeType))
    }

    static func presentation(mimeType: String, inGrid: Bool) -> AttachmentAnimationPresentation {
        let mime = normalized(mimeType)
        guard animatableMimeTypes.contains(mime) else { return .still }
        guard inGrid else { return .animated }
        return markedMimeTypes.contains(mime) ? .stillMarkedGIF : .still
    }

    /// Le chemin animé lit l'ORIGINAL : les variantes responsives que sert la
    /// passerelle ne gardent que la première image d'un GIF.
    static func animatedSourceURL(fileUrl: String) -> String? {
        guard !fileUrl.isEmpty else { return nil }
        return MeeshyConfig.resolveMediaURL(fileUrl)?.absoluteString ?? fileUrl
    }

    /// Un plein écran ouvert est un geste explicite ; une bulle suit la même
    /// politique de téléchargement que l'image fixe qu'elle remplace.
    static func mayFetch(explicitOpen: Bool, isLocalFile: Bool, isOnDevice: Bool, policyAllows: Bool) -> Bool {
        explicitOpen || isLocalFile || isOnDevice || policyAllows
    }
}

/// L'image jointe, animée là où la loi le dit, et son chemin fixe partout ailleurs.
///
/// `still` est la vue progressive existante : elle reste affichée pendant le
/// décodage, sous le mouvement réduit, et pour toute image qui ne s'anime pas.
struct AnimatedAttachmentImage<Still: View>: View {
    let mimeType: String
    let fileUrl: String
    let pointSize: CGFloat
    var inGrid: Bool = false
    var explicitOpen: Bool = false
    var byteSize: Int?
    var contentMode: ContentMode = .fill
    @ViewBuilder let still: () -> Still

    var body: some View {
        switch AttachmentAnimationRule.presentation(mimeType: mimeType, inGrid: inGrid) {
        case .still:
            still()
        case .stillMarkedGIF:
            still().overlay(alignment: .topLeading) { AnimatedAttachmentBadge() }
        case .animated:
            animatedBody
        }
    }

    @ViewBuilder
    private var animatedBody: some View {
        if let source = AttachmentAnimationRule.animatedSourceURL(fileUrl: fileUrl), mayFetch(source) {
            AnimatedCachedImage(urlString: source, pointSize: pointSize,
                                contentMode: contentMode == .fill ? .scaleAspectFill : .scaleAspectFit) {
                still()
            }
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        } else {
            still()
        }
    }

    private func mayFetch(_ source: String) -> Bool {
        AttachmentAnimationRule.mayFetch(
            explicitOpen: explicitOpen,
            isLocalFile: source.hasPrefix("file://"),
            isOnDevice: LocalImagePresence.isOnDevice(resolvedURL: source),
            policyAllows: MediaDownloadPolicyEngine.shouldAutoDownload(
                kind: .image,
                condition: NetworkConditionMonitor.shared.condition,
                prefs: MediaDownloadPreferencesStore.shared.preferences,
                byteSize: byteSize
            )
        )
    }
}

/// La pastille d'une image animée figée dans une grille.
struct AnimatedAttachmentBadge: View {
    var body: some View {
        Text(String(localized: "media.badge.gif", defaultValue: "GIF", bundle: .main))
            .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .bold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, MeeshySpacing.xs)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(MeeshyColors.mediaScrim))
            .padding(MeeshySpacing.xsPlus)
            .accessibilityLabel(Text(String(localized: "media.badge.gif.a11y", defaultValue: "Image animée", bundle: .main)))
    }
}

/// L'image d'un média de post, de réel ou de commentaire : le chemin progressif
/// du fil, animé là où la loi le dit. Le fil charge déjà l'original
/// (`autoLoad`) : le chemin animé ne coûte aucun octet de plus.
struct FeedMediaImage: View {
    let media: FeedMedia
    var animates: Bool = true
    var inGrid: Bool = false
    var contentMode: ContentMode = .fill
    var pointSize: CGFloat = AttachmentAnimationRule.fullWidthPointSize

    var body: some View {
        AnimatedAttachmentImage(mimeType: animates && media.type == .image ? media.mimeType ?? "" : "",
                                fileUrl: media.url ?? "", pointSize: pointSize, inGrid: inGrid,
                                explicitOpen: true, contentMode: contentMode) {
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url,
                autoLoad: true
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: contentMode)
        }
    }
}
