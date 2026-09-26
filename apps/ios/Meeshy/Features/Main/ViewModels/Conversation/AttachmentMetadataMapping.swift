import MeeshySDK

// Site UNIQUE du mapping segment / piste traduite que quatre hydrateurs
// recopiaient à l'identique (ConversationViewModel+InitialLoad — chemin
// GRDB —, +SocketDelegate, +Translations — REST/socket —, et
// ConversationSocketHandler+MediaEvents — transcription/traduction audio
// finalisées). Un défaut de valeur par défaut (« mp3 », « xtts », 0, false)
// changé à un endroit divergeait silencieusement des trois autres (G002/
// L16-38).
//
// Les deux initialiseurs sont `nonisolated` : ce sont des transformations
// pures (aucun état, aucun accès MainActor), et l'app comme le SDK
// compilent sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` — sans
// l'annotation, l'usage en référence de fonction nue
// (`.map(MessageTranscriptionSegment.init)`) hériterait d'une isolation
// qu'aucun des deux types n'a besoin de porter.

extension MessageTranscriptionSegment {
    /// Segment reçu par REST ou socket (type SDK, QUALIFIÉ : l'app déclare
    /// son propre `TranscriptionSegment` d'appel, `CallTranscriptionService.swift`).
    nonisolated init(_ s: MeeshySDK.TranscriptionSegment) {
        self.init(text: s.text, startTime: s.startTime, endTime: s.endTime, speakerId: s.speakerId)
    }

    /// Segment relu depuis GRDB (`attachmentsJson`).
    nonisolated init(_ s: MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData) {
        self.init(text: s.text, startTime: s.startTime, endTime: s.endTime, speakerId: s.speakerId)
    }
}

extension MessageTranslatedAudio {
    /// Piste traduite d'une pièce jointe — site UNIQUE des défauts
    /// (« mp3 », « xtts », 0, false) que trois hydrateurs recopiaient.
    nonisolated init(
        attachmentId: String, language: String, url: String, transcription: String?,
        durationMs: Int?, format: String?, cloned: Bool?, quality: Double?,
        voiceModelId: String?, ttsModel: String?, segments: [MessageTranscriptionSegment]
    ) {
        self.init(
            id: "\(attachmentId)_\(language)", attachmentId: attachmentId, targetLanguage: language,
            url: url, transcription: transcription ?? "", durationMs: durationMs ?? 0,
            format: format ?? "mp3", cloned: cloned ?? false, quality: quality ?? 0,
            voiceModelId: voiceModelId, ttsModel: ttsModel ?? "xtts", segments: segments
        )
    }
}
