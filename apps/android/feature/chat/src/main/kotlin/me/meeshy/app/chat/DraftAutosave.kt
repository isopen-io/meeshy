package me.meeshy.app.chat

import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.isMeaningful

/** The persistence action a composer change implies for its per-conversation draft. */
sealed interface DraftPersist {
    /** Write [draft] to the durable store (the composer holds meaningful text). */
    data class Save(val draft: ConversationDraft) : DraftPersist

    /** Purge the stored draft for [conversationId] (the composer went empty). */
    data class Clear(val conversationId: String) : DraftPersist

    /** Nothing to write — the store already matches the composer (idempotent). */
    data object None : DraftPersist
}

/**
 * The composer snapshot to seed when a conversation opens: the [text] to place and the
 * [replyToId] reply to re-arm (`null` = a plain draft with no reply). Produced by
 * [DraftAutosave.restore] only when the composer is idle; `null` from `restore` means
 * "leave the composer untouched".
 */
data class DraftRestore(val text: String, val replyToId: String?)

/**
 * Pure decision layer for per-conversation draft auto-save/restore — the Android
 * port of iOS `ConversationDraftManager` (save/draft/clear) plus the empty-draft
 * purge rule from `ConversationScreen.persistDraft` (a blank composer removes the
 * stored draft; restored in `onAppear`).
 *
 * A stateless building block: the durable [me.meeshy.sdk.chat.ConversationDraftStore]
 * owns bytes; this owns the *when* — a blank composer purges, a non-blank composer
 * saves, and an unchanged composer writes nothing. Kept out of the Composable and
 * off the ViewModel so every branch stays JVM-testable.
 */
object DraftAutosave {

    /**
     * Decide what to persist for [rawText] and the currently-armed [replyToId] given
     * the [previous] stored draft. A draft is *meaningful* when it holds text **or** an
     * armed reply — so a reply armed on an empty composer is persisted (and survives
     * navigation) rather than dropped, and cancelling that reply on an empty composer
     * purges it.
     *
     * - No text and no reply, over a meaningful stored draft → [DraftPersist.Clear].
     * - No text and no reply, over nothing/an empty draft → [DraftPersist.None].
     * - A draft (text and/or reply) identical to the stored one → [DraftPersist.None].
     * - A draft that differs → [DraftPersist.Save] (raw text preserved so a restore
     *   returns exactly what the user typed, timestamped with [nowIso]). [replyToId]
     *   is normalised (trimmed, blank → `null`).
     */
    fun resolve(
        conversationId: String,
        rawText: String,
        replyToId: String?,
        nowIso: String,
        previous: ConversationDraft?,
    ): DraftPersist {
        val reply = replyToId?.trim()?.takeIf { it.isNotEmpty() }
        if (rawText.isBlank() && reply == null) {
            val hadDraft = previous != null && previous.isMeaningful
            return if (hadDraft) DraftPersist.Clear(conversationId) else DraftPersist.None
        }
        if (previous?.text == rawText && previous.replyToId == reply) return DraftPersist.None
        return DraftPersist.Save(
            ConversationDraft(
                conversationId = conversationId,
                text = rawText,
                updatedAt = nowIso,
                replyToId = reply,
            ),
        )
    }

    /**
     * The composer snapshot to seed when a conversation opens, or `null` to leave it
     * untouched. A stored draft is restored only when the composer is idle: not
     * mid-edit, and still empty — so a restore never clobbers an in-flight edit nor
     * text the user has already begun typing (the load is asynchronous and may resolve
     * after the first keystroke). A stored draft that holds neither text nor an armed
     * reply is ignored; a reply-only draft restores empty text with the reply re-armed.
     * The stored [ConversationDraft.replyToId] is normalised (trimmed, blank → `null`).
     */
    fun restore(stored: ConversationDraft?, currentDraft: String, isEditing: Boolean): DraftRestore? {
        if (isEditing || currentDraft.isNotBlank()) return null
        if (stored == null || !stored.isMeaningful) return null
        val reply = stored.replyToId?.trim()?.takeIf { it.isNotEmpty() }
        return DraftRestore(text = stored.text, replyToId = reply)
    }
}
