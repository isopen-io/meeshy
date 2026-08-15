import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bloc citation NU de la rangée plate — retrait `29`
/// (`FocalMetrics.Text.indent`), au-dessus du texte du message qui répond.
///
/// **Rendu NATIF** (arbitrage F-083bis — remplace la réutilisation verbatim
/// de `BubbleQuotedReply` livrée par F-082) : le filet est dessiné ICI, à
/// `FocalMetrics.Quote.railWidth` (`2.5`, miroir de `thread.quote.borderSize`
/// — VÉRIFIÉ présent dans `lentille-tokens.json` avant d'écrire ce fichier,
/// RE-PREUVE §0 : rien à signaler, aucun repli nécessaire), couleur de
/// l'auteur cité (`reference.authorColor`, déjà résolue par le SDK —
/// `ReplyReference.init` retombe sur `DynamicColorGenerator.colorForName`
/// quand `authorColor` est absent : « l'accent existant du SDK », jamais
/// reconstruit ici). Une seule ligne tronquée (`.lineLimit(1)`), même
/// approche native que `Focal/Row/FocalSystemRows.swift` (F-082) et pour la
/// MÊME raison : le composant réel (`BubbleQuotedReply`,
/// `BubbleQuotedReply.swift:125-127`) dessine un filet `4`pt fixe
/// (`RoundedRectangle(cornerRadius: 2).frame(width: 4)`) et jusqu'à 2-3
/// lignes de preview, sans aucun paramètre pour ajuster ni l'un ni l'autre
/// — chrome incompatible avec la cote demandée. Reconstruit nativement
/// plutôt que réutilisé tel quel ; le composant réel reste par ailleurs
/// INTACT (§1.3, personne ne l'édite).
///
/// **Résolution de langue/texte** : `reference.previewText` (comme
/// `authorColor`) est une valeur DÉJÀ RÉSOLUE en amont par le Prisme/le
/// builder de `ReplyReference` — ce bloc ne fait AUCUNE seconde résolution,
/// juste un rendu à une ligne de ce que le résolveur existant a produit
/// (même règle que WS-3/WS-4 partout ailleurs : aucun `@State` de langue).
/// `MessageTextRenderer.render` (déjà utilisé par
/// `BubbleQuotedReply`/`BubbleExpandableText`, §1.3) reste le seul renderer
/// de texte de ce fichier — mentions/hashtags continuent de se colorer,
/// rien n'est réinventé là non plus. `AttachmentKind` (glyphe + libellé
/// court, via `BubbleQuotedReply.resolveAttachmentKind`, méthode statique
/// accessible — pas `fileprivate`) et les clés i18n `bubble.reply.*` sont
/// les MÊMES que celles de `BubbleQuotedReply` — un seul domicile i18n,
/// jamais dupliqué.
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

    private var reference: ReplyReference { reply.reference }

    /// Couleur de l'auteur CITÉ — `accentHex` (l'accent de LA CONVERSATION)
    /// seulement quand la citation pointe vers son propre message (`isMe`) ;
    /// sinon `reference.authorColor`, déjà résolu par le SDK. Même règle
    /// que le filet historique de `BubbleQuotedReply` (contrat Focal §0 :
    /// « couleur de l'auteur cité »).
    private var railColor: Color {
        Color(hex: reference.isMe ? accentHex : reference.authorColor)
    }

    private var titleColor: Color {
        isDark ? Color.white.opacity(0.85) : Color.black.opacity(0.75)
    }

    private var previewColor: Color {
        ThemeManager.shared.textMuted
    }

    private var title: String {
        if reference.isMe { return String(localized: "bubble.reply.you", defaultValue: "Vous", bundle: .main) }
        if !reference.authorName.isEmpty { return reference.authorName }
        if reference.moodEmoji != nil { return String(localized: "bubble.reply.mood", defaultValue: "Humeur", bundle: .main) }
        return reference.authorName
    }

    var body: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: FocalMetrics.Quote.railWidth / 2)
                .fill(railColor)
                .frame(width: FocalMetrics.Quote.railWidth)

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(titleColor)
                    .lineLimit(1)

                previewLine
                    .lineLimit(1)
            }
        }
        .padding(.leading, FocalMetrics.Text.indent)
        .contentShape(Rectangle())
        .onTapGesture {
            guard !reference.messageId.isEmpty else { return }
            if reply.isStory {
                onStoryReplyTap?(reference.messageId)
            } else {
                onReplyTap?(reference.messageId)
            }
        }
    }

    /// Une seule ligne, quel que soit le genre de citation — mood / story /
    /// message avec pièce jointe / message texte simple.
    @ViewBuilder
    private var previewLine: some View {
        if let emoji = reference.moodEmoji {
            HStack(spacing: 4) {
                Text(emoji).font(MeeshyFont.relative(MeeshyFont.captionSize))
                Text(reference.previewText)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize))
                    .foregroundColor(previewColor)
            }
        } else if reference.isStoryReply {
            HStack(spacing: 4) {
                Image(systemName: "camera.fill")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(previewColor)
                    .accessibilityHidden(true)
                Text(String(localized: "bubble.reply.story", defaultValue: "Story", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(previewColor)
            }
        } else {
            let attachmentKind = BubbleQuotedReply.resolveAttachmentKind(reference.attachmentType)
            HStack(spacing: 4) {
                if let kind = attachmentKind {
                    Image(systemName: kind.sfSymbolName)
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundColor(previewColor)
                        .accessibilityHidden(true)
                }
                let fallback = attachmentKind?.shortLabel ?? String(localized: "bubble.reply.media", defaultValue: "Media", bundle: .main)
                MessageTextRenderer.render(
                    reference.previewText.isEmpty ? fallback : reference.previewText,
                    fontSize: 12,
                    color: previewColor,
                    mentionColor: MeeshyColors.mentionColor(isDark: isDark),
                    hashtagColor: MeeshyColors.hashtagColor(isDark: isDark),
                    accentColor: previewColor,
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
                .tint(previewColor)
            }
        }
    }
}
