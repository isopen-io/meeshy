import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bloc citation NU de la rangée plate — retrait `29`
/// (`FocalMetrics.Text.indent`), au-dessus du texte du message qui répond.
///
/// **Réutilise** `BubbleQuotedReply(style: .inline)` (contrat §WS-3, §1.3 —
/// lu, jamais modifié). Vue PURE : entrée = `BubbleContent.Reply`, aucun
/// `@State`.
///
/// **Écart de cote SIGNALÉ, non résolu** (RE-PREUVE §0 avant écriture) : le
/// contrat demande un filet `2.5` pt (`FocalMetrics.Quote.railWidth`,
/// couleur de l'auteur cité) et « une ligne tronquée ». `BubbleQuotedReply`
/// (`BubbleQuotedReply.swift:125-127`) dessine INCONDITIONNELLEMENT sa
/// propre barre d'accent `RoundedRectangle(cornerRadius: 2).frame(width: 4)`
/// (4 pt, pas 2,5) et jusqu'à 2-3 lignes de preview (`lineLimit(2)`/`lineLimit(3)`
/// selon la branche) — AUCUN paramètre n'expose ces deux cotes pour les
/// ajuster côté appelant, et le fichier est explicitement listé §1.3
/// (« lu, jamais modifié ») : la richesse réelle (mood/story preview,
/// vignette, mentions, attachment kind) n'est reproductible qu'en
/// réimplémentant `BubbleQuotedReply` en double — contraire à la règle de
/// réutilisation du même §1.3. Ce bloc réutilise donc `BubbleQuotedReply`
/// TEL QUEL (filet 4 pt, jusqu'à 2-3 lignes) plutôt que d'inventer une
/// citation appauvrie en console de duplication. Écart tracé pour
/// arbitrage : extension possible de `BubbleQuotedReply` (nouveau
/// paramètre `railWidth`/`lineLimit`) hors périmètre WS-3 (fichier non
/// possédé par ce workstream).
struct FocalQuotedReplyView: View, Equatable {
    let reply: BubbleContent.Reply
    let accentHex: String
    let isDark: Bool
    let mentionDisplayNames: [String: String]
    var onReplyTap: ((String) -> Void)? = nil
    var onStoryReplyTap: ((String) -> Void)? = nil

    static func == (lhs: FocalQuotedReplyView, rhs: FocalQuotedReplyView) -> Bool {
        lhs.reply == rhs.reply
            && lhs.accentHex == rhs.accentHex
            && lhs.isDark == rhs.isDark
            && lhs.mentionDisplayNames == rhs.mentionDisplayNames
    }

    var body: some View {
        BubbleQuotedReply(
            style: .inline,
            reply: reply.reference,
            parentIsMe: false,
            accentHex: accentHex,
            isDark: isDark,
            mentionDisplayNames: mentionDisplayNames
        )
        .padding(.leading, FocalMetrics.Text.indent)
        .contentShape(Rectangle())
        .onTapGesture {
            guard !reply.reference.messageId.isEmpty else { return }
            if reply.isStory {
                onStoryReplyTap?(reply.reference.messageId)
            } else {
                onReplyTap?(reply.reference.messageId)
            }
        }
    }
}
