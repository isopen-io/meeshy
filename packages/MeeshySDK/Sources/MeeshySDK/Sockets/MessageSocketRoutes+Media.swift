import Combine

extension MessageSocketRoutes {

    static func media(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.audioTranscriptionReady, TranscriptionReadyEvent.self) { $0.transcriptionReady.send($1) },
            m.route(.audioTranslationReady, AudioTranslationEvent.self) { $0.audioTranslationReady.send($1) },
            m.route(.audioTranslationsProgressive, AudioTranslationEvent.self) { $0.audioTranslationProgressive.send($1) },
            m.route(.audioTranslationsCompleted, AudioTranslationEvent.self) { $0.audioTranslationCompleted.send($1) },
            m.route(.translationFailed, TranslationFailedEvent.self) { $0.translationFailed.send($1) },
            m.route(.audioTranslationFailed, AudioTranslationFailedEvent.self) { $0.audioTranslationFailed.send($1) },
            m.route(.audioTranscriptionFailed, TranscriptionFailedEvent.self) { $0.transcriptionFailed.send($1) },
        ]
    }
}
