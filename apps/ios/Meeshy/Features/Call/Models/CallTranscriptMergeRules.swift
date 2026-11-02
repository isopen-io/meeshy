import Foundation

enum CallTranscriptMergeRules {
    /// Fusion d'un même énoncé (`wireId` partagé) à travers ses révisions et
    /// ses transports — miroir de `mergeEntries` dans
    /// `packages/shared/utils/call-transcript.ts` :
    /// 1. existant PARTIEL → la révision entrante REMPLACE le texte (stream
    ///    de corrections du moteur de l'auteur) ; le final clôt par ce chemin ;
    /// 2. existant FINAL + entrant partiel → révision périmée en retard
    ///    (aucun ordre garanti entre les deux transports), ignorée ;
    /// 3. final + final (data channel puis relais traduit) → le texte
    ///    original est conservé, traduction/nom manquant viennent enrichir.
    /// Dans tous les cas `capturedAt` garde la valeur la plus ancienne (le
    /// début de l'énoncé — l'heure de capture réelle, jamais la réception).
    static func merged(
        existing: CallTranscriptionSegment, incoming: CallTranscriptionSegment
    ) -> CallTranscriptionSegment {
        let displayName = existing.speakerDisplayName ?? incoming.speakerDisplayName
        let capturedAt = min(existing.capturedAt, incoming.capturedAt)
        if !existing.isFinal {
            return CallTranscriptionSegment(
                id: existing.id,
                wireId: existing.wireId,
                text: incoming.text,
                speakerId: existing.speakerId,
                speakerDisplayName: displayName,
                startTime: incoming.startTime,
                endTime: incoming.endTime,
                isFinal: incoming.isFinal,
                confidence: incoming.confidence,
                language: incoming.language,
                translatedText: incoming.translatedText ?? existing.translatedText,
                translatedLanguage: incoming.translatedLanguage ?? existing.translatedLanguage,
                capturedAt: capturedAt
            )
        }
        guard incoming.isFinal else {
            return CallTranscriptionSegment(
                id: existing.id,
                wireId: existing.wireId,
                text: existing.text,
                speakerId: existing.speakerId,
                speakerDisplayName: displayName,
                startTime: existing.startTime,
                endTime: existing.endTime,
                isFinal: true,
                confidence: existing.confidence,
                language: existing.language,
                translatedText: existing.translatedText,
                translatedLanguage: existing.translatedLanguage,
                capturedAt: capturedAt
            )
        }
        return CallTranscriptionSegment(
            id: existing.id,
            wireId: existing.wireId,
            text: existing.text,
            speakerId: existing.speakerId,
            speakerDisplayName: displayName,
            startTime: existing.startTime,
            endTime: existing.endTime,
            isFinal: true,
            confidence: existing.confidence,
            language: existing.language,
            translatedText: incoming.translatedText ?? existing.translatedText,
            translatedLanguage: incoming.translatedLanguage ?? existing.translatedLanguage,
            capturedAt: capturedAt
        )
    }
}
