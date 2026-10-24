import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// Construction des rangées du fil : bulle, rangée plate Focal/Script, séparateurs et indicateur de frappe (#10758).

/// Ce que TOUTE rangée d'une conversation reçoit de son fil : le point d'entrée
/// unique d'une donnée par conversation vers les cellules (#10758) — dont la
/// peau des bulles tirée de l'apparence choisie (#10753).
struct MessageRowConversationContext: Equatable {
    let accentHex: String
    let isDark: Bool
    let isDirect: Bool
    let currentUserId: String
    let bubbleSkin: BubbleSkin
}

extension MessageListViewController {

    var rowConversationContext: MessageRowConversationContext {
        MessageRowConversationContext(
            accentHex: accentColor,
            isDark: isDark,
            isDirect: isDirect,
            currentUserId: currentUserId,
            bubbleSkin: bubbleSkin
        )
    }

    // MARK: - DataSource

    func configureDataSource() {
        // Cells host their SwiftUI content via UIHostingConfiguration
        // (iOS 16+). The message registration reuses the rich SwiftUI bubble
        // shipped before — avatars, sender chrome, accent gradients,
        // translations, reactions, etc. — without manually mirroring its
        // layout in UIKit. The hosting configuration diff-updates on reuse,
        // so scroll performance is preserved.
        // Une registration PAR type d'item (bulle / séparateur de jour /
        // typing). Avec une registration unique, UIKit recyclait une cellule
        // hébergeant un `BubbleSwipeContainer<…>` pour y poser une
        // configuration `MessageDaySeparator` (et inversement) : le hosting
        // content view existant ne supporte pas le nouveau type racine, UIKit
        // détruit et reconstruit la content view à chaque recyclage croisé
        // (warning runtime `UIContentConfigurationAlertForReplacedContentView`,
        // coût visible au scroll). Des registrations distinctes donnent des
        // pools de réutilisation distincts : chaque cellule ne reçoit que des
        // configurations de son propre type racine et se diff-update en place.

        let typingRegistration = makeTypingRegistration()
        let dayHeaderRegistration = makeDayHeaderRegistration()
        let startRegistration = makeConversationStartRegistration()

        let messageRegistration = makeMessageRegistration()
        let unreadSeparatorRegistration = makeUnreadSeparatorRegistration()

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { cv, indexPath, item in
            switch item {
            case .message:
                return cv.dequeueConfiguredReusableCell(using: messageRegistration, for: indexPath, item: item)
            case .dayHeader:
                return cv.dequeueConfiguredReusableCell(using: dayHeaderRegistration, for: indexPath, item: item)
            case .typingIndicator:
                return cv.dequeueConfiguredReusableCell(using: typingRegistration, for: indexPath, item: item)
            case .conversationStart:
                return cv.dequeueConfiguredReusableCell(using: startRegistration, for: indexPath, item: item)
            case .firstUnreadSeparator:
                return cv.dequeueConfiguredReusableCell(using: unreadSeparatorRegistration, for: indexPath, item: item)
            }
        }
    }

    func makeMessageRegistration() -> UICollectionView.CellRegistration<MessageListCell, MessageListItem> {
        UICollectionView.CellRegistration<MessageListCell, MessageListItem> { [weak self] cell, _, item in
            guard let self else {
                cell.contentConfiguration = nil
                return
            }
            let _spState = PerfSignpost.signposter.beginInterval("cellConfig")
            defer { PerfSignpost.signposter.endInterval("cellConfig", _spState) }
            cell.tag = 0

            guard case .message(let localId) = item,
                  var message = self.store.domainMessage(for: localId, currentUserId: self.currentUserId) else {
                cell.contentConfiguration = nil
                return
            }
            self.applyVisitState(to: &message)
            let row = self.rowConversationContext
            let inputs = self.messageCellInputs(for: message, localId: localId, row: row)
            let handlers = self.messageCellHandlers(for: message)
            let callbacks = self.messageCellCallbacks()
            let focalRow: EquatableFocalRow?
            if self.readingMode.usesFlatRow {
                focalRow = self.makeFocalRow(
                    cell: cell,
                    localId: localId,
                    message: message,
                    row: row,
                    inputs: inputs,
                    handlers: handlers,
                    callbacks: callbacks
                )
            } else {
                focalRow = nil
            }
            let draft = MessageRowDraft(
                message: message,
                row: row,
                inputs: inputs,
                handlers: handlers,
                callbacks: callbacks,
                focalRow: focalRow
            )
            self.configureMessageCell(cell, localId: localId, draft: draft)
        }
    }

    func configureMessageCell(_ cell: MessageListCell, localId: String, draft: MessageRowDraft) {
        let message = draft.message
        let row = draft.row
        let inputs = draft.inputs
        let handlers = draft.handlers
        let callbacks = draft.callbacks
        let scene = MessageCellScene(
            host: router,
            stories: storyViewModel,
            statuses: statusViewModel,
            conversationList: conversationListViewModel,
            timestampReveal: timestampReveal,
            skin: row.bubbleSkin
        )
        let nativeMenu: (() -> AnyView)? = nil
        if nativeMenu == nil {
            cell.interactions
                .filter { $0 is UIContextMenuInteraction }
                .forEach { cell.removeInteraction($0) }
        }
        let statuses = scene.statuses
        let makeThemedBubble: (Bool) -> ThemedMessageBubble = { standalone in
            MessageListViewController.themedBubble(
                message: message,
                row: row,
                inputs: inputs,
                handlers: handlers,
                callbacks: callbacks,
                statuses: statuses,
                standalone: standalone
            )
        }
        let bubble = EquatableMessageBubble(bubble: makeThemedBubble(false))
        let isFocusedCell = (self.readingMode.usesFlatRow && focalDetailedLocalId == localId) || expandedLongMessageLocalId == localId
        cell.clipsToBounds = false
        cell.contentView.clipsToBounds = false
        cell.layer.zPosition = isFocusedCell ? 1 : 0
        let longMessageExpansion = self.longMessageExpansion(for: localId)
        let parts = MessageRowParts(
            message: message,
            inputs: inputs,
            handlers: handlers,
            callbacks: callbacks,
            scene: scene,
            makeBubble: makeThemedBubble,
            bubble: bubble,
            focalRow: draft.focalRow,
            selectionModeActive: isSelectionModeActive,
            selectedIds: selectedMessageIds,
            longMessageExpansion: longMessageExpansion
        )
        applyMessageContent(to: cell, parts: parts, nativeMenu: nativeMenu)
    }

    func makeFocalRow(
        cell: MessageListCell,
        localId: String,
        message: MeeshyMessage,
        row: MessageRowConversationContext,
        inputs: MessageCellInputs,
        handlers: MessageCellHandlers,
        callbacks: MessageCellCallbacks
    ) -> EquatableFocalRow {
        let isFirstInGroup = MessageRowGrouping.isFirstInGroup(
            MessageRowGrouping.candidate(of: message),
            at: store.index(of: localId),
            in: store.messages
        )
        cell.tag = FocalScrollPerspective.cellTag(isFirstInGroup: isFirstInGroup, showsFocusDetails: focalDetailedLocalId == localId)
        let focalInput = focalRowInput(
            localId: localId,
            message: message,
            row: row,
            inputs: inputs,
            isFirstInGroup: isFirstInGroup
        )
        let focalActions = focalRowActions(localId: localId, message: message, inputs: inputs, handlers: handlers, callbacks: callbacks)
        return EquatableFocalRow(row: FocalRow(input: focalInput, actions: focalActions))
    }

    func focalRowInput(
        localId: String,
        message: MeeshyMessage,
        row: MessageRowConversationContext,
        inputs: MessageCellInputs,
        isFirstInGroup: Bool
    ) -> FocalRowInput {
        let record = store.message(for: localId)
        let isOptimistic = record.map { MessageListViewController.optimisticStates.contains($0.state) } ?? false
        let isMine = message.isMe
        let senderId = message.senderId
        let languageSelection = inputs.languageSelection
        let content = BubbleContent(
            message: message,
            translations: inputs.translations,
            preferredTranslation: inputs.preferred,
            translatedAudios: inputs.translatedAudios,
            userLanguages: inputs.userLanguages,
            secondaryLangCode: languageSelection?.secondaryLangCode,
            activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
            preferredAudioLangCode: inputs.preferredAudioLang,
            currentUserId: row.currentUserId,
            recipientCount: inputs.recipients
        )
        return FocalRowInput(
            localId: localId,
            serverId: record?.serverId,
            content: content,
            density: self.readingMode == .script ? .script : .focal,
            isFirstInGroup: isFirstInGroup,
            isLastInGroup: inputs.isLastInGroup,
            senderId: senderId,
            senderDisplayName: message.senderName ?? message.senderUsername ?? "",
            senderUsername: message.senderUsername,
            senderAvatarURL: message.senderAvatarURL,
            senderThumbHash: nil,
            senderColorHex: message.senderColor ?? row.accentHex,
            senderPresence: inputs.senderPresence ?? .offline,
            senderIsHere: inputs.senderIsHere,
            senderStoryRing: inputs.senderRingState,
            senderMoodEmoji: statusViewModel.statusForUser(userId: senderId)?.moodEmoji,
            senderIsAnonymous: message.senderIsAnonymous,
            senderRing: isMine ? nil : message.senderRing,
            accentHex: row.accentHex,
            isDark: row.isDark,
            isDirect: row.isDirect,
            isRightToLeft: collectionView.effectiveUserInterfaceLayoutDirection == .rightToLeft,
            isOptimistic: isOptimistic,
            isAgentAuthored: message.messageSource == .agent,
            showsAgentGrammar: MeeshyFeatureFlags.isAgentGrammarEnabled,
            highlightSearchTerm: inputs.highlightTerm,
            mentionDisplayNames: inputs.mentionDisplayNames,
            userLanguages: inputs.userLanguages,
            activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
            secondaryLangCode: languageSelection?.secondaryLangCode,
            voiceConsentMissing: inputs.voiceConsentMissing,
            transcription: inputs.transcription?.text,
            translatedAudios: inputs.translatedAudios,
            allAudioItems: inputs.allAudioItems,
            conversationName: inputs.conversationName ?? "",
            effects: message.effects,
            isLastReceivedMessage: inputs.isLastReceived,
            isFocused: focalDetailedLocalId == localId,
            isExpanded: expandedLongMessageLocalId == localId,
            sentAt: message.createdAt,
            focusTimestamp: self.focalDetailedLocalId == localId ? self.focalFocusTimestamp(for: message.createdAt) : nil,
            availableWidth: rowAvailableWidth
        )
    }

    func focalRowActions(
        localId: String,
        message: MeeshyMessage,
        inputs: MessageCellInputs,
        handlers: MessageCellHandlers,
        callbacks: MessageCellCallbacks
    ) -> FocalRowActions {
        let messageId = message.id
        let senderId = message.senderId
        let statuses = statusViewModel
        let showInfoHandler = callbacks.showInfo
        let quoteJumpHandler = handlers.quoteJump
        let tapLocationHandler = callbacks.tapLocation
        let hasStory = inputs.senderRingState != .none
        var focalActions = FocalRowActions(onMoodTap: statuses.moodTapHandler(for: senderId))
        focalActions.onToggleReaction = { emoji in callbacks.toggleReaction?(messageId, emoji) }
        focalActions.onAddReaction = handlers.addReaction
        focalActions.onOpenReactPicker = callbacks.openReactPicker
        focalActions.onOpenParticipantProfile = handlers.openParticipantProfile
        focalActions.onShowReactions = callbacks.showReactions
        focalActions.onShowReadStatus = callbacks.showReadStatus
        focalActions.onShowMessageInfo = showInfoHandler
        focalActions.onRetry = callbacks.retry
        focalActions.onReplyTap = quoteJumpHandler
        focalActions.onStoryReplyTap = callbacks.storyReply
        focalActions.onMediaTap = callbacks.mediaTap
        focalActions.onConsumeViewOnce = callbacks.consumeViewOnce
        focalActions.onReactToAttachment = { attId, emoji in callbacks.attachmentReaction?(attId, messageId, emoji) }
        focalActions.onRequestTranslation = callbacks.requestTranslation
        focalActions.onShowTranslationDetail = callbacks.showTranslation
        focalActions.onToggleExpanded = { [weak self] in self?.toggleLongMessageExpansion(localId) }
        focalActions.onTapLocation = { place in tapLocationHandler?(place, messageId) }
        focalActions.onShareFile = callbacks.shareFile
        focalActions.onSetActiveDisplayLanguage = { [weak self] msgId, code in
            self?.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: msgId)
        }
        focalActions.onSetActiveDisplayLanguageForGroup = { [weak self] msgId, code in
            guard let self else { return }
            for memberId in self.messageIdsInGroup(endingAt: msgId) {
                self.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: memberId)
            }
        }
        focalActions.onSetSecondaryLanguage = { [weak self] msgId, code in
            self?.conversationViewModel?.setBubbleSecondaryLanguage(code, for: msgId)
        }
        focalActions.onPlayAudio = handlers.playAudio
        focalActions.audioQueueTailProvider = handlers.audioQueueTail
        focalActions.onTapConsentNotice = handlers.consentNotice
        focalActions.onOpenProfile = handlers.openProfile
        focalActions.onQuotedAuthorTap = handlers.quotedAuthorTap
        focalActions.onQuotedMediaTap = handlers.quotedMediaTap
        focalActions.onMore = { _ in handlers.longPress(messageId) }
        focalActions.onViewStory = hasStory ? { _ in callbacks.viewSenderStory?(senderId) } : nil
        focalActions.onCallBack = { _ in
            guard let summary = message.callSummary else { return }
            callbacks.callBack?(summary)
        }
        focalActions.onLongPressCallDetail = { _ in callbacks.callDetail?(messageId) }
        return focalActions
    }

    func messageEditMenuActions(message: MeeshyMessage, callbacks: MessageCellCallbacks, offer: MessageRowOffer) -> [MessageEditMenuAction] {
        MessageEditMenuAction.primaires(
            messageId: message.id,
            peutEditer: offer.canEdit,
            editer: callbacks.edit,
            selectionner: callbacks.select,
            composer: message.exitOffer.offers(.publish) ? callbacks.compose : nil,
            imager: message.exitOffer.offers(.imagine) && MessageCardSubject.isExportable(message, now: Date()) ? callbacks.imagine : nil,
            repondre: offer.canReply ? callbacks.swipeReply : nil,
            transferer: offer.canForward ? callbacks.swipeForward : nil,
            plus: callbacks.moreSheet
        )
    }

    func applyMessageContent(
        to cell: MessageListCell,
        parts: MessageRowParts,
        nativeMenu: (() -> AnyView)?
    ) {
        let message = parts.message
        let messageId = message.id
        let handlers = parts.handlers
        let callbacks = parts.callbacks
        let scene = parts.scene
        let host = scene.host
        let stories = scene.stories
        let statuses = scene.statuses
        let convList = scene.conversationList
        let timestampReveal = scene.timestampReveal
        let skin = scene.skin
        let focalRow = parts.focalRow
        let messageBubble = parts.bubble.equatable()
        let makeThemedBubble = parts.makeBubble
        let selectionModeActive = parts.selectionModeActive
        let pieceLongPressHandler = handlers.pieceLongPress
        let selectedIds = parts.selectedIds
        let longMessageExpansion = parts.longMessageExpansion
        let offer = callbacks.rowOffer?(message) ?? .closed // #12626 — la loi, lue une fois par configuration
        cell.contentConfiguration = UIHostingConfiguration {
            BubbleSwipeContainer(
                isMine: message.isMe,
                messageCreatedAt: message.createdAt,
                isHiddenForOverlay: message.id == self.overlaidMessageId,
                resistance: parts.inputs.hasTimebasedMedia ? .resistant : .normal,
                uniformFlatDirection: self.readingMode.usesFlatRow,
                onSwipeReply: offer.canReply ? { callbacks.swipeReply?(messageId) } : nil,
                onSwipeForward: offer.canForward ? { callbacks.swipeForward?(messageId) } : nil,
                onLongPress: { handlers.longPress(messageId) },
                enableLongPress: true,
                isSelectionModeActive: selectionModeActive,
                isSelected: selectedIds.contains(messageId),
                onToggleSelection: { callbacks.toggleSelection?(messageId) },
                editMenuActions: self.messageEditMenuActions(message: message, callbacks: callbacks, offer: offer)
            ) {
                if let focalRow {
                    focalRow.equatable().modifier(UnencryptedMessageMarking(isUnencrypted: parts.inputs.isUnencrypted, isDark: self.isDark))
                } else {
                    messageBubble.longMessageFocus(longMessageExpansion).modifier(UnencryptedMessageMarking(isUnencrypted: parts.inputs.isUnencrypted, isDark: self.isDark))
                }
            }
            .environmentObject(host)
            .environmentObject(stories)
            .environmentObject(statuses)
            .environment(\.bubbleSkin, skin)
            .environment(\.bubbleContainerWidth, self.collectionView.bounds.width > 0 ? self.collectionView.bounds.width : nil)
            .environment(\.messagePieceLongPress, selectionModeActive ? nil : pieceLongPressHandler)
            .environment(\.pieceSpotlight, self.pieceSpotlight.eraseToAnyPublisher())
            .conversationListObject(convList).announcesCaptures() // #9617 — le fil déclare ce qu'il montre
            .environmentObject(timestampReveal)
            .scaleEffect(x: 1, y: -1)
            .nativeMessageContextMenu(menu: nativeMenu) {
                MessageMenuPreviewContainer {
                    if let focalRow {
                        focalRow
                            .environmentObject(host)
                            .environmentObject(stories)
                            .environmentObject(statuses)
                            .conversationListObject(convList)
                            .environmentObject(timestampReveal)
                    } else {
                        makeThemedBubble(true)
                            .environment(\.bubbleSkin, skin)
                            .environmentObject(host)
                            .environmentObject(stories)
                            .environmentObject(statuses)
                            .conversationListObject(convList)
                    }
                }
            }
        }
        .margins(.all, 0)
        cell.backgroundColor = .clear
        FocalScrollPerspective.reset(cell.contentView.layer)
    }

    static func themedBubble(
        message: MeeshyMessage,
        row: MessageRowConversationContext,
        inputs: MessageCellInputs,
        handlers: MessageCellHandlers,
        callbacks: MessageCellCallbacks,
        statuses: StatusViewModel,
        standalone: Bool
    ) -> ThemedMessageBubble {
        let messageId = message.id
        let senderId = message.senderId
        let senderPresence = inputs.senderPresence
        let senderIsHere = inputs.senderIsHere
        let languageSelection = inputs.languageSelection
        let quoteJumpHandler = handlers.quoteJump
        let quotedAuthorTapHandler = handlers.quotedAuthorTap
        let quotedMediaTapHandler = handlers.quotedMediaTap
        let onViewStory: (() -> Void)? = inputs.senderRingState != .none
            ? { callbacks.viewSenderStory?(senderId) }
            : nil
        return ThemedMessageBubble(
            message: message,
            contactColor: row.accentHex,
            recipientCount: inputs.recipients,
            isDirect: row.isDirect,
            isDark: row.isDark,
            transcription: inputs.transcription,
            translatedAudios: inputs.translatedAudios,
            textTranslations: inputs.translations,
            preferredTranslation: inputs.preferred,
            preferredAudioLangCode: inputs.preferredAudioLang,
            showAvatar: !row.isDirect,
            presenceState: senderPresence,
            senderIsHere: senderIsHere, senderMoodEmoji: statuses.statusForUser(userId: senderId)?.moodEmoji,
            senderStoryRingState: inputs.senderRingState,
            onSenderMoodTap: statuses.moodTapHandler(for: senderId),
            onViewStory: onViewStory,
            onAddReaction: handlers.addReaction,
            onToggleReaction: { emoji in callbacks.toggleReaction?(messageId, emoji) },
            onOpenReactPicker: callbacks.openReactPicker,
            onShowInfo: { callbacks.showInfo?(messageId) },
            onShowReactions: callbacks.showReactions,
            onShowReadStatus: callbacks.showReadStatus,
            onRetry: callbacks.retry,
            onReplyTap: quoteJumpHandler,
            onStoryReplyTap: callbacks.storyReply,
            onMediaTap: callbacks.mediaTap,
            onQuotedAuthorTap: quotedAuthorTapHandler,
            onQuotedMediaTap: quotedMediaTapHandler,
            onConsumeViewOnce: callbacks.consumeViewOnce,
            onReactToAttachment: { attId, emoji in callbacks.attachmentReaction?(attId, messageId, emoji) },
            onRequestTranslation: callbacks.requestTranslation,
            onShowTranslationDetail: callbacks.showTranslation,
            onPlayAudio: handlers.playAudio,
            allAudioItems: inputs.allAudioItems,
            messageAudioItems: inputs.audioIndex[messageId] ?? [],
            conversationName: inputs.conversationName,
            audioQueueTailProvider: handlers.audioQueueTail,
            onScrollToMessage: handlers.scrollToMessage,
            onCallBack: callbacks.callBack,
            onLongPressCallDetail: { callbacks.callDetail?(messageId) },
            activeAudioLanguage: languageSelection?.activeDisplayLangCode,
            isLastInGroup: inputs.isLastInGroup,
            isLastReceivedMessage: inputs.isLastReceived,
            isLastSentMessage: inputs.isLastSent,
            mentionDisplayNames: inputs.mentionDisplayNames,
            highlightSearchTerm: inputs.highlightTerm,
            currentUserId: row.currentUserId,
            userLanguages: inputs.userLanguages,
            activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
            secondaryLangCode: languageSelection?.secondaryLangCode,
            onSetActiveDisplayLanguage: handlers.setActiveDisplayLanguage,
            onSetSecondaryLanguage: handlers.setSecondaryLanguage,
            onOpenProfile: handlers.openProfile,
            onOpenParticipantProfile: handlers.openParticipantProfile,
            voiceConsentMissing: inputs.voiceConsentMissing,
            onTapConsentNotice: handlers.consentNotice,
            standalone: standalone
        )
    }
}
