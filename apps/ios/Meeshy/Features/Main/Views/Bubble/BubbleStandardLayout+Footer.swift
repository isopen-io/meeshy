// Extrait de BubbleStandardLayout.swift (#10678) : pied, texte déployable et contenu secondaire.
// Découpe par responsabilité, sans changement de comportement.

import SwiftUI
import MeeshySDK
import MeeshyUI

extension BubbleStandardLayout {

    // MARK: - Identity bar (top of bubble for received last-in-group, otherwise meta row)

    /// Builds the footer model + actions for this bubble.
    /// - Parameter includesTranslationControls: when `false`, language flags
    ///   and the translate button are omitted — the audio widget owns its own
    ///   per-language switcher, so rendering both would compete.
    func resolvedFooter(includesTranslationControls: Bool = true, retryBandShown: Bool = false) -> (BubbleFooterModel, BubbleFooterActions) {
        // Traduisible = un TEXTE ou un audio (sa transcription) ; une position,
        // un fichier, un média seul ou un émoji n'ont rien à traduire (#7620).
        let isTranslatableContent = BubbleFooterModel.offersTranslation(
            hasText: !(content.text?.raw.isEmpty ?? true),
            isEmojiOnly: isEmojiOnly,
            hasAudio: !audioAttachments.isEmpty
        )
        let showTranslation = includesTranslationControls && isTranslatableContent
        // Les drapeaux n'apparaissent que quand au moins une traduction est
        // déjà disponible (sinon il n'y a rien à montrer côté flag strip).
        let showFlags = showTranslation && hasAnyTranslation
        let sender: SenderIdentity? = showIdentityBar ? SenderIdentity(
            name: content.senderName ?? "?",
            username: SenderIdentity.handle(fromUsername: message.senderUsername),
            role: nil,
            avatarURL: message.senderAvatarURL,
            accentColor: message.senderColor ?? contactColor,
            moodEmoji: senderMoodEmoji,
            presence: presenceState,
            storyRing: senderStoryRingState,
            isHere: senderIsHere,
            ring: message.senderRing
        ) : nil

        // #7365 — statut RÉSOLU (tout-ou-rien en groupe), jamais le brut.
        let model = BubbleFooterModel.make(
            timeString: content.meta.timeString,
            deliveryStatus: content.meta.deliveryStatus ?? .sent,
            isMe: content.isMe,
            isOnline: networkIsOnline,
            sender: sender,
            flags: showFlags
                ? buildAvailableFlags().map { FooterFlag(code: $0, isActive: $0 == secondaryLangCode) }
                : [],
            showsTranslate: showTranslation,
            sendStartedAt: message.createdAt, retryBandShown: retryBandShown,
            edit: BubbleEditMark.resolve(editedAt: content.editedAt, isSaving: content.isEditSaving)
        )

        // Le tap sur les coches n'a de sens que sur les messages envoyes
        // (les seuls qui portent une `delivery` non-nulle dans le footer).
        // Sur un message recu, `model.delivery == nil` donc le bouton n'est
        // jamais rendu meme si un callback etait branche.
        let readStatusCallback: (() -> Void)? = (content.isMe && onShowReadStatus != nil)
            ? { onShowReadStatus?(content.messageId) }
            : nil

        let actions = BubbleFooterActions(
            onFlagTap: showFlags ? { code in handleFlagTap(code) } : nil,
            onTranslate: showTranslation ? { onShowTranslationDetail?(content.messageId) } : nil,
            // BUG3 — suppress the footer's own retry button for failed outgoing
            // messages: the orange `BubbleFailedRetryBar` owns the resend so the
            // bubble never shows two competing retry affordances.
            onRetry: Self.footerShowsRetry(isFailedOutgoing: isFailedOutgoing) ? { performManualRetry() } : nil,
            onSenderTap: { selectedProfileUser = .from(message: message) },
            onViewStory: onViewStory,
            onShowReadStatus: readStatusCallback
        )
        return (model, actions)
    }

    /// The standard footer row rendered below text and emoji bubbles.
    var standardFooter: some View {
        let (model, actions) = resolvedFooter(retryBandShown: isFailedOutgoing)
        return BubbleFooter(model: model, actions: actions, style: .row, isDark: isDark)
            .equatable()
            .padding(.horizontal, showIdentityBar ? 10 : 14)
            .padding(.top, showIdentityBar ? 8 : 0)
            .padding(.bottom, MeeshySpacing.sm)
    }

    /// Live read of the global network monitor. Kept as a computed property
    /// so the bubble doesn't subscribe to its `@Published` and re-render on
    /// every offline/online edge — the parent (`ConversationViewModel`) is
    /// what bumps `message.deliveryStatus` and `updatedAt` to drive the
    /// bubble's Equatable.
    private var networkIsOnline: Bool {
        NetworkMonitor.shared.isOnline
    }

    /// Manual resend triggered by the orange retry band (or the footer's retry).
    /// Delegates to the ViewModel via `onRetry` → `retryMessage(messageId:)`,
    /// which re-inserts a fresh optimistic `.sending` row (immediate feedback,
    /// the band swaps to the normal sending indicator), re-enqueues, AND kicks
    /// the outbox flusher. The previous local path
    /// (`OfflineQueue.retryByClientMessageId`) only reset the outbox row to
    /// `.pending` without ever flushing it, so on a foregrounded/online device
    /// the resend silently never fired.
    func performManualRetry() {
        onRetry?(message.id)
    }

    // MARK: - Expandable text

    private var linkTint: Color {
        content.isMe ? skin.ink(MeeshyOpacity.intense) : Color(hex: contactColor)
    }

    /// Distinct des liens URL — et THÉMATISÉ : l'`indigo400` figé d'avant ne
    /// contrastait qu'à 2.98:1 sur le fond clair de l'app.
    private var mentionTint: Color {
        MeeshyColors.mentionColor(isDark: theme.mode.isDark)
    }

    private var hashtagTint: Color {
        MeeshyColors.hashtagColor(isDark: theme.mode.isDark)
    }

    @ViewBuilder
    var expandableTextView: some View {
        BubbleExpandableText(
            content: effectiveContent,
            isMe: content.isMe,
            mentionDisplayNames: mentionDisplayNames,
            highlightTerm: highlightSearchTerm,
            mentionTint: mentionTint,
            hashtagTint: hashtagTint,
            linkTint: linkTint,
            isDark: isDark,
            trackedLinks: content.text?.trackedLinks ?? [:], linksAreInert: content.text?.linksAreInert == true
        )
    }

    // MARK: - Secondary content (inline translation panel)

    @ViewBuilder
    var secondaryContentView: some View {
        if let secondary = secondaryContent, let code = secondaryLangCode {
            BubbleSecondaryContent(
                content: secondary,
                langCode: code,
                isMe: content.isMe,
                textPrimary: theme.textPrimary,
                mentionDisplayNames: mentionDisplayNames,
                mentionTint: mentionTint,
                hashtagTint: hashtagTint,
                linkTint: linkTint,
                trackedLinks: content.text?.trackedLinks ?? [:], linksAreInert: content.text?.linksAreInert == true
            )
        }
    }
}
