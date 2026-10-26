import Foundation
import GRDB
import MeeshySDK

/// La ligne GRDB optimiste d'un message média, composée de ses seules entrées.
enum OptimisticMediaRecordBuilder {

    static func record(
        tempId: String,
        conversationId: String,
        senderId: String,
        sender: MeeshyUser?,
        content: String,
        originalLanguage: String,
        messageType: Message.MessageType,
        replyToId: String?,
        storyReplyToId: String?,
        replyToJson: Data?,
        attachmentsJson: Data?,
        stickerJson: String?,
        protection: MessageProtectionIntent,
        sealedEndToEnd: Bool,
        now: Date
    ) -> MessageRecord {
        MessageRecord(
            localId: tempId, serverId: nil,
            conversationId: conversationId, senderId: senderId,
            // #12999 — une pièce ne part pas d'une conversation chiffrée de bout
            // en bout : sa légende n'est pas scellée, elle ne s'écrit pas.
            content: content.isEmpty || sealedEndToEnd ? nil : content,
            originalLanguage: originalLanguage,
            messageType: messageType.rawValue, messageSource: "user", contentType: messageType.rawValue,
            state: .sending, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: replyToJson, forwardedFromJson: nil,
            // La bulle optimiste PORTE la protection qu'on vient d'armer
            // (#7498). Elle valait `nil`/`0` en dur : l'expéditeur envoyait un
            // éphémère et voyait un message ordinaire — ni flamme, ni
            // décompte, ni voile — jusqu'à la réconciliation serveur. Le
            // défaut se lisait comme « la protection n'a pas été appliquée »,
            // ce qui était vrai à l'écran et faux sur le fil.
            // #8905 — la DURÉE, jamais une échéance : l'envoi n'est pas une
            // réception, la flamme lit « en attente de réception ».
            expiresAt: nil,
            effectFlags: protection.lifecycleFlags.rawValue,
            maxViewOnceCount: protection.maxViewOnceCount, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: sender?.displayName,
            senderUsername: sender?.username,
            senderColor: nil, senderAvatarURL: sender?.avatar,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: now, sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: now,
            attachmentsJson: attachmentsJson, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 0,
            stickerJson: stickerJson,
            ephemeralDuration: protection.ephemeralDurationSeconds
        )
    }
}

/// La ligne GRDB optimiste d'un message TEXTE (en ligne ou mis en file hors
/// ligne), composée de ses seules entrées. L'identifiant du lieu et du sticker
/// est celui de l'appelant : il encode les colonnes JSON avant de composer.
enum OptimisticTextRecordBuilder {

    static func record(
        localId: String,
        conversationId: String,
        senderId: String,
        sender: MeeshyUser?,
        text: String,
        originalLanguage: String,
        messageType: String,
        replyToId: String?,
        storyReplyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        replyToJson: Data?,
        effectFlags: UInt32,
        maxViewOnceCount: Int?,
        locationJson: String?,
        stickerJson: String?,
        sealedEndToEnd: Bool,
        now: Date,
        ephemeralDuration: Int?
    ) -> MessageRecord {
        MessageRecord(
            localId: localId, serverId: nil,
            conversationId: conversationId, senderId: senderId,
            // #12999 — le clair d'un envoi chiffré de bout en bout vit dans le
            // coffre libsignal (rangé AVANT cette ligne) ; la ligne ne porte que
            // le littéral, comme celle que le serveur servira.
            content: sealedEndToEnd ? E2EEWire.contentPlaceholder : (text.isEmpty ? nil : text),
            originalLanguage: originalLanguage,
            messageType: messageType, messageSource: "user", contentType: "text",
            state: .sending, retryCount: 0, lastError: nil,
            isEncrypted: sealedEndToEnd, encryptionMode: sealedEndToEnd ? E2EEWire.mode : nil, encryptedPayload: nil,
            replyToId: replyToId, storyReplyToId: storyReplyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            replyToJson: replyToJson, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: effectFlags,
            maxViewOnceCount: maxViewOnceCount, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: sender?.displayName,
            senderUsername: sender?.username,
            senderColor: nil, senderAvatarURL: sender?.avatar,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: now, sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: now,
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 0,
            locationJson: locationJson,
            stickerJson: stickerJson,
            ephemeralDuration: ephemeralDuration
        )
    }
}

/// Les colonnes JSON du record OPTIMISTE, écrites EN BASE et pas seulement dans
/// le `Message` en mémoire : une écriture GRDB concurrente (`messagesDidChange`)
/// ou un relaunch effacerait une valeur purement mémoire.
enum OptimisticRecordColumns {

    /// Colonne `stickerJson` du record OPTIMISTE (#4823) — même mécanique que
    /// `locationJson` : sinon une bulle sticker resterait muette jusqu'à
    /// l'écho serveur.
    static func stickerJson(_ sticker: MessageSticker?, id: String) -> String? {
        sticker
            .flatMap { JSONEncoder().encodeOrLog($0, field: "stickerJson", id: id) }
            .flatMap { String(data: $0, encoding: .utf8) }
    }

    /// Colonne `locationJson` : les transports, eux, portent le `SharedPlace`
    /// tel quel.
    static func locationJson(_ location: SharedPlace?, id: String) -> String? {
        location
            .flatMap { JSONEncoder().encodeOrLog($0, field: "locationJson", id: id) }
            .flatMap { String(data: $0, encoding: .utf8) }
    }
}
