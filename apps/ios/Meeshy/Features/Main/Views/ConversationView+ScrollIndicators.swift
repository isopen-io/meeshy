// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Scroll Indicators, Typing & Attach Options
extension ConversationView {

    // MARK: - Scroll to Bottom Button

    /// La bulle est le SEUL contrôle de retour au présent (#8001, directive
    /// porteur 2026-09-26) : la capsule « Messages récents » qui la doublait
    /// est retirée. Le bas d'une fenêtre SAUTÉE (citation, recherche) n'est
    /// pas le bas du fil — la bulle y reste donc montée.
    nonisolated static func showsScrollToBottomButton(
        isNearBottom: Bool,
        isSearchingQuotedMessage: Bool,
        isInJumpedState: Bool
    ) -> Bool {
        !isNearBottom || isSearchingQuotedMessage || isInJumpedState
    }

    /// Le roster est PASSÉ, jamais lu depuis un observateur capturé à l'`init`
    /// (#5961) : celui-ci pointait le store d'un ViewModel jeté par
    /// `@StateObject`, donc toujours vide. Voir `ConversationTypingRosterHost`.
    func hasTypingIndicator(_ typing: [TypingParticipant]) -> Bool {
        !typing.isEmpty
    }

    /// Ce que la pastille montre du dernier message non lu : la loi
    /// `UnreadPillLaw.preview(of:liveRow:regime:ledger:now:)` appliquée à la ligne VIVANTE du
    /// fil, jamais à la copie figée posée à la réception.
    var unreadPreview: UnreadPillLaw.Preview {
        UnreadPillLaw.preview(
            of: viewModel.lastUnreadMessage,
            liveRow: liveThreadRow,
            regime: viewModel.startupDependencies.encryptedEra.regime(of: viewModel),
            now: Date()
        )
    }

    private func liveThreadRow(_ id: String) -> Message? {
        guard let index = viewModel.messageIndex(for: id), viewModel.messages.indices.contains(index) else { return nil }
        return viewModel.messages[index]
    }

    /// Unread message attachment (for rich preview in button)
    var unreadAttachment: MessageAttachment? { unreadPreview.attachment }


    /// True when there are unread messages to show in the button
    func hasUnreadContent(_ typing: [TypingParticipant]) -> Bool {
        scrollState.unreadBadgeCount > 0 || hasTypingIndicator(typing)
    }

    var isOffline: Bool {
        // You can link this to the actual offline state (e.g. from viewModel or presenceManager)
        return false // Defaults to false if not connected to a reachability manager here
    }

    func scrollToBottomButton(typing: [TypingParticipant]) -> some View {
        let preview = unreadPreview
        let piece = preview.attachment
        return ConversationScrollControlsView(
            unreadCount: scrollState.unreadBadgeCount,
            typingParticipants: typing,
            lastUnreadMessageContent: preview.text,
            // Nom devant l'aperçu — utile en groupe (qui a écrit ?), muet en
            // DM (l'unique interlocuteur n'a pas besoin d'être nommé) (#3921).
            lastUnreadMessageSenderName: isDirect || (preview.text == nil && piece == nil) ? nil : viewModel.lastUnreadMessage?.senderName,
            unreadAttachmentTypeLabel: UnreadPillAttachment.typeLabel(piece),
            unreadAttachmentThumbHash: piece?.thumbHash,
            unreadAttachmentThumbnailUrl: piece?.thumbnailUrl,
            unreadAttachmentFullUrl: piece?.type == .image ? piece?.fileUrl : nil,
            unreadAttachmentIsAudio: piece?.type == .audio,
            unreadAttachmentDetail: UnreadPillAttachment.detail(piece),
            unreadAttachmentSymbol: UnreadPillAttachment.symbol(piece),
            isAudioPlaying: scrollButtonAudioIsPlaying,
            isOffline: isOffline,
            isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
            isLoadingNewer: viewModel.isLoadingNewer,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            unreadCallSymbol: unreadCallSymbol,
            unreadCallTint: unreadCallTint,
            onScrollToBottom: {
                HapticFeedback.light()
                if viewModel.isInJumpedState {
                    Task {
                        await viewModel.returnToLatest()
                        scrollState.scrollToBottomTrigger += 1
                    }
                } else {
                    scrollState.scrollToBottomTrigger += 1
                }
                // Demander le bas, c'est déclarer le regarder : l'accusé part
                // avec le défilement, pas une seconde après.
                scrollState.flushSeenTrigger += 1
                scrollState.unreadBadgeCount = 0
                viewModel.lastUnreadMessage = nil
            },
            onPlayAudio: {
                HapticFeedback.light()
                guard let att = piece, att.type == .audio else { return }
                let coordinator = ConversationAudioCoordinator.sharedForTesting
                if coordinator.isActive(attachmentId: att.id) {
                    coordinator.togglePlayPause()
                } else {
                    viewModel.playAudio(attachmentId: att.id)
                }
            }
        )
        .accessibilityLabel(scrollToBottomAccessibilityLabel(typing))
        // #13109 — un éphémère qui échoit pendant que la pastille l'affiche n'y
        // laisse rien : à son échéance, le message non lu quitte la pastille.
        .task(id: UnreadPillExpiry(messageId: viewModel.lastUnreadMessage?.id, deadline: preview.expiresAt)) {
            await clearUnreadPreviewAtItsDeadline()
        }
        .onReceive(scrollButtonAudioStatePublisher) { context, playing in
            updateScrollButtonAudioIsPlaying(context: context, playing: playing)
        }
        .adaptiveOnChange(of: piece?.id) { _, _ in
            let coordinator = ConversationAudioCoordinator.sharedForTesting
            updateScrollButtonAudioIsPlaying(context: coordinator.activeContext, playing: coordinator.isPlaying)
        }
    }

    func updateScrollButtonAudioIsPlaying(context: ActiveAudioContext?, playing: Bool) {
        let id = unreadAttachment?.id
        let newValue = playing && id != nil && context?.attachmentId == id
        if scrollButtonAudioIsPlaying != newValue { scrollButtonAudioIsPlaying = newValue }
    }

    private func scrollToBottomAccessibilityLabel(_ typing: [TypingParticipant]) -> String {
        let action = String(localized: "conversation.scroll-to-bottom.a11y",
                            defaultValue: "Défiler vers le bas", bundle: .main)
        if scrollState.unreadBadgeCount > 0 {
            // `UnreadCountLabel` et non une clé propre à ce bouton : la clé
            // `conversation.scroll-to-bottom.a11y-unread` était, dans les 7
            // locales, le doublon mot pour mot de la forme `other` de
            // `accessibility.unread_count` — mais à plat, donc « 1 messages
            // non lus » au singulier.
            let unread = UnreadCountLabel.messages(scrollState.unreadBadgeCount)
            return "\(unread), \(action)"
        }
        if hasTypingIndicator(typing) {
            return "\(typingLabel(typing)), \(action)"
        }
        return action
    }



    /// SF Symbol + hex tint for the last unread message when it's a call
    /// notice (`CallSummaryMetadata`, no `MessageAttachment` involved — a
    /// call system message never has one). Reads `isLive` BEFORE `outcome`
    /// (a live message's outcome is a neutral placeholder), mirroring the
    /// SSOT `CallNoticePresentation.isLive`/`.tint`
    /// (`Bubble/BubbleCallNoticeView.swift:265-274`) WITHOUT re-decoding
    /// `message.metadata` — `callSummary` is already decoded on the model.
    ///
    /// Tint diverges from `CallNoticePresentation.tint` on two states, both
    /// deliberate: live returns `nil` (the whole pill is already accent-tinted
    /// via `.adaptiveGlass(tint:)`; an accent glyph on accent glass would be
    /// invisible — the glyph falls back to `contentColor`'s WCAG black/white
    /// choice instead), and `.completed` returns `nil`/`nil` (a finished call
    /// isn't a pending action worth flagging on the scroll button). A
    /// "cancelled" call (`.missed` + `isCancelled(viewerIsInitiator:)`) stays
    /// on the same error hex as a plain "missed" call — same visual family,
    /// no dedicated branch needed.
    static func unreadCallIndicator(for summary: CallSummaryMetadata?) -> (symbol: String?, tint: String?) {
        guard let summary else { return (nil, nil) }
        let glyph = summary.callType == .video ? "video.fill" : "phone.fill"
        if summary.isLive {
            return (glyph, nil)
        }
        switch summary.outcome {
        case .missed, .rejected:
            return (glyph, MeeshyColors.errorHex)
        case .failed:
            return (glyph, MeeshyColors.warningHex)
        case .completed:
            return (nil, nil)
        }
    }

    /// SF Symbol half of `unreadCallIndicator` for the scroll-to-bottom button.
    var unreadCallSymbol: String? {
        Self.unreadCallIndicator(for: viewModel.lastUnreadMessage?.callSummary).symbol
    }

    /// Hex tint half of `unreadCallIndicator` for the scroll-to-bottom button.
    var unreadCallTint: String? {
        Self.unreadCallIndicator(for: viewModel.lastUnreadMessage?.callSummary).tint
    }


    func typingLabel(_ typing: [TypingParticipant]) -> String {
        let names = typing.displayNames
        switch names.count {
        case 1: return String(format: String(localized: "typing.named", bundle: .main), names[0])
        case 2: return String(format: String(localized: "typing.double", bundle: .main), names[0], names[1])
        default: return String(localized: "typing.several", bundle: .main)
        }
    }

    // L'indicateur de frappe en fin de conversation n'est plus un overlay :
    // c'est une vraie cellule du flux, gérée par `MessageListViewController`
    // (`MessageListItem.typingIndicator` + `TypingIndicatorBubble`).
}


/// La clé qui relance l'attente de l'échéance quand le message ou son échéance change.
nonisolated struct UnreadPillExpiry: Equatable, Sendable {
    let messageId: String?
    let deadline: Date?
}

extension ConversationView {
    func clearUnreadPreviewAtItsDeadline() async {
        guard let messageId = viewModel.lastUnreadMessage?.id, let deadline = unreadPreview.expiresAt else { return }
        while let delay = UnreadPillLaw.wait(until: deadline, now: Date()) {
            do { try await Task.sleep(for: .nanoseconds(delay)) } catch { return }
        }
        guard viewModel.lastUnreadMessage?.id == messageId, unreadPreview.text == nil else { return }
        viewModel.lastUnreadMessage = nil
    }
}

/// LA LOI DE LA PASTILLE « REVENIR EN BAS » (#13109) — pure, hors de la vue :
/// ce que la pastille a le droit de peindre du dernier message non lu, et
/// combien attendre avant de la réévaluer.
nonisolated enum UnreadPillLaw {
    /// Ce que la pastille a le droit de peindre, et l'instant où elle doit se
    /// réévaluer (l'échéance d'un éphémère encore vivant).
    nonisolated struct Preview: Sendable {
        static let withheld = Preview(text: nil, attachment: nil, expiresAt: nil)
        let text: String?
        let attachment: MessageAttachment?
        let expiresAt: Date?
    }

    /// CE QUE LA PASTILLE « REVENIR EN BAS » A LE DROIT DE MONTRER (#13109,
    /// jumelle de #12993 sur le web). La pastille peint le texte, la vignette,
    /// l'image et l'audio du dernier message non lu à côté de sa bulle : elle
    /// ne montre donc rien de ce que la bulle scelle ou voile.
    ///
    /// La protection se lit par la loi UNIQUE `MeeshyMessage.protection` —
    /// donc `MessageProtectionDescriptor.resolve`, avec l'échéance servie, la
    /// durée comptée depuis la réception locale et la mort gravée au registre —,
    /// jamais par une vérification partielle à côté. S'y ajoutent ce que la loi
    /// ne dit pas : la suppression, le flou d'une pièce, et le littéral
    /// `[Encrypted]` d'un message e2ee que cet appareil n'a pas ouvert.
    ///
    /// La pastille lit la ligne VIVANTE du fil (`liveRow`, par identifiant) et
    /// non la copie posée à la réception : celle-ci porte le texte que le
    /// serveur a écrit, que ni une suppression, ni une édition, ni l'adoption
    /// du clair ne mettent à jour. Une ligne absente du fil ne montre rien.
    /// Un message chiffré dont l'appareil n'a pas posé le clair
    /// (`EndToEndThreadPlaintexts.awaitsPlaintext`) ne montre rien, quel que
    /// soit le texte servi. Un clair servi dans l'ère chiffrée
    /// (`EndToEndPlaintextLaw.standing(...).isUnencrypted`, l'auteur n'est pas
    /// vérifié) ne s'y montre pas non plus : la bulle le porte avec son
    /// marqueur, la pastille n'en a pas.
    static func preview(
        of lastUnread: Message?,
        liveRow: (String) -> Message?,
        regime: EndToEndRegime = .serverReadable,
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared,
        now: Date
    ) -> Preview {
        guard let id = lastUnread?.id, let message = liveRow(id) else { return .withheld }
        guard !message.isDeleted, !EndToEndThreadPlaintexts.awaitsPlaintext(message),
              message.content != E2EEWire.contentPlaceholder,
              !EndToEndPlaintextLaw.standing(of: message, in: regime).isUnencrypted else { return .withheld }
        let protection = message.protection(ledger: ledger, now: now)
        let veiledPiece = message.attachments.contains { $0.declaresBlur }
        guard !protection.isExpired, !protection.requiresVeil, !message.holdsViewOnce, !veiledPiece else { return .withheld }
        return Preview(text: message.content, attachment: message.attachments.first,
                                 expiresAt: protection.ephemeralState.deadline)
    }

    /// L'attente avant de réévaluer la pastille, en nanosecondes, PLAFONNÉE à
    /// une heure par tour (#13109) : une échéance servie dans des siècles, non
    /// finie ou NaN ne fait jamais déborder la conversion — l'attente boucle.
    /// `nil` une fois l'échéance passée (avec une marge de 50 ms).
    static func wait(until deadline: Date, now: Date) -> UInt64? {
        let remaining = deadline.timeIntervalSince(now) + 0.05
        guard remaining.isFinite, remaining > 0 else { return nil }
        return UInt64(min(remaining, 3_600) * 1_000_000_000)
    }
}

/// Le libellé, le glyphe et le détail de la pièce que la pastille peint — de la pièce que la loi a laissé passer.
enum UnreadPillAttachment {
    static func typeLabel(_ attachment: MessageAttachment?) -> String? {
        guard let att = attachment else { return nil }
        return MediaKindLabel.name(MediaKindLabel.kind(for: att.type))
    }

    /// SF Symbol describing the last unread attachment's type — drives the
    /// type glyph in the scroll-to-bottom button when no thumbnail exists.
    static func symbol(_ attachment: MessageAttachment?) -> String? {
        guard let att = attachment else { return nil }
        switch att.type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "mappin.circle.fill"
        }
    }

    /// Formatted media detail of the last unread attachment shown after its
    /// type label: dimensions for image/video, duration for audio/video, and
    /// file size when known. Returns `nil` when nothing meaningful is known
    /// (e.g. fileSize 0 and no duration), matching the size-display convention.
    static func detail(_ attachment: MessageAttachment?) -> String? {
        guard let att = attachment else { return nil }
        var parts: [String] = []
        switch att.type {
        case .image, .video:
            if let w = att.width, let h = att.height, w > 0, h > 0 {
                parts.append("\(w)×\(h)")
            }
        default:
            break
        }
        if att.type == .audio || att.type == .video, let duration = att.durationFormatted {
            parts.append(duration)
        }
        if att.fileSize > 0 {
            parts.append(att.fileSizeFormatted)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
