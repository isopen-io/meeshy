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

    /// Retrait du texte — suit la pastille, qui grandit en focus (§4.6).
    /// `FocalMetrics.Text.indent` (29) reste le cas nominal ; l'élue prend
    /// `FocalMetrics.Focus.textIndent`, dérivé de la MÊME gouttière de 7 pt,
    /// jamais un second littéral.
    private var indent: CGFloat {
        input.isFocused ? FocalMetrics.Focus.textIndent : FocalMetrics.Text.indent
    }

    /// « Typographie 15 → 16 » (§4.6) — l'écart que le contrat nomme depuis
    /// toujours et que rien ne rendait, faute d'un champ de focus sur
    /// `FocalRowInput`.
    private var textSize: CGFloat {
        input.isFocused ? FocalMetrics.Focus.textSize : FocalMetrics.Text.size
    }

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
            // F-083ter (F11) : « les badges éphémère/épinglé/transféré
            // restent AU-DESSUS DE L'IDENTITÉ » — avant FocalIdentityHeader,
            // pas après, et indépendants de isFirstInGroup (ce sont des
            // propriétés du MESSAGE, pas du groupe).
            badgesSection

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
                    isFocused: input.isFocused,
                    sentAt: input.sentAt,
                    // WS-10 (F-089) : `input.showsAgentGrammar` PORTE DÉJÀ la
                    // décision finale (précalculée par le mux qui construit
                    // `FocalRowInput`, contrat §3.6) — cette rangée ne relit
                    // JAMAIS `MeeshyFeatureFlags.isAgentGrammarEnabled`
                    // elle-même (garde « vue pure », même règle que
                    // `input.density`). `AgentAuthoredStyle.resolve` re-gate
                    // quand même sur ce booléen : `.human` tant qu'il reste
                    // `false` (défaut de ce chantier).
                    agentStyle: AgentAuthoredStyle.resolve(
                        isAgentAuthored: input.isAgentAuthored,
                        isAgentGrammarEnabled: input.showsAgentGrammar
                    ),
                    onOpenProfile: actions.onOpenProfile,
                    // F-083ter (F10) — « modifié » visible en tête de groupe.
                    editedAt: content.editedAt,
                    isEditSaving: content.isEditSaving,
                    hasEditHistory: content.hasEditHistory
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
            reactionsSection

            if !input.isFirstInGroup {
                FocalMetaRow(
                    isMe: content.isMe,
                    timeString: content.meta.timeString,
                    deliveryStatus: content.meta.deliveryStatus,
                    isDark: input.isDark,
                    indent: indent,
                    isFocused: input.isFocused,
                    sentAt: input.sentAt,
                    // F-083ter (F10) — « modifié » visible en rangée de suite.
                    editedAt: content.editedAt,
                    isEditSaving: content.isEditSaving,
                    hasEditHistory: content.hasEditHistory
                )
            }
        }
        // « Les contrôles par-dessus le cadre » : la barre chevauche le bord
        // BAS de la carte de focus. `padding` réserve sa place dans la
        // hauteur de la rangée (sinon elle recouvrirait la dernière ligne du
        // message) ; `offset` la redescend ensuite pour l'asseoir SUR
        // l'anneau. Rendue seulement pour l'élue — une rangée ordinaire ne
        // paye rien, pas même une vue vide.
        .padding(.bottom, input.isFocused ? FocalMetrics.Focus.controlBarReservedHeight : 0)
        .overlay(alignment: .bottomLeading) { focusControlBar }
        // F-083ter (F15) : « les effets (bitfield) s'appliquent au bloc
        // contenu » — même overlay que le chemin bulle
        // (`ThemedMessageBubble.swift:317`, `.messageEffects(message.effects)`,
        // §1.3 réutilisé tel quel via `View.messageEffects(_:)`, PAS
        // réimplémenté). Posé sur la VStack de contenu entière (identité +
        // citation + média + texte + méta), exactement le même périmètre que
        // la bulle historique applique à `BubbleStandardLayout(...)`.
        .messageEffects(input.effects)
    }

    // MARK: - F-083ter (F11) — badges éphémère/épinglé/transféré

    /// `content.isPinned`/`content.isForwarded`/`content.ephemeral` LUS et
    /// RENDUS (jusqu'ici seul le libellé VoiceOver les portait, F-080) —
    /// réutilise `BubblePinnedIndicator`/`BubbleForwardedIndicator` (§1.3,
    /// `internal`, vérifiés non `fileprivate`) TELS QUELS, et
    /// `FocalEphemeralBadge` (ce chantier) pour un countdown vivant sans
    /// faire porter le `@StateObject` par `FocalRow`.
    ///
    /// `BubbleForwardedIndicator` accepte `senderName`/`conversationName`
    /// pour un libellé enrichi (« Fwd. from X • Y ») — `BubbleContent` ne
    /// porte que le booléen `isForwarded` (pas de `ForwardReference`
    /// résolue), donc ces deux paramètres restent `nil` ici : repli sur le
    /// libellé générique « Forwarded ». Écart signalé, pas une seconde
    /// résolution inventée.
    @ViewBuilder
    private var badgesSection: some View {
        if content.isPinned {
            BubblePinnedIndicator()
        }
        if content.isForwarded {
            BubbleForwardedIndicator(isMe: content.isMe, isDark: input.isDark, senderName: nil, conversationName: nil)
        }
        if let ephemeral = content.ephemeral {
            FocalEphemeralBadge(expiresAt: ephemeral.expiresAt, isDark: input.isDark)
        }
    }

    // MARK: - F-083ter (F05) — réactions live en pilule plate méta

    /// Réutilise `BubbleReactionsOverlay` (§1.3, `internal`, vérifié non
    /// `fileprivate`) TEL QUEL — pilule `11`pt, fond `backgroundSecondary`,
    /// comptes monospaced, pop `springBouncy` à l'arrivée, picker/détail
    /// inchangés : exactement F05. `isLastReceivedMessage` reste `false`
    /// (le bouton `(+)` d'ajout rapide ne s'affiche donc jamais côté Focal
    /// pour l'instant — `FocalRowInput`, figé, ne porte pas ce signal de
    /// position de défilement ; écart signalé, pas une extension inventée).
    @ViewBuilder
    private var reactionsSection: some View {
        if !content.reactions.isEmpty {
            BubbleReactionsOverlay(
                messageId: content.messageId,
                summaries: content.reactions,
                isMe: content.isMe,
                isDark: input.isDark,
                isLastReceivedMessage: false,
                accentHex: input.accentHex,
                onAddReaction: actions.onAddReaction,
                onToggleReaction: actions.onToggleReaction,
                onOpenReactPicker: actions.onOpenReactPicker,
                onShowReactions: actions.onShowReactions
            )
            .equatable()
            .padding(.leading, indent)
        }
    }

    // MARK: - §4.6 — les contrôles de la rangée élue

    /// Barre de contrôles de l'élue, assise sur le bord bas de la carte.
    ///
    /// Ne se monte QUE pour l'élue : `@ViewBuilder` + `if` (jamais un
    /// ternaire ni un `.opacity(0)`), pour qu'une rangée ordinaire
    /// n'instancie même pas la vue — la même discipline que le mux de
    /// cellule de l'hôte.
    @ViewBuilder
    private var focusControlBar: some View {
        if input.isFocused {
            FocalFocusControlBar(
                accentHex: input.accentHex,
                isDark: input.isDark,
                availableFlags: content.translation?.availableFlags ?? [],
                activeFlagCode: input.secondaryLangCode,
                onReact: { emoji in actions.onToggleReaction?(emoji) },
                onExpandPicker: { actions.onOpenReactPicker?(content.messageId) },
                onFlagTap: { code in
                    // Même règle que la bulle : re-taper la langue ouverte la
                    // referme. La décision vit dans
                    // `BubbleLanguageFlagController` côté bulle ; ici la
                    // rangée ne porte AUCUN état de langue (contrainte dure
                    // §WS-4), elle renvoie la cible et le ViewModel tranche.
                    actions.onSetSecondaryLanguage?(
                        content.messageId,
                        code == input.secondaryLangCode ? nil : code
                    )
                },
                onMore: { actions.onMore?(input.localId) }
            )
            .equatable()
            .padding(.leading, indent)
            // Assied la barre SUR l'anneau : la carte est encartée de
            // `FocusCard.marginVertical` sous le bord de la cellule, la
            // barre descend de la moitié de sa hauteur pour le chevaucher.
            .offset(y: FocalMetrics.Focus.controlBarReservedHeight / 2 - FocalMetrics.FocusCard.marginVertical)
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
            .padding(.leading, indent)
    }

    /// `BubbleExpandableText` (§1.3, lu jamais modifié) résout déjà `15`pt
    /// en interne (`MessageTextRenderer.render(fontSize: 15, …)`) — IDENTIQUE
    /// à `FocalMetrics.Text.size` (`MeeshyFont.bodySize`), aucun `.font()`
    /// externe à appliquer. Seul l'interligne additif (`1.42`, `.lineSpacing`
    /// est en points côté SwiftUI) et le retrait `29` sont posés ICI.
    ///
    /// **F-083ter (F06)** : le SWAP de texte était déjà branché
    /// (`content.translation?.preferredContent`, résolution Prisme
    /// inchangée) — il manquait le chip `🌐` qui le SIGNALE visuellement
    /// (présent côté bulle, `BubbleFooter` translate button). Ajouté en
    /// méta, juste après le texte : `showsTranslationChip` ne fait AUCUNE
    /// seconde résolution, elle compare deux champs déjà résolus par
    /// `BubbleContentBuilder` (`activeLangCode`/`originalLangCode`).
    private var textBlock: some View {
        HStack(alignment: .top, spacing: 4) {
            BubbleExpandableText(
                content: content.translation?.preferredContent ?? content.text?.raw ?? "",
                isMe: content.isMe,
                mentionDisplayNames: input.mentionDisplayNames,
                highlightTerm: input.highlightSearchTerm,
                mentionTint: MeeshyColors.mentionColor(isDark: input.isDark),
                hashtagTint: MeeshyColors.hashtagColor(isDark: input.isDark),
                linkTint: Color(hex: input.accentHex),
                isDark: input.isDark,
                trackedLinks: content.text?.trackedLinks ?? [:],
                fontSize: textSize
            )
            .equatable()
            .lineSpacing(FocalMetrics.Text.lineSpacing(forResolvedFontSize: textSize))

            translationChip
        }
        .padding(.leading, indent)
    }

    /// « Apparition du chip 🌐 en méta » (F06) quand le texte affiché EST
    /// une traduction — `translation.activeLangCode != translation.originalLangCode`,
    /// les deux déjà résolus en amont (aucune seconde résolution Prisme).
    @ViewBuilder
    private var translationChip: some View {
        if let translation = content.translation,
           translation.preferredContent != nil,
           translation.activeLangCode != translation.originalLangCode {
            Image(systemName: "globe")
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
                // Purement visuel (F06 demande un SIGNAL visuel, le texte
                // traduit se lit déjà tel quel) — masqué de VoiceOver pour
                // éviter un doublon si un futur segment de traduction
                // rejoint `MessageAccessibilityLabelComposer`.
                .accessibilityHidden(true)
        }
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
