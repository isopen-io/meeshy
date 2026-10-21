// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+MessageCellInputs.swift

import Foundation
import MeeshySDK
import MeeshyUI

// Les valeurs qu'une cellule de message fige à sa configuration : la bulle ne dépend que de ces entrées primitives, jamais du ViewModel (#10758).

struct MessageCellInputs {
    let recipients: Int
    let translations: [MessageTranslation]
    let preferred: MessageTranslation?
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
    let highlightTerm: String?
    let allAudioItems: [ConversationViewModel.AudioItem]
    let audioIndex: [String: [ConversationViewModel.AudioItem]]
    let conversationName: String?
    let mentionDisplayNames: [String: String]
    let isLastReceived: Bool
    let isLastSent: Bool
    let languageSelection: ConversationViewModel.BubbleLanguageSelection?
    let userLanguages: (regional: String?, custom: String?)
    let preferredAudioLang: String?
    let senderRingState: StoryRingState
    let senderIsHere: ConversationHere
    let senderPresence: PresenceState?
    let isLastInGroup: Bool
    let hasTimebasedMedia: Bool
    let voiceConsentMissing: Bool

    static func recipientCount(isDirect: Bool, serverRecipients: Int, memberCount: Int?) -> Int {
        guard !isDirect else { return 1 }
        guard serverRecipients > 0 else { return max(1, (memberCount ?? 2) - 1) }
        return serverRecipients
    }
}

extension MessageListViewController {

    func messageCellInputs(
        for message: MeeshyMessage,
        localId: String,
        row: MessageRowConversationContext
    ) -> MessageCellInputs {
        let vm = conversationViewModel
        let isMine = message.isMe
        let translatedAudios = vm?.messageTranslatedAudios[message.id] ?? []
        let languageSelection = vm?.bubbleLanguageSelections[message.id]
        let user = AuthManager.shared.currentUser
        let senderRingState: StoryRingState = isMine
            ? .none
            : storyViewModel.storyRingState(forUserId: message.senderId)
        let senderIsHere: ConversationHere = isMine ? .absent : conversationHere[message.viewingKey]
        let senderPresence: PresenceState? = isMine ? nil : PresenceManager.shared.presenceState(forSenderOf: message)
        let preferredAudioLang = AudioTrackLanguageResolver.resolve(
            manualOverride: nil,
            originalLanguage: message.originalLanguage,
            preferredLanguages: ConversationLanguagePreferences(user: user).resolved,
            translatedAudios: translatedAudios
        )
        return MessageCellInputs(
            recipients: MessageCellInputs.recipientCount(
                isDirect: row.isDirect,
                serverRecipients: message.recipientCount,
                memberCount: vm?.currentConversation?.memberCount
            ),
            translations: vm?.messageTranslations[message.id] ?? [],
            preferred: vm?.preferredTranslation(for: message.id),
            transcription: vm?.messageTranscriptions[message.id],
            translatedAudios: translatedAudios,
            highlightTerm: vm?.currentSearchQuery,
            allAudioItems: vm?.allAudioItems ?? [],
            audioIndex: vm?.audioItemsByMessageId ?? [:],
            conversationName: vm?.currentConversationName,
            mentionDisplayNames: vm?.mentionDisplayNames ?? [:],
            isLastReceived: vm?.lastReceivedMessageId == message.id,
            isLastSent: vm?.lastSentMessageId == message.id,
            languageSelection: languageSelection,
            userLanguages: (user?.regionalLanguage, user?.customDestinationLanguage),
            preferredAudioLang: preferredAudioLang,
            senderRingState: senderRingState,
            senderIsHere: senderIsHere,
            senderPresence: senderPresence,
            isLastInGroup: MessageRowGrouping.isLastInGroup(
                MessageRowGrouping.candidate(of: message),
                at: store.index(of: localId),
                in: store.messages
            ),
            hasTimebasedMedia: message.attachments.contains { AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack },
            voiceConsentMissing: vm?.voiceConsentMissing ?? false
        )
    }
}
