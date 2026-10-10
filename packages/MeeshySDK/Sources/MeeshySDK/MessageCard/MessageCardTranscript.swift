import Foundation

/// **CE QUE DIT UN VOCAL, SUR UNE CARTE « IMAGINE »** (#8979) — la
/// transcription de la piste SERVIE (la piste traduite dans la langue
/// d'export quand elle existe, sinon l'original), en PHRASES minutées depuis
/// le début du son.
///
/// Les phrases sont celles du lecteur du son de contenu
/// (`AudioTranscriptCue.phrases`) : une reconnaissance qui segmente par mot ne
/// donne pas une colonne d'un mot de large. La phrase en cours se lit avec la
/// MÊME règle que lui (`AudioTranscriptCue.activeIndex`).
///
/// Une transcription sans AUCUN minutage (un texte seul, une piste traduite
/// sans segments) reçoit un minutage PROPORTIONNEL à la longueur de ses
/// phrases sur la durée du son — le karaoké avance avec la voix, comme dans la
/// bulle (`AudioPlayerView.activeSegmentIndex`, repli proportionnel).
public struct MessageCardTranscript: Equatable, Sendable {

    /// Un segment de la transcription, minuté en secondes quand on le sait.
    public struct Segment: Equatable, Sendable {
        public let text: String
        public let start: Double?
        public let end: Double?

        public init(text: String, start: Double? = nil, end: Double? = nil) {
            self.text = text
            self.start = start.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
            self.end = end.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
        }
    }

    /// Les phrases, dans l'ordre du son.
    public let cues: [AudioTranscriptCue]

    /// Les phrases d'une transcription : ses segments s'il en a, sinon son
    /// texte entier. `nil` quand il n'y a rien à lire.
    public init?(text: String?, segments: [Segment] = []) {
        let spoken = segments.filter { MessageCardText.nonBlank($0.text) != nil }
        let words: [AudioTranscriptCue]
        if !spoken.isEmpty {
            words = spoken.enumerated().map { AudioTranscriptCue(id: $0.offset, text: $0.element.text, start: $0.element.start, end: $0.element.end) }
        } else if let text = MessageCardText.nonBlank(text) {
            words = text.split(whereSeparator: \.isWhitespace).enumerated().map { AudioTranscriptCue(id: $0.offset, text: String($0.element)) }
        } else {
            return nil
        }
        let phrases = AudioTranscriptCue.phrases(from: words)
        guard !phrases.isEmpty else { return nil }
        self.cues = phrases
    }

    /// Une transcription minutée par AUCUN de ses segments ?
    public var isUntimed: Bool { cues.allSatisfy { $0.start == nil } }

    /// Les phrases MINUTÉES sur `soundDuration` : une transcription sans aucun
    /// minutage reçoit des bornes proportionnelles à la longueur de chaque
    /// phrase. Une transcription minutée — même en partie — garde les siennes.
    public func timed(over soundDuration: Double?) -> [AudioTranscriptCue] {
        guard isUntimed, let soundDuration, soundDuration.isFinite, soundDuration > 0 else { return cues }
        let weights = cues.map { Double(max(1, $0.text.count)) }
        let total = weights.reduce(0, +)
        var elapsed = 0.0
        return zip(cues, weights).map { cue, weight in
            let start = soundDuration * elapsed / total
            elapsed += weight
            return AudioTranscriptCue(id: cue.id, text: cue.text, start: start, end: soundDuration * elapsed / total)
        }
    }

    /// Les phrases qui se DISENT dans l'extrait `clip` (toutes, sans extrait) —
    /// une phrase à cheval sur un bord en fait partie. Une phrase sans minutage
    /// suit la précédente.
    public func cues(in clip: MessageCardClip?, soundDuration: Double?) -> [AudioTranscriptCue] {
        let timed = timed(over: soundDuration)
        guard let clip else { return timed }
        var previousStart = 0.0
        var kept: [AudioTranscriptCue] = []
        for (index, cue) in timed.enumerated() {
            let start = cue.start ?? previousStart
            previousStart = start
            let end = cue.end ?? timed[(index + 1)...].compactMap(\.start).first ?? soundDuration ?? .infinity
            if end > clip.start && start < clip.end { kept.append(cue) }
        }
        return kept
    }
}

// MARK: - Depuis les modèles du SDK

public extension MessageCardTranscript {

    /// La transcription de l'ORIGINAL d'une pièce jointe.
    init?(_ transcription: MeeshyMessageAttachment.EmbeddedTranscription?) {
        guard let transcription else { return nil }
        self.init(text: transcription.text, segments: (transcription.segments ?? []).map {
            Segment(text: $0.text, start: $0.startTime, end: $0.endTime)
        })
    }

    /// La transcription d'une piste TRADUITE d'une pièce jointe.
    init?(_ translation: MeeshyMessageAttachment.EmbeddedAudioTranslation) {
        self.init(text: translation.transcription, segments: (translation.segments ?? []).map {
            Segment(text: $0.text, start: $0.startTime, end: $0.endTime)
        })
    }

    /// La transcription d'un son de publication ou de commentaire.
    init?(_ transcription: MessageTranscription?) {
        guard let transcription else { return nil }
        self.init(text: transcription.text, segments: transcription.segments.map {
            Segment(text: $0.text, start: $0.startTime, end: $0.endTime)
        })
    }

    /// La transcription d'une piste traduite d'un son de publication ou de commentaire.
    init?(_ track: MessageTranslatedAudio) {
        self.init(text: track.transcription, segments: track.segments.map {
            Segment(text: $0.text, start: $0.startTime, end: $0.endTime)
        })
    }
}
