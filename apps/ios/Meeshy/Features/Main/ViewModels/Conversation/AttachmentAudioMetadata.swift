import Foundation
import MeeshySDK

nonisolated struct AttachmentAudioEntry: Equatable, Sendable {
    let messageId: String
    let attachmentId: String
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]

    var isEmpty: Bool { transcription == nil && translatedAudios.isEmpty }
}

nonisolated struct AttachmentAudioState: Equatable, Sendable {
    var transcriptions: [String: MessageTranscription] = [:]
    var transcriptionsByAttachment: [String: MessageTranscription] = [:]
    var translatedAudios: [String: [MessageTranslatedAudio]] = [:]
    var translatedAudiosByAttachment: [String: [MessageTranslatedAudio]] = [:]
}

nonisolated enum AttachmentAudioMetadata {

    static func entries(fromAPI messages: [APIMessage]) -> [AttachmentAudioEntry] {
        messages.flatMap { message in
            (message.attachments ?? []).map { attachment in
                entry(
                    from: attachment,
                    messageId: message.id,
                    transcriptionText: { $0.resolvedText }
                )
            }
        }
        .filter { !$0.isEmpty }
    }

    static func entry(fromSocket attachment: APIMessageAttachment, messageId: String) -> AttachmentAudioEntry {
        entry(
            from: attachment,
            messageId: messageId,
            transcriptionText: { $0.transcribedText ?? $0.text ?? "" }
        )
    }

    static func entries(fromRecords records: [MessageRecord]) -> [AttachmentAudioEntry] {
        let decoder = JSONDecoder()
        return records.flatMap { record -> [AttachmentAudioEntry] in
            guard let data = record.attachmentsJson,
                  let attachments = try? decoder.decode([MeeshyMessageAttachment].self, from: data)
            else { return [] }
            let messageId = record.serverId ?? record.localId
            return attachments.map { entry(from: $0, messageId: messageId) }
        }
        .filter { !$0.isEmpty }
    }

    static func merged(
        _ entries: [AttachmentAudioEntry],
        into state: AttachmentAudioState,
        forceOverwrite: Bool
    ) -> AttachmentAudioState {
        var result = state
        for entry in entries {
            if let transcription = entry.transcription {
                if forceOverwrite || result.transcriptions[entry.messageId] == nil {
                    result.transcriptions[entry.messageId] = transcription
                }
                if forceOverwrite || result.transcriptionsByAttachment[entry.attachmentId] == nil {
                    result.transcriptionsByAttachment[entry.attachmentId] = transcription
                }
            }
            if !entry.translatedAudios.isEmpty {
                if forceOverwrite || result.translatedAudios[entry.messageId] == nil {
                    result.translatedAudios[entry.messageId] = entry.translatedAudios
                }
                if forceOverwrite || result.translatedAudiosByAttachment[entry.attachmentId] == nil {
                    result.translatedAudiosByAttachment[entry.attachmentId] = entry.translatedAudios
                }
            }
        }
        return result
    }

    private static func entry(
        from attachment: APIMessageAttachment,
        messageId: String,
        transcriptionText: (APIAttachmentTranscription) -> String
    ) -> AttachmentAudioEntry {
        let transcription = attachment.transcription.map { t in
            MessageTranscription(
                attachmentId: attachment.id,
                text: transcriptionText(t),
                language: t.language ?? "?",
                confidence: t.confidence,
                durationMs: t.durationMs,
                segments: (t.segments ?? []).map(MessageTranscriptionSegment.init),
                speakerCount: t.speakerCount
            )
        }
        let audios = (attachment.translations ?? [:]).compactMap { language, translation -> MessageTranslatedAudio? in
            guard let url = translation.url, !url.isEmpty else { return nil }
            return MessageTranslatedAudio(
                attachmentId: attachment.id,
                language: language,
                url: url,
                transcription: translation.transcription,
                durationMs: translation.durationMs,
                format: translation.format,
                cloned: translation.cloned,
                quality: translation.quality,
                voiceModelId: translation.voiceModelId,
                ttsModel: translation.ttsModel,
                segments: (translation.segments ?? []).map(MessageTranscriptionSegment.init)
            )
        }
        return AttachmentAudioEntry(
            messageId: messageId, attachmentId: attachment.id, transcription: transcription, translatedAudios: audios
        )
    }

    private static func entry(from attachment: MeeshyMessageAttachment, messageId: String) -> AttachmentAudioEntry {
        let transcription = attachment.transcription.map { t in
            MessageTranscription(
                attachmentId: attachment.id,
                text: t.text,
                language: t.language,
                confidence: t.confidence,
                durationMs: t.durationMs,
                segments: (t.segments ?? []).map(MessageTranscriptionSegment.init),
                speakerCount: t.speakerCount
            )
        }
        let audios = (attachment.audioTranslations ?? [:]).map { language, translation in
            MessageTranslatedAudio(
                attachmentId: attachment.id,
                language: language,
                url: translation.url,
                transcription: translation.transcription,
                durationMs: translation.durationMs,
                format: translation.format,
                cloned: translation.cloned,
                quality: translation.quality,
                voiceModelId: translation.voiceModelId,
                ttsModel: translation.ttsModel,
                segments: (translation.segments ?? []).map(MessageTranscriptionSegment.init)
            )
        }
        return AttachmentAudioEntry(
            messageId: messageId, attachmentId: attachment.id, transcription: transcription, translatedAudios: audios
        )
    }
}
