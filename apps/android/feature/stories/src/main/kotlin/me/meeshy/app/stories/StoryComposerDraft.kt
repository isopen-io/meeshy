package me.meeshy.app.stories

import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.sdk.model.composer.scene.SceneFrame
import me.meeshy.sdk.model.scene.CanvasMediaAdoption
import me.meeshy.sdk.model.scene.StoryFilterMatrix
import me.meeshy.sdk.model.scene.wireValue
import me.meeshy.sdk.net.api.CreateStoryRequest

/** L'audience d'une publication — l'enum est celui du modèle (six modes du serveur). */
typealias StoryVisibility = me.meeshy.sdk.model.StoryVisibility

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
    val strokes: List<StoryDrawingStroke> = emptyList(),
    val filter: StoryFilter? = null,
    val filterIntensity: Float = StoryFilterMatrix.DEFAULT_INTENSITY,
    val durationSecondsPin: Double? = null,
    val background: StoryBackgroundValue? = null,
    val backgroundMedia: StoryBackgroundMedia? = null,
    val repostOfId: String? = null,
    /** La liste « visible par » / « sauf » : n'a de sens que sous ONLY / EXCEPT. */
    val visibilityUserIds: List<String> = emptyList(),
    /** Les personnes que la publication NOMME hors du texte (jamais INLINE : le serveur le dérive). */
    val mentions: List<PostMentionInput> = emptyList(),
    /** Texte alternatif par média (clé = id de média), distinct de [mediaCaption] et du texte. */
    val mediaAlt: Map<String, String> = emptyMap(),
    /** Légende par média (clé = id de média). */
    val mediaCaption: Map<String, String> = emptyMap(),
    /** `null` = l'auteur n'a rien décidé ; la passerelle applique son défaut. */
    val allowSoundExtraction: Boolean? = null,
    /** Les sons de la slide : le fond (emprunté à l'étagère ou capté) et les pistes de premier plan. */
    val audio: List<StoryAudioPlayerObject> = emptyList(),
    val frame: SceneFrame = SceneFrame(),
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

    /** True once at least one freehand stroke has been drawn on the canvas. */
    val hasDrawing: Boolean get() = strokes.isNotEmpty()

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
        get() = (trimmedText.isNotEmpty() || hasMedia || hasTextElements || hasStickers || hasDrawing || audio.isNotEmpty()) &&
            isWithinLimit && isWithinMediaLimit &&
            ComposerAudienceSelection.isPublishable(visibility, visibilityUserIds)

    fun withText(value: String): StoryComposerDraft = copy(text = value)

    fun withVisibility(value: StoryVisibility): StoryComposerDraft = copy(visibility = value)

    fun withVisibilityUserIds(value: List<String>): StoryComposerDraft = copy(visibilityUserIds = value)

    fun withMediaIds(value: List<String>): StoryComposerDraft = copy(mediaIds = value)

    fun withTextElements(value: List<StoryTextElement>): StoryComposerDraft = copy(textElements = value)

    fun withStickers(value: List<StoryStickerElement>): StoryComposerDraft = copy(stickers = value)

    fun withFilter(value: StoryFilter?): StoryComposerDraft = copy(filter = value)

    /**
     * Links this draft to the story it reposts. A blank/whitespace [value] (or `null`)
     * clears the link — an empty source id must never ride the wire and read as a repost
     * of "nothing". The reader half renders the attribution badge from the published
     * story's server-resolved fields, so the author side only has to carry this id.
     */
    fun withRepostOf(value: String?): StoryComposerDraft =
        copy(repostOfId = value?.takeIf { it.isNotBlank() })

    /**
     * Maps the draft to the create-story wire request. [originalLanguage] is the
     * publisher's resolved content language (Prisme) so the gateway can seed
     * translations. [content] is omitted (null) for a media-only story; attached
     * [mediaIds] ride along when present; publishable on-canvas text elements are
     * serialised into `storyEffects.textObjects` (blank elements are dropped),
     * publishable stickers into `storyEffects.stickerObjects`, the selected photo
     * [filter] (+ its strength) rides on `storyEffects.filter`, and `storyEffects`
     * stays null when there is nothing to carry.
     *
     * The post's `mediaIds` are the attached media **plus everything the canvas
     * designates** ([CanvasMediaAdoption.publicationMediaIds]) — a canvas must only
     * name rows the post owns, and a designated sound or sticker left out would be
     * swept server-side a day later as an abandoned upload.
     */
    fun toCreateStoryRequest(originalLanguage: String): CreateStoryRequest {
        val effects = storyEffects(originalLanguage)
        val publishedMediaIds = CanvasMediaAdoption.publicationMediaIds(mediaIds, effects)
        return CreateStoryRequest(
            type = STORY_TYPE,
            content = trimmedText.takeIf { it.isNotEmpty() },
            storyEffects = effects,
            visibility = visibility.wire,
            originalLanguage = originalLanguage,
            mediaIds = publishedMediaIds.takeIf { it.isNotEmpty() },
            repostOfId = repostOfId?.takeIf { it.isNotBlank() },
            visibilityUserIds = ComposerAudienceSelection.wireUserIds(visibility, visibilityUserIds),
            mentions = mentions.takeIf { it.isNotEmpty() },
            mediaAlt = MediaDescriptionLaw.wire(mediaAlt, publishedMediaIds),
            mediaCaption = MediaDescriptionLaw.wire(mediaCaption, publishedMediaIds),
            allowSoundExtraction = allowSoundExtraction,
        )
    }

    private fun storyEffects(originalLanguage: String): StoryEffects? {
        val textObjects = publishableTextElements.map { it.toTextObject(originalLanguage) }
        val stickerObjects = publishableStickers.map { it.toSticker() }
        val mediaObjects = listOfNotNull(backgroundMedia?.toMediaObject())
        val hasNothing = textObjects.isEmpty() && stickerObjects.isEmpty() && strokes.isEmpty() &&
            filter == null && durationSecondsPin == null && background == null && mediaObjects.isEmpty() &&
            audio.isEmpty() && frame.isNeutral
        if (hasNothing) return null
        return StoryEffects(
            background = background?.serialized(),
            textObjects = textObjects,
            stickerObjects = stickerObjects.takeIf { it.isNotEmpty() },
            mediaObjects = mediaObjects.takeIf { it.isNotEmpty() },
            drawingStrokes = strokes.takeIf { it.isNotEmpty() },
            filter = filter?.wireValue(),
            filterIntensity = filter?.let { StoryFilterMatrix.clampIntensity(filterIntensity).toDouble() },
            timelineDuration = durationSecondsPin,
            audioPlayerObjects = audio.takeIf { it.isNotEmpty() },
            backgroundTransform = frame.backgroundTransform(),
            opening = frame.opening,
            closing = frame.closing,
        )
    }

    companion object {
        const val MAX_CHARS: Int = 5000

        /** Maximum media attachments per story — 50, la décision porteur 2026-10-28 (#13590). */
        const val MAX_MEDIA: Int = me.meeshy.sdk.model.composer.SceneObjectCaps.MEDIA
        private const val STORY_TYPE = "STORY"
    }
}
