package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.ComposerMode

/**
 * Les règles de saisie de la barre de commentaire (iOS `UniversalComposerBar` en `.comment`,
 * #13988) : le budget de [ComposerMode.COMMENT], l'emoji posé au curseur, et le droit d'envoyer.
 */
public object CommentComposerText {

    public data class Edit(val text: String, val cursor: Int)

    public val maxLength: Int = ComposerMode.COMMENT.maxLength ?: Int.MAX_VALUE

    public fun bounded(text: String): String = text.take(maxLength)

    /** Pose [inserted] à la place de la sélection ; refusée si elle dépasserait le budget. */
    public fun insert(text: String, selectionStart: Int, selectionEnd: Int, inserted: String): Edit {
        val start = minOf(selectionStart, selectionEnd).coerceIn(0, text.length)
        val end = maxOf(selectionStart, selectionEnd).coerceIn(0, text.length)
        val next = text.substring(0, start) + inserted + text.substring(end)
        if (next.length > maxLength) return Edit(text, end)
        return Edit(next, start + inserted.length)
    }

    public fun canSend(text: String, isSending: Boolean, hasAttachment: Boolean = false): Boolean =
        !isSending && (text.isNotBlank() || hasAttachment)
}
