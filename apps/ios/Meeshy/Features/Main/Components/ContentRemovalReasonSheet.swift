import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce qu'un administrateur retire (#11151) — nomme la feuille, rien d'autre.
enum ContentRemovalKind: String, Identifiable, Equatable {
    case message
    case post
    case reel
    case story
    case comment

    var id: String { rawValue }

    static let symbol = "xmark.shield"

    var sheetTitle: String {
        switch self {
        case .message: return String(localized: "moderation.removal.title.message", defaultValue: "Retirer ce message", bundle: .main)
        case .post: return String(localized: "moderation.removal.title.post", defaultValue: "Retirer cette publication", bundle: .main)
        case .reel: return String(localized: "moderation.removal.title.reel", defaultValue: "Retirer ce réel", bundle: .main)
        case .story: return String(localized: "moderation.removal.title.story", defaultValue: "Retirer cette story", bundle: .main)
        case .comment: return String(localized: "moderation.removal.title.comment", defaultValue: "Retirer ce commentaire", bundle: .main)
        }
    }

    static let severalMessagesTitleKey = "moderation.removal.title.messages"

    /// La clé du titre selon le NOMBRE retiré (#11520) : une sélection de
    /// plusieurs messages dit combien partent ; les autres surfaces n'en retirent qu'un.
    func titleKey(count: Int) -> String {
        guard self == .message, count > 1 else { return "moderation.removal.title.\(rawValue)" }
        return Self.severalMessagesTitleKey
    }

    func sheetTitle(count: Int) -> String {
        guard titleKey(count: count) == Self.severalMessagesTitleKey else { return sheetTitle }
        return String(localized: "moderation.removal.title.messages", defaultValue: "Retirer \(count) messages", bundle: .main)
    }

    /// Le retour d'une suppression : celle de l'auteur dit « supprimé », un
    /// retrait (avec motif) dit que l'auteur sera prévenu.
    static func successText(reason: String?, deleted: String) -> String {
        guard reason != nil else { return deleted }
        return String(localized: "moderation.removal.done", defaultValue: "Contenu retiré — l'auteur est prévenu", bundle: .main)
    }

    static func of(post: FeedPost) -> ContentRemovalKind {
        if post.isReel { return .reel }
        return post.isStory ? .story : .post
    }
}

/// **La feuille du motif d'un retrait — UNE pour toutes les surfaces** (#11151) :
/// message d'un groupe, publication, réel, story, commentaire. Le motif est
/// requis (3 à 500 caractères, `ContentRemovalPolicy.normalizedReason`), et la
/// feuille dit à l'administrateur que l'auteur le lira. « Retirer » referme la
/// feuille AUSSITÔT : le retrait est optimiste chez l'hôte, qui revient en
/// arrière si la passerelle refuse. Présentée par `ContentRemovalPresenter`.
struct ContentRemovalReasonSheet: View {
    let kind: ContentRemovalKind
    var count: Int = 1
    /// Retirer, ou rendre privé (#11535) — la même feuille, les mots du geste.
    var gesture: ContentModerationGesture = .remove
    let onConfirm: (String) -> Void
    /// Referme la feuille — le contrôleur qui la présente (`ContentRemovalPresenter`).
    let onClose: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var reason = ""

    private var isDark: Bool { colorScheme == .dark }
    private var normalized: String? { ContentRemovalPolicy.normalizedReason(reason) }
    private var maxLength: Int { ContentRemovalPolicy.reasonLengthRange.upperBound }
    private var isOverLimit: Bool { reason.trimmingCharacters(in: .whitespacesAndNewlines).count > maxLength }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    Text(gesture.reasonLabel)
                        .font(.callout.weight(.semibold))
                        .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
                        .accessibilityAddTraits(.isHeader)
                    reasonField
                    footer
                }
                .padding(.horizontal, MeeshySpacing.xl)
                .padding(.vertical, MeeshySpacing.lg)
            }
            .navigationTitle(gesture.sheetTitle(for: kind, count: count))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
        }
    }

    private var reasonField: some View {
        TextField(
            gesture.reasonPlaceholder,
            text: $reason,
            axis: .vertical
        )
        .font(.body)
        .lineLimit(3...8)
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(ReportSheetPalette.inputBackground(isDark: isDark))
        )
        .accessibilityLabel(gesture.reasonLabel)
        .accessibilityHint(String(localized: "moderation.removal.author_notified", defaultValue: "L'auteur sera prévenu du motif.", bundle: .main))
        .accessibilityIdentifier("moderation.removal.reason")
    }

    private var footer: some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.sm) {
            Label(String(localized: "moderation.removal.author_notified", defaultValue: "L'auteur sera prévenu du motif.", bundle: .main), systemImage: "bell")
                .font(.footnote)
                .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
            Spacer(minLength: MeeshySpacing.sm)
            Text("\(reason.trimmingCharacters(in: .whitespacesAndNewlines).count)/\(maxLength)")
                .font(.caption.monospacedDigit())
                .foregroundColor(isOverLimit ? MeeshyColors.error : MeeshyColors.textMuted(isDark: isDark))
                .accessibilityHidden(true)
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { onClose() }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button(role: .destructive) {
                guard let normalized else { return }
                HapticFeedback.medium()
                onConfirm(normalized)
                onClose()
            } label: {
                Text(gesture.confirmLabel)
                    .fontWeight(.semibold)
            }
            .tint(MeeshyColors.error)
            .disabled(normalized == nil)
            .accessibilityIdentifier("moderation.removal.confirm")
        }
    }
}

/// **Les entrées destructives du menu « … » d'une publication** (#11151) :
/// « Supprimer » pour l'auteur, « Rendre privé » et « Retirer » pour la
/// modération (#11535) — l'hôte décide
/// laquelle s'offre en passant, ou non, sa fermeture.
struct PublicationDestructiveMenuItems: View {
    let postId: String
    let onDelete: ((String) -> Void)?
    let onRemove: PublicationModerationOffer?

    var body: some View {
        if let onDelete {
            Divider()
            Button(role: .destructive) {
                onDelete(postId)
                HapticFeedback.medium()
            } label: {
                Label(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
            }
        }
        if let onRemove {
            Divider()
            Button {
                HapticFeedback.medium()
                onRemove.makePrivate(postId)
            } label: {
                Label(ContentModerationGesture.makePrivate.actionLabel, systemImage: ContentModerationGesture.privateSymbol)
            }
            .accessibilityIdentifier("moderation.private.action")
            Button(role: .destructive) {
                HapticFeedback.medium()
                onRemove.remove(postId)
            } label: {
                Label(ContentModerationGesture.remove.actionLabel, systemImage: ContentRemovalKind.symbol)
            }
        }
    }
}
