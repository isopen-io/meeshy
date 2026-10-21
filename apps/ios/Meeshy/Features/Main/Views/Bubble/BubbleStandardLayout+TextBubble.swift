// Extrait de BubbleStandardLayout.swift (#10678) : emoji seul et bulle texte.
// Découpe par responsabilité, sans changement de comportement.

import SwiftUI
import MeeshySDK
import MeeshyUI

extension BubbleStandardLayout {
    /// Le rayon de la bulle — aussi celui du liseré arc-en-ciel qui l'entoure (`RainbowEffect`).
    nonisolated static let bubbleCornerRadius: CGFloat = MeeshyRadius.lgPlus


    // MARK: - Emoji-only path

    @ViewBuilder
    var emojiOnlyContent: some View {
        // Layout emoji-only sans reply : l'emoji et la meta-row (timestamp +
        // delivery) forment un BLOC INDISSOCIABLE rendu sur la meme baseline,
        // colle au bord de la conversation cote isMe. `.fixedSize()` garantit
        // que le container epouse le contenu : pas de container invisible
        // qui s'etire sur toute la largeur disponible (ce qui faisait "voler"
        // la date a un endroit excentre). Le VStack exterieur conserve
        // l'alignement isMe pour le secondary content (langue alternative
        // active) qui descend dessous.
        VStack(alignment: content.isMe ? .trailing : .leading, spacing: MeeshySpacing.xxs) {
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                // Emoji-only intentionally renders the ORIGINAL `message.content`,
                // not the translated text — emoji bubbles are not translated.
                Text(message.content)
                        .font(MeeshyFont.emoji(emojiFontSize))
                    .fixedSize(horizontal: false, vertical: true)

                compactInlineFooter
            }
            .fixedSize()

            secondaryContentView
        }
    }

    /// Meta-row minimaliste pose a cote d'un emoji free-floating : timestamp
    /// + delivery check (si isMe), sans drapeaux, sans translate, sans capsule.
    /// Re-utilise le builder `resolvedFooter` pour rester aligne sur la meme
    /// source de verite que le `standardFooter`.
    private var compactInlineFooter: some View {
        let (model, actions) = resolvedFooter(includesTranslationControls: false)
        return BubbleFooter(model: model, actions: actions, style: .compact, isDark: isDark)
            .equatable()
    }

    // MARK: - Text bubble path (with non-media attachments + reply preview)
    //
    // Timestamp-visibility gating + delivery resolution now live in the pure
    // `BubbleFooterModel.make(...)` builder — see `resolvedFooter`.

    private var bubbleInnerContent: AnyView {
        AnyView(bubbleInnerContentBody)
    }

    @ViewBuilder
    var bubbleInnerContentBody: some View {
        // Quoted reply preview (inside bubble)
        //
        // `detachedStoryCitation == nil` : quand la vue `3h` a sorti la story
        // de la bulle, cette carte plate la RENDRAIT une seconde fois. Le
        // prédicat est le MÊME des deux côtés — un seul site décide, sinon
        // les deux rendus divergent au premier cas de bord.
        if let reply = content.reply, detachedStoryCitation == nil {
            quotedReplyView(reply.reference)
                .padding(.bottom, MeeshySpacing.xs)
                .onTapGesture { openQuotedTarget(reply) }
        }

        // « modifié » se dit dans le PIED, à côté de l'heure (#7620) — posé
        // ici, le crayon tombait dans le coin arrondi que le clip rogne.
        if hasBubbleBodyContent {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                // Lieu porté par `message.location` (voie serveur actuelle).
                // Rendu UNE seule fois : le builder exclut la pièce jointe
                // `.location` de `content.attachments` quand le message porte
                // les deux (cf. BubbleContentBuilder), donc cette branche et
                // la branche par pièce jointe ci-dessous sont exclusives.
                if let place = content.location {
                    LocationMessageView(
                        place: place,
                        accentColor: contactColor,
                        onTapFullscreen: {
                            presentFullscreen(place)
                        }
                    )
                }

                ForEach(nonMediaAttachments) { attachment in
                    attachmentView(attachment)
                }

                if let text = content.text, !text.raw.isEmpty {
                    // No `.onLongPressGesture` — see comment in `emojiOnlyContent`.
                    // The container's long-press opens the options overlay; the
                    // translate icon in the identity bar opens translation detail.
                    expandableTextView
                }

                if let text = content.text {
                    BubbleLinkEmbed(text: text, accentColor: contactColor, isDark: isDark)
                }

                secondaryContentView
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, content.hasTextOrNonMediaContent ? 10 : 4)
        }
    }

    @ViewBuilder
    var textBubbleContent: some View {
        // Body + footer are stacked by `BubbleBodyFooterLayout`, not a plain
        // VStack. The footer carries a trailing Spacer — language flags on the
        // leading edge, timestamp + delivery check on the trailing edge. In a
        // plain VStack that Spacer is greedy and stretches the whole bubble to
        // its 70% max width; `.fixedSize` collapses the Spacer instead, which
        // pins the check right after the flags rather than on the bubble edge.
        // The custom Layout measures the body once and hands that exact width
        // to the footer: the text still wraps, the bubble stays sized to its
        // content, and the check lands on the trailing edge — matching the
        // corner-pinned footer of media bubbles. `sizeThatFits` and
        // `placeSubviews` both derive every value from the same resolved
        // width, so the reported height is self-consistent (no
        // UICollectionView cell-height drift).
        BubbleBodyFooterLayout(spacing: 4, cacheContext: heightCacheContext) {
            // Wrapped in a VStack so the Layout sees the body as ONE opaque
            // subview — a bare @ViewBuilder property would be flattened into
            // its individual conditional branches.
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                bubbleInnerContent
            }
            // `textBubbleContent` n'est plus rendu pour `audioHostsReply` /
            // `visualHostsReply` (voir `contentStack`), donc le footer standard
            // est toujours adapté ici — le widget média qui héberge sa propre
            // citation gère son footer en interne (bottomSlot ou overlay).
            standardFooter
        }
        // FAILED outgoing send — reserve a trailing strip and glue the retry
        // band INTO it as an integrated edge tab (clipped to the bubble's rounded
        // corner, no gap). The content + footer are inset by the band width so
        // the bubble's own timestamp + delivery state stay visible to its LEFT;
        // and because the band lives INSIDE the bubble's frame, a failed bubble
        // right-aligns exactly like every other bubble (no left-shift).
        .padding(.trailing, isFailedOutgoing ? Self.retryBandWidth : 0)
        .background(bubbleBackground)
        .overlay(alignment: .trailing) {
            if isFailedOutgoing {
                BubbleFailedRetryBar(onRetry: { performManualRetry() })
                    .frame(width: Self.retryBandWidth)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Self.bubbleCornerRadius))
        // Simplification forte : plus d'ombre portée par bulle. Une `.shadow`
        // teintée par cellule force un rendu offscreen à chaque frame de scroll
        // (classique tueur de FPS). Les bulles sont désormais plates et nettes.
    }
}
