import Foundation
import MeeshySDK

@MainActor
protocol AttachmentSendHosting: AnyObject {
    var conversationId: String { get }
    var messageTranscriptions: [String: MessageTranscription] { get set }
    var messageTranscriptionsByAttachment: [String: MessageTranscription] { get set }
    func send(_ outgoing: OutgoingMessage) async -> Result<SentMessageReceipt, SendFailure>
    func recordSendFailure(tempId: String, error: any Error) async
    func markOptimisticMediaFailed(tempId: String, reason: String) async
    /// Non nul dans une conversation chiffrée de bout en bout : aucune pièce EN
    /// CLAIR ne s'y téléverse (#11379), ni lieu ni sticker.
    var endToEndPieceRefusal: EndToEndSendRefusal? { get }
    /// Vrai dans une conversation chiffrée de bout en bout : les pièces partent
    /// chiffrées sur l'appareil, et seulement ainsi (#10789).
    var endToEndSealsPieces: Bool { get }
    /// Ce qui interdit tout envoi chiffré de cette conversation, AVANT de
    /// chiffrer une pièce (groupe, pair inconnu) ; `nil` si l'envoi peut partir.
    var endToEndRecipientRefusal: EndToEndSendRefusal? { get }
}

enum LocalTranscriptionPlacement {

    /// Pose les transcriptions locales sur la bulle `tempId`, par pièce ET par message
    /// (le chemin mono-audio lit `messageTranscriptions[msg.id]`). Idempotent.
    static func place(_ transcriptions: [MessageTranscription], tempId: String, on host: any AttachmentSendHosting) {
        guard let first = transcriptions.first else { return }
        for transcription in transcriptions {
            host.messageTranscriptionsByAttachment[transcription.attachmentId] = transcription
        }
        host.messageTranscriptions[tempId] = first
    }
}
