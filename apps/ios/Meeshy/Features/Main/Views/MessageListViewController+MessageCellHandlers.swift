// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+MessageCellHandlers.swift

import UIKit
import SwiftUI
import MeeshySDK
import MeeshyUI

// Les rappels qu'une cellule de message remet à sa bulle ou à sa rangée plate (#10758). Ils sont formés ICI, hors des fermetures que la cellule stocke : une capture `[weak self]` imbriquée obligerait la fermeture englobante à retenir `self` en fort (#10853).

struct MessageCellHandlers {
    let addReaction: (String) -> Void
    let longPress: (String) -> Void
    let quoteJump: (String) -> Void
    let pieceLongPress: (String) -> Void
    let openParticipantProfile: (String) -> Void
    let openProfile: (ProfileSheetUser) -> Void
    let scrollToMessage: (String) -> Void
    let setActiveDisplayLanguage: (String?) -> Void
    let setSecondaryLanguage: (String?) -> Void
    let quotedAuthorTap: (ReplyReference) -> Void
    let quotedMediaTap: (ReplyReference) -> Void
    let playAudio: (String) -> Void
    let consentNotice: () -> Void
    let audioQueueTail: (String) -> [QueuedAudio]
}

struct MessageCellCallbacks {
    let storyReply: ((String) -> Void)?
    let viewSenderStory: ((String) -> Void)?
    let swipeReply: ((String) -> Void)?
    let swipeForward: ((String) -> Void)?
    let toggleReaction: ((String, String) -> Void)?
    let attachmentReaction: ((String, String, String) -> Void)?
    let toggleSelection: ((String) -> Void)?
    let edit: ((String) -> Void)?
    let select: ((String) -> Void)?
    let compose: ((String) -> Void)?
    let imagine: ((String) -> Void)?
    let moreSheet: ((String) -> Void)?
    let canEdit: ((String) -> Bool)?
    let openReactPicker: ((String) -> Void)?
    let showInfo: ((String) -> Void)?
    let showReadStatus: ((String) -> Void)?
    let retry: ((String) -> Void)?
    let showReactions: ((String) -> Void)?
    let showTranslation: ((String) -> Void)?
    let tapLocation: ((SharedPlace, String) -> Void)?
    let shareFile: ((URL) -> Void)?
    let callBack: ((CallSummaryMetadata) -> Void)?
    let callDetail: ((String) -> Void)?
    let mediaTap: ((MessageAttachment) -> Void)?
    let consumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    let requestTranslation: ((String, String) -> Void)?
}

struct MessageCellScene {
    let host: Router
    let stories: StoryViewModel
    let statuses: StatusViewModel
    let conversationList: ConversationListViewModel?
    let timestampReveal: FocalTimestampRevealState
    let skin: BubbleSkin
}

struct MessageRowDraft {
    let message: MeeshyMessage
    let row: MessageRowConversationContext
    let inputs: MessageCellInputs
    let handlers: MessageCellHandlers
    let callbacks: MessageCellCallbacks
    let focalRow: EquatableFocalRow?
}

struct MessageRowParts {
    let message: MeeshyMessage
    let inputs: MessageCellInputs
    let handlers: MessageCellHandlers
    let callbacks: MessageCellCallbacks
    let scene: MessageCellScene
    let makeBubble: (Bool) -> ThemedMessageBubble
    let bubble: EquatableMessageBubble
    let focalRow: EquatableFocalRow?
    let selectionModeActive: Bool
    let selectedIds: Set<String>
    let longMessageExpansion: LongMessageExpansion
}

extension MessageListViewController {

    func messageCellHandlers(for message: MeeshyMessage) -> MessageCellHandlers {
        let messageId = message.id
        let conversationId = message.conversationId
        let quotedReference = message.replyTo
        let longPressHandler: ((String) -> Void) = { [weak self] tappedId in
            guard let self else { return }
            self.onLongPress?(tappedId, self.cellFrameInWindow(messageId: tappedId))
        }
        let quotedAuthorTapHandler: (ReplyReference) -> Void = { [weak self] ref in
            self?.openQuotedAuthorProfile(ref)
        }
        let quotedMediaTapHandler: (ReplyReference) -> Void = { [weak self] ref in
            self?.openQuotedMedia(ref)
        }
        return MessageCellHandlers(
            addReaction: { [weak self] tappedId in
                guard let self else { return }
                self.onAddReaction?(tappedId, self.cellFrameInWindow(messageId: tappedId))
            },
            longPress: longPressHandler,
            quoteJump: { [weak self] targetId in
                self?.followQuote(quotedReference, to: targetId)
            },
            pieceLongPress: { [weak self] pieceId in
                guard let self else { return }
                self.onLongPressPiece?(messageId, pieceId, self.cellFrameInWindow(messageId: messageId))
            },
            openParticipantProfile: { [weak self] participantId in
                self?.router.participantProfileTarget = ParticipantProfileTarget(
                    conversationId: conversationId,
                    participantId: participantId
                )
            },
            openProfile: { [weak self] user in
                self?.router.openProfile(user, inConversation: conversationId)
            },
            scrollToMessage: { [weak self] targetId in
                self?.scrollToMessage(localId: targetId)
            },
            setActiveDisplayLanguage: { [weak self] code in
                self?.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: messageId)
            },
            setSecondaryLanguage: { [weak self] code in
                self?.conversationViewModel?.setBubbleSecondaryLanguage(code, for: messageId)
            },
            quotedAuthorTap: quotedAuthorTapHandler,
            quotedMediaTap: quotedMediaTapHandler,
            playAudio: { [weak self] attachmentId in
                self?.conversationViewModel?.playAudio(attachmentId: attachmentId)
            },
            consentNotice: { [weak self] in
                self?.router.push(.settings)
            },
            audioQueueTail: { [weak self] attachmentId in
                self?.conversationViewModel?.audioQueueTail(after: attachmentId) ?? []
            }
        )
    }

    func messageCellCallbacks() -> MessageCellCallbacks {
        MessageCellCallbacks(
            storyReply: onStoryReplyTap,
            viewSenderStory: onViewSenderStory,
            swipeReply: onSwipeReply,
            swipeForward: onSwipeForward,
            toggleReaction: onToggleReaction,
            attachmentReaction: onReactToAttachment,
            toggleSelection: onToggleSelection,
            edit: onEditMessage,
            select: onSelectMessage,
            compose: onComposeFromMessage,
            imagine: onImagineFromMessage,
            moreSheet: onOpenMoreSheet,
            canEdit: canEditMessage,
            openReactPicker: onOpenReactPicker,
            showInfo: onShowMessageInfo,
            showReadStatus: onShowReadStatus,
            retry: onRetry,
            showReactions: onShowReactions,
            showTranslation: onShowTranslationDetail,
            tapLocation: onFocalTapLocation,
            shareFile: onFocalShareFile,
            callBack: onCallBack,
            callDetail: onCallDetailRequest,
            mediaTap: onMediaTap,
            consumeViewOnce: onConsumeViewOnce,
            requestTranslation: onRequestTranslation
        )
    }
}
