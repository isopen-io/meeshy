import Foundation

struct CallTranscriptionSegment: Identifiable, Equatable {
    let id: UUID
    /// Identifiant de journal stable, partagé entre transports : minté à la
    /// capture par le device du locuteur, il voyage sur le data channel
    /// WebRTC ET dans `call:transcription-segment` → `call:translated-segment`.
    /// C'est la clé de fusion (`upsertRemoteSegment`) qui évite de dupliquer
    /// une ligne quand le même segment arrive par les deux chemins. `nil`
    /// pour les segments d'anciens pairs/gateways qui ne l'émettent pas.
    let wireId: String?
    let text: String
    let speakerId: String
    /// Nom d'affichage du locuteur tel que transporté par le wire — estampillé
    /// par le gateway sur le chemin socket (anti-usurpation), déclaratif sur
    /// le data channel. L'affichage préfère TOUJOURS le nom résolu localement
    /// depuis le roster de l'appel ; ce champ n'est qu'un fallback.
    let speakerDisplayName: String?
    let startTime: TimeInterval
    let endTime: TimeInterval
    let isFinal: Bool
    let confidence: Double
    let language: String
    let translatedText: String?
    let translatedLanguage: String?
    /// Wall-clock capture time — LOCAL segments stamp it when the ASR result
    /// arrives; REMOTE segments carry the SPEAKER's wall clock (`capturedAtMs`
    /// on both transports, see `CallTranscriptionSegmentFactory`), the local
    /// receipt `Date()` surviving only for gateways older than the field. It
    /// sorts and dates the line and never measures a delay on this device
    /// (#20319 — see `receivedAtMonotonic`). Used for chronological
    /// ordering and for the "since call start" timestamp shown per row —
    /// `startTime`/`endTime` are ASR-buffer-relative (they reset every time
    /// `CallTranscriptionService.rotateRecognitionRequest` rotates the
    /// recognition request) and are unsuitable for either. No default: every
    /// call site must decide this deliberately rather than inherit a stale
    /// `Date()` evaluated at type-definition time.
    let capturedAt: Date
    /// #20319 — THIS device's monotonic clock (`CallMonotonicClock.seconds`)
    /// at the LOCAL reception of a remote utterance, stamped by
    /// `CallTranscriptionService` alone. The wait for its translation runs from
    /// it, so a skew of the speaker's wall clock neither freezes the dots nor
    /// removes them. Local only: never on the wire, never persisted
    /// (`resetForCallEnd` maps fields one by one); `nil` when nothing stamped it.
    private(set) var receivedAtMonotonic: TimeInterval?

    init(
        id: UUID,
        wireId: String? = nil,
        text: String,
        speakerId: String,
        speakerDisplayName: String? = nil,
        startTime: TimeInterval,
        endTime: TimeInterval,
        isFinal: Bool,
        confidence: Double,
        language: String,
        translatedText: String? = nil,
        translatedLanguage: String? = nil,
        capturedAt: Date,
        receivedAtMonotonic: TimeInterval? = nil
    ) {
        self.id = id
        self.wireId = wireId
        self.text = text
        self.speakerId = speakerId
        self.speakerDisplayName = speakerDisplayName
        self.startTime = startTime
        self.endTime = endTime
        self.isFinal = isFinal
        self.confidence = confidence
        self.language = language
        self.translatedText = translatedText
        self.translatedLanguage = translatedLanguage
        self.capturedAt = capturedAt
        self.receivedAtMonotonic = receivedAtMonotonic
    }

    func received(at instant: TimeInterval) -> CallTranscriptionSegment {
        var given = self
        given.receivedAtMonotonic = instant
        return given
    }
}
