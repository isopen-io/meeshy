import Foundation

/// Les constructeurs PURS de l'envoi : ce qui part sur le fil, ce qui va dans
/// la file, et quel transport a le droit de le porter.
extension OutgoingMessage {

    /// Le corps REST. Les bits d'effet sont lus par l'appelant à l'instant de
    /// la composition (`wireEffectFlags`) : l'état composeur est mutable.
    public func wireRequest(
        content: String?,
        isEncrypted: Bool,
        encryptionMode: String?,
        context: SendAttemptContext,
        wireEffectFlags: UInt32?
    ) -> SendMessageRequest {
        SendMessageRequest(
            content: content,
            originalLanguage: context.language,
            replyToId: relation.replyToId,
            storyReplyToId: relation.storyReplyToId,
            forwardedFromId: relation.forwardedFromId,
            forwardedFromConversationId: relation.forwardedFromConversationId,
            attachmentIds: attachments.ids,
            ephemeralDuration: context.intent.ephemeralDurationSeconds,
            isViewOnce: context.intent.isViewOnce ? true : nil,
            maxViewOnceCount: context.intent.maxViewOnceCount,
            isBlurred: context.intent.wireIsBlurred,
            effectFlags: wireEffectFlags,
            isEncrypted: isEncrypted ? true : nil,
            encryptionMode: encryptionMode,
            clientMessageId: context.clientMessageId.rawValue,
            location: location,
            sticker: sticker,
            attachmentReplyTo: relation.attachmentReplyTo
        )
    }

    /// L'item de la file hors ligne : langue d'origine BRUTE (nil possible),
    /// relation complète.
    public func offlineQueueItem(clientMessageId: MessageID, intent: MessageProtectionIntent) -> OfflineQueueItem {
        OfflineQueueItem(
            conversationId: conversationId.rawValue,
            content: text,
            clientMessageId: clientMessageId.rawValue,
            originalLanguage: originalLanguage,
            replyToId: relation.replyToId,
            storyReplyToId: relation.storyReplyToId,
            forwardedFromId: relation.forwardedFromId,
            forwardedFromConversationId: relation.forwardedFromConversationId,
            attachmentIds: attachments.ids,
            attachmentKinds: attachmentKinds,
            location: location,
            sticker: sticker,
            attachmentReplyTo: relation.attachmentReplyTo?.attachmentId,
            protection: intent
        )
    }

    /// L'item de relance après un échec en ligne : langue RÉSOLUE. Il ne porte
    /// ni le lien de story ni le transfert — défaut connu, reproduit tel quel
    /// (dette : l'item hors ligne, lui, les porte).
    public func retryQueueItem(context: SendAttemptContext) -> OfflineQueueItem {
        OfflineQueueItem(
            conversationId: conversationId.rawValue,
            content: text,
            clientMessageId: context.clientMessageId.rawValue,
            originalLanguage: context.language,
            replyToId: relation.replyToId,
            attachmentIds: attachments.ids,
            attachmentKinds: attachmentKinds,
            location: location,
            sticker: sticker,
            attachmentReplyTo: relation.attachmentReplyTo?.attachmentId,
            protection: context.intent
        )
    }

    /// Le socket-first ne porte que du texte nu : ni chiffrement, ni pièces, ni
    /// protection, ni effets, ni ancre de pièce citée.
    public func socketFirstEligible(
        connected: Bool,
        isEncrypted: Bool,
        intent: MessageProtectionIntent,
        hasPendingEffects: Bool
    ) -> Bool {
        connected
            && !isEncrypted
            && (attachments.ids?.isEmpty ?? true)
            && socketFallbackEligible(intent: intent, hasPendingEffects: hasPendingEffects)
    }

    /// Le repli socket accepte le chiffrement et les pièces, mais refuse ce que
    /// le canal perdrait en silence : protection, effets, ancre de pièce citée.
    public func socketFallbackEligible(intent: MessageProtectionIntent, hasPendingEffects: Bool) -> Bool {
        intent.ephemeralDurationSeconds == nil
            && !intent.ephemeralAfterRead
            && !intent.isViewOnce
            && intent.wireIsBlurred != true
            && !hasPendingEffects
            && relation.attachmentReplyTo == nil
    }

    public var optimisticMessageType: MeeshyMessage.MessageType {
        guard let first = attachments.previews?.first else { return .text }
        switch first.type {
        case .image: return .image
        case .video: return .video
        case .audio: return .audio
        case .file: return .file
        case .location: return .location
        }
    }

    public var attachmentKinds: [String]? {
        attachments.previews?.map { $0.kind.rawValue }
    }
}
