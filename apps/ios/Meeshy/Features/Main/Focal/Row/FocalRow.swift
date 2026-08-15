import SwiftUI
import MeeshySDK
import MeeshyUI

/// La rangée plate du Fil (Focal) — contrat §WS-4. Pastille `22`,
/// « Pseudo · HH:mm » en tête de groupe, texte `15` pleine largeur au
/// retrait `29`, méta discrète, AUCUNE bulle.
///
/// **Densité Script comprise** (mission F-083) : `input.density` n'est PAS
/// lu par ce fichier — « même rangée, densité uniforme, zéro perspective en
/// Script » (contrat §3.1 : `ConversationReadingMode.usesFlatRow` est vrai
/// pour `.focal` ET `.script`, `usesPerspective` ne l'est que pour `.focal`).
/// La SEULE différence entre les deux modes est un transform de
/// COMPOSITING appliqué PAR-DESSUS cette vue par `FocalScrollPass` (WS-5,
/// hors périmètre F-083) — `FocalRow` ne branche jamais sur la densité,
/// jamais de `.visualEffect`/`.scaleEffect` conditionnel ici (garde source
/// `FocalRowSourceGuardTests`).
///
/// **Contrainte dure (§WS-4)** : aucun `@State` de langue — la sélection
/// active/secondaire vient de `input` (`activeDisplayLangCode`/
/// `secondaryLangCode`) et repart par `actions.onSetActiveDisplayLanguage`/
/// `onSetSecondaryLanguage` (régression `b9a39c2c`).
///
/// **Contrainte dure** : tout contrôle interne est un `Button(.plain)` +
/// `.contentShape(Rectangle())`, jamais `.onTapGesture` seul sur un contrôle
/// interactif (avalé par le long-press du conteneur parent) — `FocalIdentityHeader`
/// (profil) est un `Button(.plain)` ; les gestes de citation/média restent
/// `.onTapGesture` car ce sont des ZONES DE RANGÉE, pas des CONTRÔLES
/// (même patron que la bulle historique, `mediaWithReplyContainer`).
struct FocalRow: View {
    let input: FocalRowInput
    let actions: FocalRowActions

    private var content: BubbleContent { input.content }

    var body: some View {
        Group {
            switch content.kind {
            case .deleted, .burned, .system:
                systemBody
            case .ephemeralExpired:
                EmptyView()
            case .standard:
                standardBody
            }
        }
        .padding(.top, input.isFirstInGroup ? FocalMetrics.Row.groupTopPadding : 0)
        .padding(.vertical, FocalMetrics.Row.paddingVertical)
        .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
        .environment(\.layoutDirection, input.isRightToLeft ? .rightToLeft : .leftToRight)
        // « 1 rangée = 1 élément VoiceOver » (critère §7) : combine tous les
        // enfants + libellé composé par le composeur partagé WS-1 (aucune
        // seconde résolution — le composeur lit `content` seul, comme WS-4
        // le prescrit).
        .accessibilityElement(children: .combine)
        .accessibilityLabel(MessageAccessibilityLabelComposer.compose(content))
    }

    // MARK: - Rangées système (déléguées à WS-3)

    private var systemBody: some View {
        FocalSystemRows.view(
            for: content,
            accentHex: input.accentHex,
            isDark: input.isDark,
            onCallBack: { _ in actions.onCallBack?(input.localId) },
            onLongPress: { actions.onLongPressCallDetail?(input.localId) }
        )
    }

    // MARK: - Rangée standard

    @ViewBuilder
    private var standardBody: some View {
        VStack(alignment: .leading, spacing: FocalMetrics.Row.paddingVertical) {
            if input.isFirstInGroup {
                FocalIdentityHeader(
                    isMe: content.isMe,
                    senderDisplayName: input.senderDisplayName,
                    senderUsername: input.senderUsername,
                    senderAvatarURL: input.senderAvatarURL,
                    senderThumbHash: input.senderThumbHash,
                    senderColorHex: input.senderColorHex,
                    senderPresence: input.senderPresence,
                    senderStoryRing: input.senderStoryRing,
                    senderMoodEmoji: input.senderMoodEmoji,
                    timeString: content.meta.timeString,
                    deliveryStatus: content.meta.deliveryStatus,
                    isDark: input.isDark,
                    onOpenProfile: actions.onOpenProfile
                )
            }

            if showsQuotedReply, let reply = content.reply {
                FocalQuotedReplyView(
                    reply: reply,
                    accentHex: input.accentHex,
                    isDark: input.isDark,
                    mentionDisplayNames: input.mentionDisplayNames,
                    onReplyTap: actions.onReplyTap,
                    onStoryReplyTap: actions.onStoryReplyTap
                )
            }

            visualBlock
            audioBlock
            textOrEmojiBlock

            if !input.isFirstInGroup {
                FocalMetaRow(
                    isMe: content.isMe,
                    timeString: content.meta.timeString,
                    deliveryStatus: content.meta.deliveryStatus,
                    isDark: input.isDark
                )
            }
        }
    }

    /// Miroir de la règle réelle (`textBubbleContent`/`mediaWithReplyContainer`,
    /// lus jamais modifiés) : la citation n'est rendue ICI que si le widget
    /// média ne l'héberge pas déjà — sinon double citation.
    private var showsQuotedReply: Bool {
        content.reply != nil && !content.audioHostsReply && !content.visualHostsReply
    }

    private var audioMode: FocalAudioMode { FocalAudioRouting.mode(for: content) }

    @ViewBuilder
    private var visualBlock: some View {
        let items = FocalAudioRouting.visualAttachments(in: content)
        if !items.isEmpty {
            FocalAttachmentBlock(
                items: items,
                accentHex: input.accentHex,
                messageDeliveryStatus: content.meta.deliveryStatus ?? .sent,
                onMediaTap: actions.onMediaTap,
                onConsumeViewOnce: actions.onConsumeViewOnce
            )
        }
    }

    @ViewBuilder
    private var audioBlock: some View {
        if audioMode != .none {
            FocalAudioBlock(
                content: content,
                accentHex: input.accentHex,
                isDark: input.isDark,
                allAudioItems: input.allAudioItems,
                translatedAudios: input.translatedAudios,
                mentionDisplayNames: input.mentionDisplayNames,
                conversationName: input.conversationName,
                voiceConsentMissing: input.voiceConsentMissing,
                onPlayAudio: actions.onPlayAudio,
                onRequestTranslation: actions.onRequestTranslation,
                onShowTranslationDetail: actions.onShowTranslationDetail,
                onReplyTap: actions.onReplyTap,
                onStoryReplyTap: actions.onStoryReplyTap
            )
        }
    }

    /// Miroir de la branche réelle (`:850-856`, lue jamais modifiée) :
    /// emoji-only SANS citation ⇒ grand emoji libre ; sinon texte normal SI
    /// du contenu existe ET que l'audio ne l'héberge pas déjà en caption
    /// (`audioHostsCaption` ⇒ le texte vit DANS le widget audio, WS-3).
    @ViewBuilder
    private var textOrEmojiBlock: some View {
        if content.isEmojiOnly && content.reply == nil {
            emojiBlock
        } else if content.hasTextOrNonMediaContent && audioMode != .hostsCaption {
            textBlock
        }
    }

    /// « emoji-only conserve 90/60/45pt » (critère §7) : `emojiFontSize`
    /// vient de `content.text.emojiFontSize`, jamais recalculé ici.
    /// Rendu du texte ORIGINAL (`raw`), jamais traduit — même règle que
    /// `BubbleStandardLayout.emojiOnlyContent` (lu, jamais modifié).
    private var emojiBlock: some View {
        Text(content.text?.raw ?? "")
            .font(MeeshyFont.relative(content.text?.emojiFontSize ?? FocalMetrics.Text.size))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.leading, FocalMetrics.Text.indent)
    }

    /// `BubbleExpandableText` (§1.3, lu jamais modifié) résout déjà `15`pt
    /// en interne (`MessageTextRenderer.render(fontSize: 15, …)`) — IDENTIQUE
    /// à `FocalMetrics.Text.size` (`MeeshyFont.bodySize`), aucun `.font()`
    /// externe à appliquer. Seul l'interligne additif (`1.42`, `.lineSpacing`
    /// est en points côté SwiftUI) et le retrait `29` sont posés ICI.
    private var textBlock: some View {
        BubbleExpandableText(
            content: content.translation?.preferredContent ?? content.text?.raw ?? "",
            isMe: content.isMe,
            mentionDisplayNames: input.mentionDisplayNames,
            highlightTerm: input.highlightSearchTerm,
            mentionTint: MeeshyColors.mentionColor(isDark: input.isDark),
            hashtagTint: MeeshyColors.hashtagColor(isDark: input.isDark),
            linkTint: Color(hex: input.accentHex),
            isDark: input.isDark,
            trackedLinks: content.text?.trackedLinks ?? [:]
        )
        .equatable()
        .lineSpacing(FocalMetrics.Text.lineSpacing(forResolvedFontSize: FocalMetrics.Text.size))
        .padding(.leading, FocalMetrics.Text.indent)
    }
}

// MARK: - EquatableFocalRow — le gate de re-render

/// Enveloppe la rangée pour le gate `.equatable()` — même topologie que
/// `EquatableMessageBubble` (`ThemedMessageBubble.swift:481-491`, lue jamais
/// modifiée). Le gate ne se pose JAMAIS sur `FocalRow` lui-même (contrat
/// §WS-4 : régression documentée du 2026-05-25) — `FocalRow` n'est donc PAS
/// `Equatable` ; seule cette enveloppe l'est, en comparant `row.input`
/// (`FocalRowActions` en est exclu par construction, comme `FocalRowInput.==`
/// ne le compare jamais).
struct EquatableFocalRow: View {
    let row: FocalRow
    var body: some View { row }
}

extension EquatableFocalRow: @MainActor Equatable {
    static func == (lhs: EquatableFocalRow, rhs: EquatableFocalRow) -> Bool {
        lhs.row.input == rhs.row.input
    }
}
