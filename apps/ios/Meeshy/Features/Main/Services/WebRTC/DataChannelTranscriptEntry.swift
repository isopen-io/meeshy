import CoreGraphics
import Foundation
import MeeshySDK

/// Entrée de journal de transcription poussée en P2P direct sur le data
/// channel `"transcription"` — miroir Swift de `CallTranscriptEntryPayload`
/// (`packages/shared/types/video-call.ts`). Transport opportuniste : le
/// relais socket `call:transcription-segment` reste émis en parallèle (il
/// porte la traduction ZMQ et le fallback quand le channel n'est pas ouvert
/// — ex. pair web offreur qui ne crée pas de canal) ; le récepteur fusionne
/// les deux arrivées par `id`. `speakerDisplayName` est déclaratif ici (pas
/// de serveur pour l'estampiller) : les récepteurs préfèrent le nom résolu
/// localement depuis leur roster et ne s'en servent qu'en fallback.
nonisolated struct DataChannelTranscriptEntry: Codable, Sendable, Equatable {
    let id: String
    let callId: String
    let speakerId: String
    let speakerDisplayName: String
    let text: String
    /// Tag automatique de la langue de transcription — prépare la traduction
    /// live + resynthèse TTS de l'étape suivante.
    let language: String
    /// Horloge murale de capture (epoch ms) — clé d'ordre du journal
    /// `displayName (heure): message`.
    let capturedAtMs: Int
    let isFinal: Bool
    let confidence: Double
}
