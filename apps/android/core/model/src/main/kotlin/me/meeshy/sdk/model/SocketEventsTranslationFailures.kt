package me.meeshy.sdk.model

/** Ce qui a échoué pour un message : sa traduction de texte, la traduction d'une piste audio, ou sa transcription. */
public enum class TranslationFailureKind { TEXT_TRANSLATION, AUDIO_TRANSLATION, TRANSCRIPTION }

/**
 * Un échec porté par un message (et une pièce audio, ou une langue, quand l'événement les nomme). Il ne
 * porte JAMAIS de contenu de message : seulement le motif annoncé par la passerelle.
 */
public data class TranslationFailureEntry(
    val messageId: String,
    val kind: TranslationFailureKind,
    /** La pièce audio concernée ; `null` pour une traduction de texte. */
    val attachmentId: String? = null,
    /** La langue demandée quand l'événement la dit ; `null` = toutes (`translation:failed` ne la nomme pas). */
    val language: String? = null,
    val error: String? = null,
    val errorCode: String? = null,
) {
    /** La clé unique d'un échec : un second échec du même objet remplace le premier. */
    public val key: String get() = listOf(kind.name, messageId, attachmentId.orEmpty(), language.orEmpty()).joinToString("|")
}

/**
 * Le registre des échecs de traduction, par message et par langue. Un succès (traduction reçue, transcription
 * prête, piste audio prête) EFFACE l'échec qu'il dément : la bulle ne garde jamais l'icône d'alerte d'une
 * demande qui a fini par aboutir. Immuable, donc rejouable (idempotent) dans l'ordre d'arrivée.
 */
public data class TranslationFailureLedger(val entries: Map<String, TranslationFailureEntry> = emptyMap()) {

    public fun failed(entry: TranslationFailureEntry): TranslationFailureLedger =
        TranslationFailureLedger(entries + (entry.key to entry))

    /** Une traduction de texte est arrivée : l'échec de CETTE langue, et l'échec sans langue du message, tombent. */
    public fun textTranslated(messageId: String, language: String): TranslationFailureLedger = without {
        it.kind == TranslationFailureKind.TEXT_TRANSLATION && it.messageId == messageId &&
            (it.language == null || it.language.equals(language, ignoreCase = true))
    }

    public fun transcribed(messageId: String, attachmentId: String?): TranslationFailureLedger = without {
        it.kind == TranslationFailureKind.TRANSCRIPTION && it.messageId == messageId && sameAttachment(it, attachmentId)
    }

    public fun audioTranslated(messageId: String, attachmentId: String?, language: String): TranslationFailureLedger = without {
        it.kind == TranslationFailureKind.AUDIO_TRANSLATION && it.messageId == messageId && sameAttachment(it, attachmentId) &&
            (it.language == null || it.language.equals(language, ignoreCase = true))
    }

    /** Le toucher de relance consomme l'échec : la demande repart, l'icône s'éteint. */
    public fun retried(messageId: String): TranslationFailureLedger = without { it.messageId == messageId }

    public fun forMessage(messageId: String): List<TranslationFailureEntry> = entries.values.filter { it.messageId == messageId }

    public fun hasFailure(messageId: String): Boolean = entries.values.any { it.messageId == messageId }

    /** Un message supprimé n'a plus d'échec à montrer. */
    public fun forget(messageId: String): TranslationFailureLedger = retried(messageId)

    private fun sameAttachment(entry: TranslationFailureEntry, attachmentId: String?): Boolean =
        entry.attachmentId == null || attachmentId == null || entry.attachmentId == attachmentId

    private fun without(predicate: (TranslationFailureEntry) -> Boolean): TranslationFailureLedger {
        val kept = entries.filterValues { !predicate(it) }
        return if (kept.size == entries.size) this else TranslationFailureLedger(kept)
    }
}

/** Les trois événements d'échec, traduits en entrée du registre. */
public fun TranslationFailedEvent.toFailureEntry(): TranslationFailureEntry =
    TranslationFailureEntry(messageId, TranslationFailureKind.TEXT_TRANSLATION, error = error)

public fun AudioTranslationFailedEvent.toFailureEntry(): TranslationFailureEntry =
    TranslationFailureEntry(messageId, TranslationFailureKind.AUDIO_TRANSLATION, attachmentId, error = error, errorCode = errorCode)

public fun TranscriptionFailedEvent.toFailureEntry(): TranslationFailureEntry =
    TranslationFailureEntry(messageId, TranslationFailureKind.TRANSCRIPTION, attachmentId, error = error, errorCode = errorCode)
