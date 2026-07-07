package me.meeshy.app.chat

import me.meeshy.sdk.model.ConversationDraft

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
     * Decide what to persist for [rawText] given the [previous] stored draft.
     *
     * - Blank text with a stored non-blank draft → [DraftPersist.Clear].
     * - Blank text with no stored draft → [DraftPersist.None] (no redundant write).
     * - Non-blank text identical to the stored draft → [DraftPersist.None].
     * - Non-blank text that differs → [DraftPersist.Save] (raw text preserved so a
     *   restore returns exactly what the user typed, timestamped with [nowIso]).
     */
    fun resolve(
        conversationId: String,
        rawText: String,
        nowIso: String,
        previous: ConversationDraft?,
    ): DraftPersist {
        if (rawText.isBlank()) {
            val hadDraft = previous != null && previous.text.isNotBlank()
            return if (hadDraft) DraftPersist.Clear(conversationId) else DraftPersist.None
        }
        if (previous?.text == rawText) return DraftPersist.None
        return DraftPersist.Save(
            ConversationDraft(conversationId = conversationId, text = rawText, updatedAt = nowIso),
        )
    }

    /**
     * The text to seed the composer with when a conversation opens, or `null` to
     * leave it untouched. A stored draft is restored only when the composer is
     * idle: not mid-edit, and still empty — so a restore never clobbers an
     * in-flight edit nor text the user has already begun typing (the load is
     * asynchronous and may resolve after the first keystroke). A stored draft
     * whose text is blank is ignored.
     */
    fun restore(stored: ConversationDraft?, currentDraft: String, isEditing: Boolean): String? {
        if (isEditing || currentDraft.isNotBlank()) return null
        return stored?.text?.takeIf { it.isNotBlank() }
    }
}
