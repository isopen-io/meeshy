import SwiftUI
import MeeshySDK
import MeeshyUI

/// La rangée plate du Fil (Focal) — contrat §WS-4. Pastille `22`,
/// « Pseudo · HH:mm » en tête de groupe, texte `15` pleine largeur au
/// retrait `29`, méta discrète, AUCUNE bulle.
///
/// **Densité uniforme** : `input.density` n'est PAS lu par ce fichier —
/// « même rangée, densité uniforme, zéro perspective ». RETRAIT FOCAL iOS
/// (2026-08-18) : le pass de perspective (`FocalScrollPass`) est supprimé ;
/// cette rangée sert le mode Script à plat, sans AUCUN transform —
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

    /// Retrait CONSTANT — il ne suit plus la pastille.
    ///
    /// Même raison que `textSize` : le retrait fixe la largeur disponible,
    /// donc le retour à la ligne, donc la hauteur. Le faire varier avec le
    /// focus faisait changer la cellule de taille au basculement d'élection,
    /// et la liste sautait. Le retrait de l'élue (41) est retenu pour TOUTES
    /// les rangées : c'est celui qui laisse la place à la pastille de 34, que
    /// l'en-tête réserve désormais en permanence.
    private var indent: CGFloat {
        FocalMetrics.Focus.textIndent
    }

    /// **Le « 15 → 16 » de §4.6 est ABANDONNÉ, et c'est un choix.**
    ///
    /// Grossir le texte de l'élue relance le calcul de retour à la ligne :
    /// un paragraphe de quatre lignes en 15 peut en faire cinq en 16, et la
    /// cellule change de hauteur. Comme la reconfiguration a lieu à l'ARRÊT
    /// du défilement, ce changement de hauteur déplaçait tout ce qui était à
    /// l'écran — filmé au simulateur, un saut par arrêt de geste.
    ///
    /// Le contrat écrivait cet écart quand la rangée élue n'avait rien
    /// d'autre pour se distinguer. Elle a maintenant sa pastille de 34, son
    /// nom agrandi, sa date complète, sa barre de contrôles — et surtout
    /// l'échelle pleine que le pass de perspective lui donne pendant qu'il
    /// réduit ses voisines. Un point de corps de plus ne vaut pas un
    /// défilement saccadé.
    private var textSize: CGFloat {
        FocalMetrics.Text.size
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
        // Envoi optimiste (matrice §5) : 0,7 d'opacité tant que le gateway
        // n'a pas accusé. Depuis le RETRAIT du pass (2026-08-18), la rangée
        // possède son opacité — `cell.alpha` n'a plus d'autre écrivain.
        .opacity(input.isOptimistic ? 0.7 : 1)
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

            // Matrice §5 « Éphémère / flou / vue unique » : le flou de
            // niveau MESSAGE s'applique au BLOC CONTENU (citation comprise),
            // jamais à l'identité ni à la méta — corrigé 2026-08-18 (un
            // message protégé s'affichait EN CLAIR en Focal). L'état de
            // révélation vit dans la feuille (`FocalProtectedContent`),
            // FocalRow reste sans @State (contrainte dure §WS-4).
            //
            // Le wrapper ne se MONTE que pour un message protégé — même
            // discipline que le mux de l'hôte (« plan vide ⇒ vue intacte ») :
            // l'écrasante majorité des messages n'a pas de flou et ne paie ni
            // le `@StateObject` ni le modificateur. `isBlurred` est stable
            // sur la vie du message, la branche ne bascule pas au recyclage.
            if content.isBlurred {
                FocalProtectedContent(
                    isBlurred: true,
                    isViewOnce: content.isViewOnce,
                    messageId: content.messageId,
                    onConsumeViewOnce: actions.onConsumeViewOnce
                ) {
                    contentSections
                }
            } else {
                contentSections
            }

            failedRetrySection
            reactionsSection

            if !input.isFirstInGroup {
                FocalMetaRow(
                    isMe: content.isMe,
                    timeString: content.meta.timeString,
                    deliveryStatus: content.meta.deliveryStatus,
                    isDark: input.isDark,
                    indent: indent,
                    // F-083ter (F10) — « modifié » visible en rangée de suite.
                    editedAt: content.editedAt,
                    isEditSaving: content.isEditSaving,
                    hasEditHistory: content.hasEditHistory
                )
            }

        }
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

    // RETRAIT FOCAL iOS (2026-08-18) : la barre de contrôles de l'élue et
    // sa RÉSERVE de hauteur permanente sont supprimées avec l'élection — la
    // rangée Script gagne ~28 pt de densité et une mesure de moins.


    /// Miroir de la règle réelle (`textBubbleContent`/`mediaWithReplyContainer`,
    /// lus jamais modifiés) : la citation n'est rendue ICI que si le widget
    /// média ne l'héberge pas déjà — sinon double citation.
    private var showsQuotedReply: Bool {
        content.reply != nil && !content.audioHostsReply && !content.visualHostsReply
    }

    /// Le bloc contenu protégé par le flou de message — citation + médias +
    /// audio + non-média + texte. Le VStack reprend le MÊME espacement que la
    /// pile parente : hauteur de rangée identique, wrapper monté ou pas.
    private var contentSections: some View {
        VStack(alignment: .leading, spacing: FocalMetrics.Row.paddingVertical) {
            if showsQuotedReply, let reply = content.reply {
                FocalQuotedReplyView(
                    reply: reply,
                    accentHex: input.accentHex,
                    isDark: input.isDark,
                    mentionDisplayNames: input.mentionDisplayNames,
                    onReplyTap: actions.onReplyTap,
                    onStoryReplyTap: actions.onStoryReplyTap,
                    onQuotedAuthorTap: actions.onQuotedAuthorTap,
                    onQuotedMediaTap: actions.onQuotedMediaTap
                )
            }

            visualBlock
            audioBlock
            nonMediaBlock
            textOrEmojiBlock
        }
    }

    /// Matrice §5 « Envoi optimiste / échec » : « Bande orange de retry
    /// inchangée, exclue de la perspective ». Réutilise
    /// `BubbleFailedRetryBar` TELLE QUELLE (§1.3 — spinner, blink gaté
    /// Reduce Motion, a11y) ; seule sa POSE change : une bande compacte sous
    /// le contenu au retrait de colonne, à la place de l'onglet de bord de
    /// bulle. Jusqu'au 2026-08-18, `onRetry` était câblé par l'hôte mais
    /// AUCUNE vue Focal ne le consommait — un message échoué n'offrait aucun
    /// moyen de le renvoyer.
    private var isFailedOutgoing: Bool {
        content.isMe && content.meta.deliveryStatus == .failed
    }

    @ViewBuilder
    private var failedRetrySection: some View {
        if isFailedOutgoing {
            BubbleFailedRetryBar(onRetry: { actions.onRetry?(input.localId) })
                .frame(width: 72, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .padding(.leading, indent)
        }
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
                onStoryReplyTap: actions.onStoryReplyTap,
                audioQueueTailProvider: actions.audioQueueTailProvider,
                onTapConsentNotice: actions.onTapConsentNotice
            )
        }
    }

    /// Pièces jointes non-média (fichier) de `content.attachments`, panier
    /// `.nonMedia`/`.mixed` — même switch que `visualBlock`/`audioBlock`
    /// (`FocalAudioRouting`), un accesseur pur par consommateur, patron
    /// déjà établi trois fois dans ce chantier (`BubbleStandardLayout`,
    /// `MessageAccessibilityLabelComposer`, ici).
    private var nonMediaAttachments: [MessageAttachment] {
        switch content.attachments {
        case .nonMedia(let items): return items
        case .mixed(_, _, let items): return items
        case .none, .visualGrid, .audio: return []
        }
    }

    /// Lieu partagé (`content.location`) et fichiers (`nonMediaAttachments`)
    /// — corrige la rangée VIDE d'un message « lieu seul »/« fichier seul »
    /// (voir doc de tête de `FocalNonMediaBlock`). Même garde que
    /// `textOrEmojiBlock` : `audioMode == .hostsCaption` ⇒ la bulle
    /// n'atteint jamais `textBubbleContent` non plus (elle héberge la
    /// légende DANS le widget audio) — parité bulle assumée, pas une
    /// correction inventée pour ce cas résiduel.
    @ViewBuilder
    private var nonMediaBlock: some View {
        if FocalNonMediaGate.shouldRender(
            hasSharedPlace: content.location != nil,
            nonMediaCount: nonMediaAttachments.count,
            audioMode: audioMode
        ) {
            // Lot 3.2 (2026-08-18) : cartes RÉELLES (LocationMessageView +
            // BubbleAttachmentView, réutilisées telles quelles) à la place du
            // repli texte inerte — un document redevient ouvrable en Focal.
            FocalNonMediaBlock(
                items: nonMediaAttachments,
                isDark: input.isDark,
                location: content.location,
                accentHex: input.accentHex,
                isMe: content.isMe,
                onTapLocation: actions.onTapLocation,
                onShareFile: actions.onShareFile
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
    /// **Signal multi-langue (arbitrage user 2026-08-18)** : ni icône
    /// translate, ni bande de drapeaux dans la rangée — le menu d'appui
    /// long demande/affiche les autres langues. Le SEUL indicateur est le
    /// drapeau de la langue D'ORIGINE, affiché UNIQUEMENT quand le message
    /// existe en plusieurs versions (`content.translation != nil`). Aucune
    /// seconde résolution : `originalLangCode` est déjà résolu par
    /// `BubbleContentBuilder`.
    /// Texte effectif de la rangée (Prisme résolu en amont) — partagé par le
    /// rendu, la sheet « Lire plus » et la clé du cross-fade.
    private var effectiveText: String {
        content.translation?.preferredContent ?? content.text?.raw ?? ""
    }

    private var textBlock: some View {
        HStack(alignment: .top, spacing: 4) {
            BubbleExpandableText(
                content: effectiveText,
                isMe: content.isMe,
                mentionDisplayNames: input.mentionDisplayNames,
                highlightTerm: input.highlightSearchTerm,
                mentionTint: MeeshyColors.mentionColor(isDark: input.isDark),
                hashtagTint: MeeshyColors.hashtagColor(isDark: input.isDark),
                linkTint: Color(hex: input.accentHex),
                isDark: input.isDark,
                trackedLinks: content.text?.trackedLinks ?? [:],
                fontSize: textSize,
                expandLabel: String(localized: "focal.readmore", defaultValue: "Lire plus", bundle: .main),
                onExpandOverride: { actions.onReadMore?(readMorePayload) }
            )
            .equatable()
            .lineSpacing(FocalMetrics.Text.lineSpacing(forResolvedFontSize: textSize))
            // Matrice §5 « Traductions qui arrivent » : « swap du texte en
            // place (cross-fade 150 ms) ». L'identité suit le texte effectif :
            // quand la traduction préférée arrive après coup (reconfigure
            // ciblé), l'ancien rendu se fond dans le nouveau — fondu
            // d'opacité pur, toléré sous Reduce Motion (doctrine effets).
            .id(effectiveText)
            .transition(.opacity)

            originalLanguageFlag
        }
        .padding(.leading, indent)
        .animation(.easeInOut(duration: 0.15), value: effectiveText)
    }

    /// Charge de la sheet « Lire plus » — le MÊME texte effectif que la
    /// rangée (Prisme déjà résolu), jamais une seconde résolution.
    private var readMorePayload: FocalReadMorePayload {
        FocalReadMorePayload(
            messageId: content.messageId,
            senderName: content.senderName ?? "",
            timeString: content.meta.timeString,
            text: effectiveText,
            accentHex: input.accentHex,
            isDark: input.isDark
        )
    }

    /// Drapeau de la langue D'ORIGINE — le SEUL indicateur multi-langue de
    /// la rangée (arbitrage user 2026-08-18 : l'icône translate et la bande
    /// de drapeaux sont retirées ; demander une traduction ou explorer les
    /// autres langues passe par le menu d'appui long du message). Affiché
    /// UNIQUEMENT quand plusieurs versions existent (`content.translation`
    /// non-nil ⟺ au moins une traduction texte/audio, posé par
    /// `BubbleContentBuilder`). PASSIF : aucun geste — le Prisme reste
    /// transparent, l'indicateur ne distrait pas.
    @ViewBuilder
    private var originalLanguageFlag: some View {
        if let translation = content.translation {
            Text(LanguageData.info(for: translation.originalLangCode.lowercased())?.flag ?? "\u{1F310}")
                .font(MeeshyFont.relative(MeeshyFont.captionSize))
                .accessibilityLabel(String(
                    format: String(localized: "focal.translation.original_language", defaultValue: "Message multilingue — langue d'origine : %@", bundle: .main),
                    LanguageData.info(for: translation.originalLangCode.lowercased())?.nativeName ?? translation.originalLangCode
                ))
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
