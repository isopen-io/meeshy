package me.meeshy.sdk.model.story

/**
 * Le brouillon d'UNE story (iOS `StoryDraft`) : le texte, et [refusedAt] quand la file a REFUSÉ ce commentaire — le
 * composeur rouvert reprend alors son texte et prend le focus.
 */
data class StoryCommentDraft(val text: String = "", val refusedAt: Long? = null)

/**
 * Les brouillons de commentaire, UN par story (iOS `storyDrafts`). Un texte vide n'est pas un brouillon : il le retire.
 * Immuable ; chaque transition rend un nouvel ensemble, ou le MÊME quand rien ne change.
 */
data class StoryCommentDrafts(val byStory: Map<String, StoryCommentDraft> = emptyMap()) {

    fun draftOf(storyId: String): StoryCommentDraft? = byStory[storyId]

    /** Ce que la barre saisit : un texte vide efface le brouillon, un texte posé le remplace (un refus périmé tombe). */
    fun saved(storyId: String, text: String): StoryCommentDrafts {
        if (storyId.isBlank()) return this
        if (text.isEmpty()) return cleared(storyId)
        if (byStory[storyId]?.text == text) return this
        return copy(byStory = byStory + (storyId to StoryCommentDraft(text)))
    }

    /** Le commentaire est parti : le brouillon de la story est supprimé. */
    fun sent(storyId: String): StoryCommentDrafts = cleared(storyId)

    /** La file a refusé le commentaire : il revient dans le brouillon de SA story, daté. */
    fun refused(storyId: String, text: String, atMillis: Long): StoryCommentDrafts {
        if (storyId.isBlank()) return this
        val resumed = byStory[storyId]?.text?.takeIf { it.isNotBlank() && it != text }
            ?.let { typed -> "$text\n$typed" } ?: text
        return copy(byStory = byStory + (storyId to StoryCommentDraft(resumed, atMillis)))
    }

    private fun cleared(storyId: String): StoryCommentDrafts =
        if (storyId in byStory) copy(byStory = byStory - storyId) else this
}
