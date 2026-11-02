import Foundation

extension APIMessageUpsert {

    static func attachmentsJson(for api: APIMessage, senderName: String?, encoder: JSONEncoder) -> Data? {
        guard let attachments = api.attachments, !attachments.isEmpty else { return nil }
        let thumbColor = senderName.map { DynamicColorGenerator.colorForName($0) }
            ?? DynamicColorGenerator.colorForName("?")
        let projected = attachments.map { attachment(from: $0, api: api, thumbColor: thumbColor) }
        return encoder.encodeOrLog(projected, field: "attachmentsJson", id: api.id)
    }

    static func attachment(
        from apiAtt: APIMessageAttachment,
        api: APIMessage,
        thumbColor: String
    ) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: apiAtt.id,
            fileName: apiAtt.fileName ?? "",
            originalName: apiAtt.originalName ?? "",
            mimeType: apiAtt.mimeType ?? "application/octet-stream",
            fileSize: apiAtt.fileSize ?? 0,
            fileUrl: apiAtt.fileUrl ?? "",
            alt: apiAtt.alt,
            forwardedFromAttachmentId: apiAtt.forwardedFromAttachmentId,
            isForwarded: apiAtt.isForwarded == true,
            capturedInApp: apiAtt.capturedInApp == true,
            isViewOnce: apiAtt.isViewOnce == true,
            maxViewOnceCount: apiAtt.maxViewOnceCount,
            viewOnceCount: apiAtt.viewOnceCount ?? 0,
            isBlurred: apiAtt.isBlurred == true,
            effectFlags: apiAtt.effectFlags,
            width: apiAtt.width,
            height: apiAtt.height,
            thumbnailUrl: apiAtt.thumbnailUrl,
            thumbHash: apiAtt.thumbHash,
            duration: apiAtt.duration,
            uploadedBy: api.senderId,
            isEncrypted: apiAtt.isEncrypted == true,
            encryptionMode: apiAtt.encryptionMode,
            latitude: apiAtt.latitude,
            longitude: apiAtt.longitude,
            thumbnailColor: thumbColor,
            transcription: embeddedTranscription(apiAtt),
            audioTranslations: embeddedAudioTranslations(apiAtt),
            reactionSummary: apiAtt.reactionSummary,
            currentUserReactions: apiAtt.currentUserReactions,
            deliveredToAllAt: apiAtt.deliveredToAllAt,
            viewedByAllAt: apiAtt.viewedByAllAt,
            downloadedByAllAt: apiAtt.downloadedByAllAt,
            listenedByAllAt: apiAtt.listenedByAllAt,
            watchedByAllAt: apiAtt.watchedByAllAt,
            viewedCount: apiAtt.viewedCount,
            downloadedCount: apiAtt.downloadedCount,
            consumedCount: apiAtt.consumedCount,
            altLanguage: apiAtt.altLanguage,
            altTranslations: apiAtt.altTranslations
        )
    }

    static func embeddedTranscription(_ apiAtt: APIMessageAttachment) -> MeeshyMessageAttachment.EmbeddedTranscription? {
        apiAtt.transcription.flatMap { t in
            guard let text = t.text ?? t.transcribedText, !text.isEmpty else { return nil }
            return .init(
                text: text,
                language: t.language ?? "unknown",
                confidence: t.confidence,
                durationMs: t.durationMs,
                speakerCount: t.speakerCount,
                segments: t.segments?.map { s in
                    .init(text: s.text, startTime: s.startTime, endTime: s.endTime, speakerId: s.speakerId)
                }
            )
        }
    }

    static func embeddedAudioTranslations(
        _ apiAtt: APIMessageAttachment
    ) -> [String: MeeshyMessageAttachment.EmbeddedAudioTranslation]? {
        apiAtt.translations.flatMap { dict in
            let mapped: [String: MeeshyMessageAttachment.EmbeddedAudioTranslation] = dict.compactMapValues { t in
                guard let url = t.url, !url.isEmpty else { return nil }
                return .init(
                    url: url,
                    transcription: t.transcription,
                    durationMs: t.durationMs,
                    format: t.format,
                    cloned: t.cloned,
                    quality: t.quality,
                    voiceModelId: t.voiceModelId,
                    ttsModel: t.ttsModel,
                    segments: t.segments?.map { s in
                        .init(text: s.text, startTime: s.startTime, endTime: s.endTime, speakerId: s.speakerId)
                    }
                )
            }
            return mapped.isEmpty ? nil : mapped
        }
    }

    static func forwardedFromJson(for api: APIMessage, encoder: JSONEncoder) -> Data? {
        api.forwardedFrom.flatMap { fwd in
            let firstAtt = fwd.attachments?.first
            let ref = ForwardReference(
                originalMessageId: fwd.id,
                senderName: fwd.sender?.name ?? "?",
                senderAvatar: fwd.sender?.resolvedAvatar,
                previewText: fwd.content ?? "",
                conversationId: api.forwardedFromConversation?.id,
                conversationName: api.forwardedFromConversation?.title
                    ?? api.forwardedFromConversation?.identifier,
                attachmentType: firstAtt?.mimeType,
                attachmentThumbnailUrl: firstAtt?.thumbnailUrl,
                conversationType: api.forwardedFromConversation?.type, senderUserId: fwd.sender?.resolvedUserId
            )
            return encoder.encodeOrLog(ref, field: "forwardedFromJson", id: api.id)
        }
    }
}
