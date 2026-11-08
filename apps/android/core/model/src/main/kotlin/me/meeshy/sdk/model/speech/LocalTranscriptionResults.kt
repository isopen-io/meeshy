package me.meeshy.sdk.model.speech

import me.meeshy.sdk.model.media.TusTranscription
import me.meeshy.sdk.model.media.TusTranscriptionSegment

/**
 * Les transcriptions locales d'un vocal, retenues par identifiant de pièce le temps que l'envoi les pose sur la bulle
 * optimiste puis les fasse suivre vers l'id serveur (iOS `VoiceNoteLocalTranscriber.results`). Valeur immuable : borne
 * [CAP] — un vocal enregistré puis retiré du tiroir n'a pas de site qui l'oublie, la borne l'empêche de rester pour toujours.
 */
public class LocalTranscriptionResults private constructor(private val ordered: List<Pair<String, TusTranscription>>) {
    public val entries: Map<String, TusTranscription> get() = ordered.toMap()

    public operator fun get(attachmentId: String): TusTranscription? = ordered.firstOrNull { it.first == attachmentId }?.second

    public fun with(attachmentId: String, transcription: TusTranscription): LocalTranscriptionResults =
        LocalTranscriptionResults((ordered.filterNot { it.first == attachmentId } + (attachmentId to transcription)).takeLast(CAP))

    public fun without(attachmentId: String): LocalTranscriptionResults =
        LocalTranscriptionResults(ordered.filterNot { it.first == attachmentId })

    /** La même transcription sous l'identifiant SERVEUR : la bulle réconciliée la lit sous cet id-là, plus sous l'id local. */
    public fun rekeyed(localId: String, serverId: String): LocalTranscriptionResults {
        val moved = get(localId) ?: return this
        return without(localId).with(serverId, moved)
    }

    public companion object {
        public const val CAP: Int = 8

        public val Empty: LocalTranscriptionResults = LocalTranscriptionResults(emptyList())
    }
}

/** Du résultat du moteur à ce qui voyage avec l'upload et se pose sur la bulle (iOS `messageTranscription(from:)`). */
public object LocalTranscriptionMapping {
    /**
     * La langue posée est celle du composeur (code court, ex. `fr`), jamais la balise du moteur (`fr-FR`) ; un texte vide
     * n'est pas une transcription ; un segment sans durée ne dit rien au karaoké.
     */
    public fun toTus(result: OnDeviceTranscription, languageCode: String, durationMs: Int?): TusTranscription? {
        val text = result.text.trim()
        if (text.isEmpty()) return null
        val segments = result.segments
            .filter { it.durationMs > 0 }
            .map { TusTranscriptionSegment(it.text, it.startMs.toInt(), it.endMs.toInt()) }
        return TusTranscription(
            text = text,
            language = languageCode,
            confidence = result.confidence,
            durationMs = durationMs,
            segments = segments.ifEmpty { null },
        )
    }
}
