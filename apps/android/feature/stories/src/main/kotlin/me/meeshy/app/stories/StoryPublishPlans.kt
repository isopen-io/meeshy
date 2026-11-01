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
        val draft = StoryComposerDraft(
            text = slide.text,
            visibility = current.draft.visibility,
            mediaIds = slide.mediaIds,
            textElements = slide.elements,
            stickers = slide.stickers,
            strokes = slide.strokes,
            filter = slide.filter,
            filterIntensity = slide.filterIntensity,
            durationSecondsPin = slide.durationSecondsPin,
            background = slide.background,
            floor = floor,
            backgroundMedia = StoryPublishBackground.resolve(slide, current),
            placedMedia = StoryPublishPlacedMedia.resolve(slide, current),
            repostOfId = current.draft.repostOfId,
            visibilityUserIds = current.draft.visibilityUserIds,
            mentions = ComposerSceneReferences.declaredFor(current.draft.mentions, slide.badges),
            mediaAlt = current.draft.mediaAlt,
            mediaCaption = current.draft.mediaCaption,
            allowSoundExtraction = current.draft.allowSoundExtraction,
            audio = slide.audio,
            frame = slide.frame,
            places = slide.places,
            soundTranscriptions = slide.soundTranscriptions,
            videosDuckUnderSound = slide.videosDuckUnderSound,
        )
        PublishPlan(
            request = draft.toCreateStoryRequest(language),
            dependsOn = slide.mediaIds.filter { it in pendingCmids || OutboxIds.isCmid(it) },
        )
    }
}
