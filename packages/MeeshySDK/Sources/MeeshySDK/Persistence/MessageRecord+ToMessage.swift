import Foundation

extension MessageRecord {

    /// Converts a persistence row to the domain `MeeshyMessage` used by ViewModels and Views.
    ///
    /// JSON blob columns (reactionsJson, attachmentsJson, replyToJson) are decoded when present.
    /// Fields that carry rich relational data in the API path (sender details, forward context)
    /// are populated from the denormalised columns stored on the record.
    public func toMessage(currentUserId: String) -> MeeshyMessage {
        let msgType: MeeshyMessage.MessageType = {
            switch messageType.lowercased() {
            case "image": return .image
            case "file": return .file
            case "audio": return .audio
            case "video": return .video
            case "location": return .location
            default: return .text
            }
        }()

        let msgSource: MeeshyMessage.MessageSource = {
            switch messageSource.lowercased() {
            case "system": return .system
            case "ads": return .ads
            case "app": return .app
            case "agent": return .agent
            case "authority": return .authority
            default: return .user
            }
        }()

        // Un seul JSONDecoder reutilise pour toutes les colonnes JSON de cette
        // ligne. toMessage() est appele PAR MESSAGE au chargement d'une
        // conversation ; reutiliser l'instance evite jusqu'a 5 allocations de
        // decoder par message. Tous les blobs sont en config par defaut (aucune
        // strategie date/cle custom), donc l'instance partagee est byte-identique
        // a l'ancien code (et l'usage reste sequentiel mono-thread).
        let decoder = JSONDecoder()

        let uiAttachments: [MeeshyMessageAttachment]
        if let data = attachmentsJson,
           let decoded = try? decoder.decode([MeeshyMessageAttachment].self, from: data) {
            uiAttachments = decoded
        } else {
            uiAttachments = []
        }

        let uiReactions: [MeeshyReaction]
        if let data = reactionsJson,
           let decoded = try? decoder.decode([MeeshyReaction].self, from: data) {
            uiReactions = decoded
        } else {
            uiReactions = []
        }

        let uiReplyTo: ReplyReference?
        if let data = replyToJson,
           let decoded = try? decoder.decode(ReplyReference.self, from: data) {
            uiReplyTo = decoded
        } else {
            uiReplyTo = nil
        }

        let uiForwardedFrom: ForwardReference?
        if let data = forwardedFromJson,
           let decoded = try? decoder.decode(ForwardReference.self, from: data) {
            uiForwardedFrom = decoded
        } else {
            uiForwardedFrom = nil
        }

        let uiCallSummary: CallSummaryMetadata?
        if let data = callSummaryJson,
           let decoded = try? decoder.decode(CallSummaryMetadata.self, from: data) {
            uiCallSummary = decoded
        } else {
            uiCallSummary = nil
        }

        var effects = MessageEffects.none
        if effectFlags > 0 {
            effects.flags = MessageEffectFlags(rawValue: effectFlags)
        }

        let deliveryStatus: MeeshyMessage.DeliveryStatus = {
            // Server-driven counters take priority — they're the source of
            // truth for "the recipient(s) have actually received / read".
            if readCount > 0 || readByAllAt != nil { return .read }
            if deliveredCount > 0 || deliveredToAllAt != nil { return .delivered }
            // State-machine driven fallback. The state machine flips
            // .sent → .delivered on `.delivered(count, at)` events but
            // doesn't propagate the count onto the record's
            // `deliveredCount` column, so without recognising
            // `state == .delivered` here the bubble would silently
            // regress to .sent (single check) and the user would never
            // see the double check (✓✓). Same goes for `state == .read`.
            switch state {
            case .sending: return .sending
            // A row that has fallen back to the durable outbox (a failed or
            // timed-out attempt that still has retries left) is genuinely
            // struggling — surface the distinct "slow connection" affordance
            // (warning clock + "Envoi lent") instead of an identical fresh-send
            // clock, so the user can tell a retrying message from one that just
            // left. Offline still takes precedence (hourglass) via
            // BubbleDeliveryCheck's `isOffline` gate.
            case .queued: return .slow
            case .failed: return .failed
            case .delivered: return .delivered
            case .read: return .read
            default: return .sent
            }
        }()

        let resolvedColor = senderName.map { DynamicColorGenerator.colorForName($0) }

        return MeeshyMessage(
            id: serverId ?? localId,
            conversationId: conversationId,
            senderId: senderId,
            content: content ?? "",
            originalLanguage: originalLanguage,
            messageType: msgType,
            messageSource: msgSource,
            isEdited: isEdited,
            editedAt: editedAt,
            deletedAt: deletedAt,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            expiresAt: expiresAt,
            effects: effects,
            maxViewOnceCount: maxViewOnceCount,
            viewOnceCount: viewOnceCount,
            pinnedAt: pinnedAt,
            pinnedBy: pinnedBy,
            isEncrypted: isEncrypted,
            encryptionMode: encryptionMode,
            createdAt: createdAt,
            updatedAt: updatedAt,
            attachments: uiAttachments,
            reactions: uiReactions,
            replyTo: uiReplyTo,
            forwardedFrom: uiForwardedFrom,
            senderName: senderName,
            senderUsername: senderUsername,
            senderColor: resolvedColor ?? senderColor,
            senderAvatarURL: senderAvatarURL,
            senderUserId: senderId == currentUserId ? currentUserId : nil,
            deliveryStatus: deliveryStatus,
            isMe: senderId == currentUserId,
            deliveredToAllAt: deliveredToAllAt,
            readByAllAt: readByAllAt,
            deliveredCount: deliveredCount,
            readCount: readCount,
            recipientCount: recipientCount,
            cachedTimeString: cachedTimeString,
            callSummary: uiCallSummary
        )
    }
}
