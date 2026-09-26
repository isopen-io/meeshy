import Foundation
import MeeshySDK

// Les deux fabriques pures du journal de sous-titres, sorties de
// `CallManager.swift` (hors budget de taille) pour payer l'ajout du partage
// d'écran (#8063). Statiques, sans état : elles se lisent et se testent sans
// `CallManager`.

extension CallManager {
    /// Maps a gateway-translated segment into the local `TranscriptionSegment` model.
    /// `text` ALWAYS carries the ORIGINAL (untranslated) text — never overwritten by
    /// `translatedText` — so the UI can offer an original/translated toggle
    /// (`docs/superpowers/specs/2026-07-11-call-captions-multispeaker-design.md`).
    /// `static` and testable without standing up a full `CallManager` + mock
    /// socket — the only non-deterministic input is `capturedAt` (wall clock
    /// at receipt, used for ordering + the "since call start" timestamp
    /// shown per row; `startMs`/`endMs` are the ORIGINATING device's
    /// ASR-buffer-relative timings and unsuitable for either — see
    /// `TranscriptionSegment.capturedAt` doc comment).
    static func makeTranscriptionSegment(from event: CallTranslatedSegmentData) -> TranscriptionSegment {
        let seg = event.segment
        // `capturedAtMs` (horloge murale de capture, estampillée par le device
        // du locuteur ou à défaut par le gateway à réception) est la clé
        // d'ordre du journal — le fallback `Date()` (heure de réception
        // locale) ne subsiste que pour les gateways antérieurs au champ.
        let capturedAt = seg.capturedAtMs.map { Date(timeIntervalSince1970: Double($0) / 1000) } ?? Date()
        return TranscriptionSegment(
            id: UUID(),
            wireId: seg.id,
            text: seg.text,
            speakerId: seg.speakerId,
            speakerDisplayName: seg.speakerDisplayName,
            startTime: Double(seg.startMs) / 1000,
            endTime: Double(seg.endMs) / 1000,
            isFinal: seg.isFinal,
            confidence: seg.confidence,
            // Tag de langue du Prisme : la langue dans laquelle le segment a
            // été TRANSCRIT (sourceLanguage), jamais la langue cible — la
            // traduction porte la sienne dans `translatedLanguage`.
            language: seg.sourceLanguage,
            translatedText: seg.translatedText,
            translatedLanguage: seg.translatedText != nil ? seg.targetLanguage : nil,
            capturedAt: capturedAt
        )
    }

    /// Entrée de journal arrivée en P2P direct par le data channel WebRTC —
    /// miroir de `makeTranscriptionSegment` pour l'autre transport. Pas de
    /// bornes ASR sur ce chemin (`startMs`/`endMs` sont de toute façon
    /// buffer-relatifs et inutilisables pour l'ordre) : `capturedAtMs` est la
    /// seule horloge, et `wireId` la clé de fusion avec le relais serveur
    /// traduit qui suit.
    static func makeTranscriptionSegment(from entry: DataChannelTranscriptEntry) -> TranscriptionSegment {
        TranscriptionSegment(
            id: UUID(),
            wireId: entry.id,
            text: entry.text,
            speakerId: entry.speakerId,
            speakerDisplayName: entry.speakerDisplayName.isEmpty ? nil : entry.speakerDisplayName,
            startTime: 0,
            endTime: 0,
            isFinal: entry.isFinal,
            confidence: entry.confidence,
            language: entry.language,
            capturedAt: Date(timeIntervalSince1970: Double(entry.capturedAtMs) / 1000)
        )
    }
}
