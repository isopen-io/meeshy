package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryFilter
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
    val mediaIds: List<String> = emptyList(),
    val textElements: List<StoryTextElement> = emptyList(),
    val stickers: List<StoryStickerElement> = emptyList(),
    val filter: StoryFilter? = null,
    val filterIntensity: Float = StoryFilterMatrix.DEFAULT_INTENSITY,
) {
    /** The content actually sent — surrounding whitespace is never published. */
    val trimmedText: String get() = text.trim()

    /** Within the gateway's content cap (`CreatePostSchema` allows up to [MAX_CHARS]). */
    val isWithinLimit: Boolean get() = text.length <= MAX_CHARS

    /** Remaining budget; negative once the limit is exceeded so the UI can warn. */
    val charactersRemaining: Int get() = MAX_CHARS - text.length

    /** True once at least one uploaded media is attached to the draft. */
    val hasMedia: Boolean get() = mediaIds.isNotEmpty()

    /** The on-canvas text elements that carry publishable (non-blank) content. */
    val publishableTextElements: List<StoryTextElement> get() = textElements.filter { it.isPublishable }

    /** True once at least one on-canvas text element carries publishable content. */
    val hasTextElements: Boolean get() = publishableTextElements.isNotEmpty()

    /** The on-canvas stickers that carry a publishable (non-blank) emoji. */
    val publishableStickers: List<StoryStickerElement> get() = stickers.filter { it.isPublishable }

    /** True once at least one on-canvas sticker carries a publishable emoji. */
    val hasStickers: Boolean get() = publishableStickers.isNotEmpty()

    /** Within the per-story media cap ([MAX_MEDIA]) — parity with iOS's ≤10 rule. */
    val isWithinMediaLimit: Boolean get() = mediaIds.size <= MAX_MEDIA

    /** Free media slots left, never negative so the UI can size a picker request. */
    val remainingMediaSlots: Int get() = (MAX_MEDIA - mediaIds.size).coerceAtLeast(0)

    /** No more media may be attached — the cap is reached. */
    val isMediaFull: Boolean get() = mediaIds.size >= MAX_MEDIA

    /**
     * A draft is publishable when it carries real content — text **or** attached
     * media **or** a publishable on-canvas text element — within both the character
     * and media limits. A media-only or text-element-only story (no caption) is valid.
     */
    val canPublish: Boolean
        get() = (trimmedText.isNotEmpty() || hasMedia || hasTextElements || hasStickers) &&
            isWithinLimit && isWithinMediaLimit

    fun withText(value: String): StoryComposerDraft = copy(text = value)

    fun withVisibility(value: StoryVisibility): StoryComposerDraft = copy(visibility = value)

    fun withMediaIds(value: List<String>): StoryComposerDraft = copy(mediaIds = value)

    fun withTextElements(value: List<StoryTextElement>): StoryComposerDraft = copy(textElements = value)

    fun withStickers(value: List<StoryStickerElement>): StoryComposerDraft = copy(stickers = value)

    fun withFilter(value: StoryFilter?): StoryComposerDraft = copy(filter = value)

    /**
     * Maps the draft to the create-story wire request. [originalLanguage] is the
     * publisher's resolved content language (Prisme) so the gateway can seed
     * translations. [content] is omitted (null) for a media-only story; attached
     * [mediaIds] ride along when present; publishable on-canvas text elements are
     * serialised into `storyEffects.textObjects` (blank elements are dropped),
     * publishable stickers into `storyEffects.stickerObjects`, the selected photo
     * [filter] (+ its strength) rides on `storyEffects.filter`, and `storyEffects`
     * stays null when there is nothing to carry.
     */
    fun toCreateStoryRequest(originalLanguage: String): CreateStoryRequest = CreateStoryRequest(
        type = STORY_TYPE,
        content = trimmedText.takeIf { it.isNotEmpty() },
        storyEffects = storyEffects(originalLanguage),
        visibility = visibility.wire,
        originalLanguage = originalLanguage,
        mediaIds = mediaIds.takeIf { it.isNotEmpty() },
    )

    private fun storyEffects(originalLanguage: String): StoryEffects? {
        val textObjects = publishableTextElements.map { it.toTextObject(originalLanguage) }
        val stickerObjects = publishableStickers.map { it.toSticker() }
        if (textObjects.isEmpty() && stickerObjects.isEmpty() && filter == null) return null
        return StoryEffects(
            textObjects = textObjects,
            stickerObjects = stickerObjects.takeIf { it.isNotEmpty() },
            filter = filter?.wireValue(),
            filterIntensity = filter?.let { StoryFilterMatrix.clampIntensity(filterIntensity).toDouble() },
        )
    }

    companion object {
        const val MAX_CHARS: Int = 5000

        /** Maximum media attachments per story — matches the iOS composer cap. */
        const val MAX_MEDIA: Int = 10
        private const val STORY_TYPE = "STORY"
    }
}
