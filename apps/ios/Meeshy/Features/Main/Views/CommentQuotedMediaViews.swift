import SwiftUI
import MeeshySDK
import MeeshyUI

/// **LA CITATION D'UN MÉDIA DE POST, aux DEUX moments où elle se voit** (#6578).
///
/// Le bandeau (`CommentQuotedMediaBanner`) dit *ce dont ce commentaire parle* —
/// sur une ligne de fil déjà publiée. La puce (`CommentQuotationChip`) dit *ce
/// dont je suis en train de parler* — au-dessus du champ de saisie, avec de quoi
/// se raviser. Les deux rendent la MÊME chose et ne peuvent donc pas diverger :
/// une vignette quand la citation est encore rattrapable, la NATURE seule quand
/// elle ne l'est plus.
///
/// > **Un média cité disparu ne vide pas la citation, il la dégrade.**
/// > `CommentQuotedMedia.media == nil` est l'état NOMINAL d'une citation dont la
/// > cible a été supprimée ou détachée de sa publication — le serveur ne
/// > rattrape que ce qui appartient encore au post commenté. Rendre `nil` ici
/// > effacerait la moitié de la phrase que l'utilisateur lit.

// MARK: - Le bandeau d'une ligne publiée

struct CommentQuotedMediaBanner: View {

    let citation: CommentQuotedMedia
    let accentColor: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: 8) {
            // La BARRE de citation — le même signe que partout ailleurs dans le
            // produit pour « ceci est repris d'ailleurs ».
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color(hex: accentColor))
                .frame(width: 3)

            CommentQuotedMediaThumbnail(citation: citation, side: 34, accentColor: accentColor)

            Text(citation.legende)
                .font(.caption)
                .foregroundColor(theme.textMuted)
                .lineLimit(1)

            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(hex: accentColor).opacity(0.06))
        )
        .frame(height: 42)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(citation.libelleAccessibilite))
    }
}

// MARK: - La puce du composer

/// Ce dont le prochain commentaire parlera, avec de quoi se raviser.
///
/// Elle lit le magasin ELLE-MÊME plutôt que de recevoir la citation : ses hôtes
/// sont deux fichiers hors budget qu'on ne peut pas doter d'un `@State` de plus,
/// et surtout la désignation vient d'une modale que l'hôte ne monte pas. Un
/// `@ObservedObject` posé ici referme la boucle sans qu'aucun hôte ait à porter
/// l'état.
struct CommentQuotationChip: View {

    let postId: String
    let accentColor: String

    @ObservedObject private var store = CommentQuotationStore.shared

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if let citation = store.quotation(for: postId) {
            HStack(spacing: 8) {
                CommentQuotedMediaThumbnail(citation: citation, side: 30, accentColor: accentColor)

                VStack(alignment: .leading, spacing: 1) {
                    Text(String(localized: "comment.quote.about",
                                defaultValue: "À propos de",
                                bundle: .main))
                        .font(.caption2)
                        .foregroundColor(theme.textMuted)
                    Text(citation.legende)
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                // **Un bandeau sans retrait est un piège** : l'utilisateur a
                // désigné depuis une AUTRE surface, et sans ce bouton la seule
                // sortie serait de fermer le fil.
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        store.clear(for: postId)
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 22, height: 22)
                        .background(Circle().fill(theme.textMuted.opacity(0.15)))
                }
                .accessibilityLabel(Text(String(localized: "comment.quote.remove",
                                                defaultValue: "Retirer la citation",
                                                bundle: .main)))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }
}

// MARK: - La vignette, site unique

/// La vignette RELUE, ou le symbole de la NATURE quand il n'y a plus rien à
/// relire. Un seul site pour les deux surfaces : c'est exactement le genre de
/// règle qu'un deuxième lecteur recopie de travers, et une divergence ici ferait
/// dire deux choses différentes au même média selon l'endroit où on le regarde.
private struct CommentQuotedMediaThumbnail: View {

    let citation: CommentQuotedMedia
    let side: CGFloat
    let accentColor: String

    var body: some View {
        Group {
            if let url = citation.thumbnailURL {
                ProgressiveCachedImage(
                    thumbHash: citation.media?.thumbHash,
                    thumbnailUrl: url,
                    fullUrl: nil,
                    autoLoad: true
                ) {
                    Color(hex: accentColor).opacity(0.15)
                }
                .aspectRatio(contentMode: .fill)
            } else {
                Color(hex: accentColor).opacity(0.12)
                    .overlay(
                        Image(systemName: citation.kind.symbolName)
                            .font(.system(size: side * 0.42))
                            .foregroundColor(Color(hex: accentColor))
                    )
            }
        }
        .frame(width: side, height: side)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .accessibilityHidden(true)
    }
}

// MARK: - Ce que la citation DIT

extension CommentQuotedMedia {

    /// Le texte servi à côté de la vignette.
    ///
    /// **La légende du média d'abord, sa nature ensuite.** La légende est ce que
    /// l'auteur du post a écrit de CE média ; elle est RELUE à chaque service,
    /// donc elle disparaît d'elle-même si on la retire. La nature est le repli,
    /// et c'est le seul mot qu'une citation dont la cible a disparu a le droit
    /// de dire.
    var legende: String {
        if let caption = media?.caption, !caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return caption
        }
        return nomDeLaNature
    }

    var libelleAccessibilite: String {
        String(localized: "comment.quote.a11y",
               defaultValue: "À propos de : \(legende)",
               bundle: .main)
    }

    private var nomDeLaNature: String {
        switch kind {
        case .image:
            return String(localized: "comment.quote.kind.image", defaultValue: "Une photo", bundle: .main)
        case .video:
            return String(localized: "comment.quote.kind.video", defaultValue: "Une vidéo", bundle: .main)
        case .audio:
            return String(localized: "comment.quote.kind.audio", defaultValue: "Un audio", bundle: .main)
        case .location:
            return String(localized: "comment.quote.kind.location", defaultValue: "Un lieu", bundle: .main)
        case .file:
            return String(localized: "comment.quote.kind.file", defaultValue: "Une pièce jointe", bundle: .main)
        }
    }
}
