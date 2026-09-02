import Foundation
import SocketIO

// Extrait de `MessageSocketManager.swift` (4 152 lignes, quatre fois le budget
// 800-1100 de la directive 2026-08-28, qui interdit d'AJOUTER à un fichier
// hors budget). Le lot #4823 ajoute le sticker à l'émission : on extrait
// d'abord, on ajoute ensuite. Responsabilité tenue ici : ÉMETTRE un message
// (avec ou sans pièces jointes) et lire son ACK — et rien d'autre.

extension MessageSocketManager {

    // MARK: - Send With Attachments

    /// ACK returned by the gateway after `message:send` / `message:send-with-attachments`.
    /// Phase 4 (spec §6.2) requires `_sendResponse()` to echo back the same
    /// `clientMessageId` the client supplied in the request so the local
    /// outbox/optimistic layer can match the row without scraping the
    /// `message:new` broadcast. `clientMessageId` is optional on the wire
    /// during the rollout window — older gateway builds drop the field.
    /// `createdAt` carries the authoritative server timestamp so the WS-first
    /// send path can stamp the optimistic row without waiting for the
    /// `message:new` broadcast; it is `nil` against older gateway builds.
    public struct SendMessageAck: Sendable {
        public let messageId: String
        public let clientMessageId: String?
        public let createdAt: Date?

        public init(messageId: String, clientMessageId: String?, createdAt: Date? = nil) {
            self.messageId = messageId
            self.clientMessageId = clientMessageId
            self.createdAt = createdAt
        }
    }

    /// Parses the ISO-8601 `createdAt` echoed in a send ACK, tolerating both
    /// the fractional-seconds and basic forms. Returns `nil` on any mismatch
    /// so the caller can fall back to the local send time.
    private static func parseAckDate(_ value: Any?) -> Date? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return isoFormatterWithFractional.date(from: string)
            ?? isoFormatterBasic.date(from: string)
    }

    /// Interne (plus `private`) pour que le témoin de #4823 mesure la charge
    /// RÉELLEMENT émise — pas une reconstruction du test.
    func buildAttachmentPayload(
        conversationId: String, content: String?, attachmentIds: [String],
        replyToId: String?, storyReplyToId: String? = nil, originalLanguage: String?, isEncrypted: Bool,
        clientMessageId: String, location: SharedPlace? = nil, sticker: MessageSticker? = nil
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "conversationId": conversationId,
            "content": content ?? "",
            "attachmentIds": attachmentIds,
            "isEncrypted": isEncrypted,
            "clientMessageId": clientMessageId
        ]
        if let replyToId { payload["replyToId"] = replyToId }
        if let storyReplyToId { payload["storyReplyToId"] = storyReplyToId }
        if let originalLanguage { payload["originalLanguage"] = originalLanguage }
        if let location { payload["location"] = MessageSocketManager.locationSocketPayload(location) }
        if let sticker { payload["sticker"] = MessageSocketManager.stickerSocketPayload(sticker) }
        return payload
    }

    /// Sérialise un `SharedPlace` dans la forme dictionnaire que le gateway
    /// valide (`parseSharedPlace` — coordonnées obligatoires, textes
    /// optionnels). Les champs nil sont omis plutôt qu'envoyés en `NSNull`.
    static func locationSocketPayload(_ place: SharedPlace) -> [String: Any] {
        var dict: [String: Any] = [
            "latitude": place.latitude,
            "longitude": place.longitude
        ]
        if let name = place.name { dict["name"] = name }
        if let address = place.address { dict["address"] = address }
        if let category = place.category { dict["category"] = category }
        return dict
    }

    /// Sérialise un `MessageSticker` dans la forme dictionnaire que le gateway
    /// range sous `metadata.sticker` (#4823) — les MÊMES clés que le corps
    /// REST (`SendMessageRequest.sticker`), pour que les deux transports
    /// produisent un message indiscernable. Les champs nil et les `slots`
    /// vides sont omis plutôt qu'envoyés en `NSNull` / objet vide.
    static func stickerSocketPayload(_ sticker: MessageSticker) -> [String: Any] {
        var dict: [String: Any] = [:]
        if let templateId = sticker.templateId { dict["templateId"] = templateId }
        if !sticker.slots.isEmpty { dict["slots"] = sticker.slots }
        if let animation = sticker.animation { dict["animation"] = animation.rawValue }
        if let emoji = sticker.emoji { dict["emoji"] = emoji }
        return dict
    }

    public func sendWithAttachments(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String? = nil,
        originalLanguage: String? = nil,
        isEncrypted: Bool = false,
        clientMessageId: String? = nil,
        sticker: MessageSticker? = nil
    ) {
        let cid = clientMessageId ?? ClientMessageId.generate()
        let payload = buildAttachmentPayload(
            conversationId: conversationId, content: content, attachmentIds: attachmentIds,
            replyToId: replyToId, storyReplyToId: storyReplyToId, originalLanguage: originalLanguage, isEncrypted: isEncrypted,
            clientMessageId: cid, sticker: sticker
        )
        socket?.emit("message:send-with-attachments", payload)
    }

    /// Emits `message:send-with-attachments` and awaits the gateway ACK.
    /// Returns the full `SendMessageAck` (server `messageId` + the echoed
    /// `clientMessageId` from the request) so callers can reconcile the
    /// optimistic row by `clientMessageId` rather than waiting for the
    /// targeted `message:new` broadcast. Returns `nil` on timeout / no socket
    /// / server error.
    public func sendWithAttachmentsAsync(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String? = nil,
        originalLanguage: String? = nil,
        isEncrypted: Bool = false,
        clientMessageId: String? = nil,
        location: SharedPlace? = nil,
        sticker: MessageSticker? = nil
    ) async -> SendMessageAck? {
        guard let socket else { return nil }
        let cid = clientMessageId ?? ClientMessageId.generate()
        let payload = buildAttachmentPayload(
            conversationId: conversationId, content: content, attachmentIds: attachmentIds,
            replyToId: replyToId, storyReplyToId: storyReplyToId, originalLanguage: originalLanguage, isEncrypted: isEncrypted,
            clientMessageId: cid, location: location, sticker: sticker
        )
        return await withCheckedContinuation { continuation in
            // 10s (was 30s): the gateway acks as soon as the message row is
            // created — attachments were already uploaded separately, so a
            // healthy ack lands in well under 2s. Holding the optimistic
            // bubble in `.sending` for 30s only prolonged the clock icon; on
            // timeout the caller falls through to the outbox retry loop,
            // which remains the durable safety net. Matches `sendAsync`'s
            // 10s default on the text path.
            socket.emitWithAck("message:send-with-attachments", payload).timingOut(after: 10) { items in
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool, success,
                   let data = response["data"] as? [String: Any],
                   let messageId = data["messageId"] as? String {
                    let ackCid = data["clientMessageId"] as? String ?? cid
                    continuation.resume(returning: SendMessageAck(
                        messageId: messageId,
                        clientMessageId: ackCid,
                        createdAt: MessageSocketManager.parseAckDate(data["createdAt"])
                    ))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    // MARK: - Send Text (WebSocket-first)

    /// Emits a plain-text `message:send` over the open Socket.IO connection and
    /// awaits the gateway ACK. This is the WebSocket-first send path used for
    /// regular text messages — parity with reactions / comments / status, which
    /// already travel over the socket. Carries the full message effect set
    /// (`isBlurred`, `expiresAt` for ephemeral, `effectFlags` bitfield,
    /// `isViewOnce` / `maxViewOnceCount`) at parity with the REST route.
    ///
    /// Returns the `SendMessageAck` (server `messageId`, echoed
    /// `clientMessageId`, server `createdAt`) on success, or `nil` on timeout /
    /// no socket / server error so the caller can fall back to the REST send.
    ///
    /// NOT for E2EE payloads or attachments — the `message:send` event does not
    /// transport those; the caller routes them through REST or
    /// `sendWithAttachments`.
    public func sendAsync(
        conversationId: String,
        content: String?,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        storyReplyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        messageType: String? = nil,
        isBlurred: Bool? = nil,
        expiresAt: Date? = nil,
        effectFlags: UInt32? = nil,
        isViewOnce: Bool? = nil,
        maxViewOnceCount: Int? = nil,
        clientMessageId: String? = nil,
        location: SharedPlace? = nil,
        timeoutSeconds: Double = 10
    ) async -> SendMessageAck? {
        guard let socket else { return nil }
        let cid = clientMessageId ?? ClientMessageId.generate()
        var payload: [String: Any] = [
            "conversationId": conversationId,
            "content": content ?? "",
            "clientMessageId": cid
        ]
        if let originalLanguage { payload["originalLanguage"] = originalLanguage }
        if let messageType { payload["messageType"] = messageType }
        if let replyToId { payload["replyToId"] = replyToId }
        if let storyReplyToId { payload["storyReplyToId"] = storyReplyToId }
        if let forwardedFromId { payload["forwardedFromId"] = forwardedFromId }
        if let forwardedFromConversationId { payload["forwardedFromConversationId"] = forwardedFromConversationId }
        if let isBlurred { payload["isBlurred"] = isBlurred }
        if let expiresAt { payload["expiresAt"] = MessageSocketManager.isoFormatterWithFractional.string(from: expiresAt) }
        if let effectFlags { payload["effectFlags"] = Int(effectFlags) }
        if let isViewOnce { payload["isViewOnce"] = isViewOnce }
        if let maxViewOnceCount { payload["maxViewOnceCount"] = maxViewOnceCount }
        // Lieu partagé — même clé `location` que le corps REST ; le handler
        // socket la valide via `parseSharedPlace` (MessageHandler.ts).
        if let location { payload["location"] = MessageSocketManager.locationSocketPayload(location) }
        return await withCheckedContinuation { continuation in
            socket.emitWithAck("message:send", payload).timingOut(after: timeoutSeconds) { items in
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool, success,
                   let data = response["data"] as? [String: Any],
                   let messageId = data["messageId"] as? String {
                    let ackCid = data["clientMessageId"] as? String ?? cid
                    continuation.resume(returning: SendMessageAck(
                        messageId: messageId,
                        clientMessageId: ackCid,
                        createdAt: MessageSocketManager.parseAckDate(data["createdAt"])
                    ))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    /// Chemin de repli socket pour `ConversationViewModel.sendMessage`, appelé
    /// quand le POST REST a échoué. Réémet le message sur le socket avec le
    /// MÊME `clientMessageId` : le dedup gateway `(conversationId, clientMessageId)`
    /// garantit l'absence de doublon si l'outbox rejoue le REST plus tard.
    ///
    /// Route vers `message:send-with-attachments` (média) ou `message:send`
    /// (texte). Un texte chiffré E2EE renvoie `nil` — l'event `message:send` ne
    /// transporte pas le chiffrement, on ne réémet pas un payload en clair ;
    /// ces messages restent sur le retry REST de l'outbox.
    ///
    /// `sticker` (#4823) ne voyage que sur le chemin AVEC pièces jointes : un
    /// sticker est toujours envoyé avec son PNG rendu, donc jamais par
    /// `message:send` nu.
    public func sendViaSocketFallback(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String?,
        originalLanguage: String?,
        isEncrypted: Bool,
        clientMessageId: String,
        location: SharedPlace? = nil,
        sticker: MessageSticker? = nil
    ) async -> SendMessageAck? {
        if attachmentIds.isEmpty {
            if isEncrypted { return nil }
            return await sendAsync(
                conversationId: conversationId,
                content: content,
                originalLanguage: originalLanguage,
                replyToId: replyToId,
                storyReplyToId: storyReplyToId,
                clientMessageId: clientMessageId,
                location: location
            )
        }
        return await sendWithAttachmentsAsync(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: clientMessageId,
            location: location,
            sticker: sticker
        )
    }
}
