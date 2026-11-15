import SwiftUI
import MeeshySDK
import MeeshyUI

/// **LE filet de citation de la rangée plate** — celui de « Vous : … », porté
/// par TOUTES les citations de Script et de Focal (porteur, 2026-09-25, #7881).
///
/// La citation de message le dessinait seule, en ligne ; la carte d'une story
/// citée, posée au même retrait, n'en avait aucun — deux dialectes pour une
/// même fonction. Le filet, sa couleur et son écart vivent ici, une fois.
struct FocalQuoteRail: View {
    let colorHex: String

    /// L'écart entre le filet et le contenu cité.
    static let spacing: CGFloat = 8

    /// La couleur du filet : l'accent de la conversation quand la citation
    /// est de MOI, sinon la couleur de l'auteur cité, déjà résolue par le SDK.
    static func colorHex(for reference: ReplyReference, accentHex: String) -> String {
        reference.isMe ? accentHex : reference.authorColor
    }

    var body: some View {
        RoundedRectangle(cornerRadius: FocalMetrics.Quote.railWidth / 2)
            .fill(Color(hex: colorHex))
            .frame(width: FocalMetrics.Quote.railWidth)
    }
}

/// La carte d'une story citée, AVEC le filet de citation — à l'origine du
/// contenu (la colonne du nom, #7995), à sa taille de 132 pt inchangée.
struct FocalStoryCitationQuote: View {
    let reply: ReplyReference
    let isDark: Bool
    let accentHex: String
    var onOpen: (() -> Void)?

    var body: some View {
        HStack(spacing: FocalQuoteRail.spacing) {
            FocalQuoteRail(colorHex: FocalQuoteRail.colorHex(for: reply, accentHex: accentHex))
            BubbleStoryCitationCard(reply: reply, isDark: isDark, accentHex: accentHex, onOpen: onOpen)
                .equatable()
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.leading, FocalMetrics.Row.contentIndent)
    }
}
