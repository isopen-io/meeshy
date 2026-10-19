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
    /// arrives, REMOTE segments stamp it on socket receipt (see
    /// `CallManager.makeTranscriptionSegment`). Used for chronological
    /// ordering and for the "since call start" timestamp shown per row —
    /// `startTime`/`endTime` are ASR-buffer-relative (they reset every time
    /// `CallTranscriptionService.rotateRecognitionRequest` rotates the
    /// recognition request) and are unsuitable for either. No default: every
    /// call site must decide this deliberately rather than inherit a stale
    /// `Date()` evaluated at type-definition time.
    let capturedAt: Date

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
        capturedAt: Date
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
    }
}
