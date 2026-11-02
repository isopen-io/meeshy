package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.composer.ComposerSceneReferences
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.outbox.OutboxIds

/** One publishable slide's wire request paired with the offline uploads it must wait on. */
internal data class PublishPlan(val request: CreateStoryRequest, val dependsOn: List<String>)

/**
 * Maps the deck to one wire request **per publishable slide** (non-blank text or
 * attached media), in deck order. Each story carries **its own** slide's media —
 * media now belongs to the slide it was added to, not the whole story — and
 * `dependsOn` only the offline uploads staged on that same slide (a draft restored or reopened
 * names its still-queued uploads by their `cmid` alone, #13500), so the drainer
 * gates each story on exactly its own prerequisites and grafts the real ids in. [floor] is the background the scene shows
 * when its author chose none — written into every slide that poses something, so what the composer showed is what is read.
 */
/** Les pastilles de mention de la slide : chacune y déclare sa personne ÉPINGLÉE (#13846). */
internal val StorySlide.badges: List<ComposerSceneReferences.Badge>
    get() = elements.mapNotNull { element ->
        element.referenceUserId?.let { ComposerSceneReferences.Badge(userId = it, username = element.text.trim().removePrefix("@")) }
    }

internal fun publishPlans(
    current: StoryComposerUiState,
    language: String,
    slides: List<StorySlide> = current.deck.publishableSlides,
    floor: StoryBackgroundValue? = null,
): List<PublishPlan> {
    val pendingCmids = current.pendingUploads.mapTo(mutableSetOf(), PendingMediaUpload::cmid)
    return slides.map { slide ->
        PublishPlan(
            request = sceneRequest(slide, current, language, floor),
            dependsOn = slide.mediaIds.filter { it in pendingCmids || OutboxIds.isCmid(it) },
        )
    }
}

/**
 * La requête d'une slide : une scène qui part porte le fond que le plateau lui peint (#14302) — un sticker, un texte ou un
 * son posé sur une vidéo jamais désignée publiait la scène sans elle. Une slide qui ne compose rien d'autre que son média
 * reste la publication d'avant, sans scène.
 */
private fun sceneRequest(slide: StorySlide, current: StoryComposerUiState, language: String, floor: StoryBackgroundValue?): CreateStoryRequest {
    val plain = slide.draft(current, floor).toCreateStoryRequest(language)
    val painted = StoryPublishBackground.designated(slide, current)
    if (plain.storyEffects == null || painted == slide) return plain
    return painted.draft(current, floor).toCreateStoryRequest(language)
}

private fun StorySlide.draft(current: StoryComposerUiState, floor: StoryBackgroundValue?): StoryComposerDraft = StoryComposerDraft(
    text = text,
    visibility = current.draft.visibility,
    mediaIds = mediaIds,
    textElements = elements,
    stickers = stickers,
    strokes = strokes,
    filter = filter,
    filterIntensity = filterIntensity,
    durationSecondsPin = durationSecondsPin,
    background = background,
    floor = floor,
    backgroundMedia = StoryPublishBackground.resolve(this, current),
    placedMedia = StoryPublishPlacedMedia.resolve(this, current),
    repostOfId = current.draft.repostOfId,
    visibilityUserIds = current.draft.visibilityUserIds,
    mentions = ComposerSceneReferences.declaredFor(current.draft.mentions, badges),
    mediaAlt = current.draft.mediaAlt,
    mediaCaption = current.draft.mediaCaption,
    allowSoundExtraction = current.draft.allowSoundExtraction,
    audio = audio,
    frame = frame,
    places = places,
    soundTranscriptions = soundTranscriptions,
    videosDuckUnderSound = videosDuckUnderSound,
)
