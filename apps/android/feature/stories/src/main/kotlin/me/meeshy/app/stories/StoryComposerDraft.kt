package me.meeshy.app.stories

import me.meeshy.sdk.net.api.CreateStoryRequest

/**
 * Audience a published story is visible to — mirrors the gateway `Visibility`
 * enum (`packages/shared`) carried on `CreateStoryRequest.visibility`. [wire] is
 * the exact string the API expects; the UI never hardcodes the literal.
 */
enum class StoryVisibility(val wire: String) {
    PUBLIC("PUBLIC"),
    FRIENDS("FRIENDS"),
    COMMUNITY("COMMUNITY"),
    PRIVATE("PRIVATE"),
}

/**
 * Pure, immutable model of an in-progress text story. It owns the single product
 * rule that gates publishing — "is this draft sendable?" — and the mapping to the
 * wire request, so the ViewModel/Screen stay glue and the rule is fully unit-tested.
 *
 * This slice covers the text story; media composition (canvas/slides) layers on
 * later via `storyEffects`/`mediaIds`, which this request already leaves null.
 */
data class StoryComposerDraft(
    val text: String = "",
    val visibility: StoryVisibility = StoryVisibility.PUBLIC,
) {
    /** The content actually sent — surrounding whitespace is never published. */
    val trimmedText: String get() = text.trim()

    /** Within the gateway's content cap (`CreatePostSchema` allows up to [MAX_CHARS]). */
    val isWithinLimit: Boolean get() = text.length <= MAX_CHARS

    /** Remaining budget; negative once the limit is exceeded so the UI can warn. */
    val charactersRemaining: Int get() = MAX_CHARS - text.length

    /** A draft is publishable when it has real content within the limit. */
    val canPublish: Boolean get() = trimmedText.isNotEmpty() && isWithinLimit

    fun withText(value: String): StoryComposerDraft = copy(text = value)

    fun withVisibility(value: StoryVisibility): StoryComposerDraft = copy(visibility = value)

    /**
     * Maps the draft to the create-story wire request. [originalLanguage] is the
     * publisher's resolved content language (Prisme) so the gateway can seed
     * translations; media fields stay null for a text story.
     */
    fun toCreateStoryRequest(originalLanguage: String): CreateStoryRequest = CreateStoryRequest(
        type = STORY_TYPE,
        content = trimmedText,
        visibility = visibility.wire,
        originalLanguage = originalLanguage,
    )

    companion object {
        const val MAX_CHARS: Int = 5000
        private const val STORY_TYPE = "STORY"
    }
}
