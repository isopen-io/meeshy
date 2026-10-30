package me.meeshy.app.stories

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.sdk.net.api.UpdatePostRequest

/** L'enregistrement d'une story modifiée : la requête de mise à jour et la story telle qu'elle sera une fois acceptée. */
internal sealed interface StoryEditPlan {
    data class Ready(val request: UpdatePostRequest, val optimistic: ApiPost) : StoryEditPlan

    /** La composition ne peut pas partir : [reason] est un des repères de [StoryEditErrors]. */
    data class Refused(val reason: String) : StoryEditPlan
}

internal object StoryEditErrors {
    const val FAILED = "story-edit-failed"
    const val OFFLINE = "story-edit-offline"
    const val ONE_SLIDE = "story-edit-one-slide"
    const val UNAVAILABLE = "story-edit-unavailable"

    /** La story s'est rouverte du cache : son blob servi n'est pas encore relu, rien ne s'écrit sans lui. */
    const val BASE_UNKNOWN = "story-edit-base-unknown"
}

/**
 * Compose la mise à jour d'une story publiée (#13632) — `PUT /posts/:id`, la même route qu'iOS (`PostService.update`).
 *
 * **La route REMPLACE `storyEffects` en entier** (`PostService.updatePost` l'écrit tel quel, le schéma est `passthrough`) :
 * ce que la requête ne nomme pas disparaît. La règle est donc de ne jamais reconstruire ce qui n'a pas bougé : on repart
 * du blob d'origine, et seuls les champs que le composeur tient reçoivent la composition ; chaque objet resté égal à sa
 * forme d'ouverture repart SOUS SA FORME D'ORIGINE (traductions, keyframes, rognage, champs de versions plus récentes).
 *
 * L'audience, les références et le texte ne partent que s'ils ont changé : une édition ne rouvre ni ne réécrit ce que
 * l'auteur n'a pas touché. Les médias : ceux que la composition n'utilise plus sont retirés (`removeMediaIds`), seulement
 * parmi ceux que la slide tenait ; les nouveaux sont rattachés (`mediaIds`).
 */
internal object StoryEditMerge {

    fun plan(opening: StoryEditOpening, state: StoryComposerUiState, language: String): StoryEditPlan {
        val slides = state.deck.publishableSlides
        if (slides.size != 1) return StoryEditPlan.Refused(StoryEditErrors.ONE_SLIDE)
        if (state.pendingUploads.isNotEmpty()) return StoryEditPlan.Refused(StoryEditErrors.OFFLINE)
        val served = opening.served ?: return StoryEditPlan.Refused(StoryEditErrors.BASE_UNKNOWN)
        val slide = slides.single()
        val create = publishPlans(state, language).single().request
        val merged = effects(opening, slide, create.storyEffects)
        val onPost = opening.post.media.orEmpty().mapTo(mutableSetOf()) { it.id }
        val attach = create.mediaIds.orEmpty().filter { it !in onPost }
        val removed = removedMedia(opening, slide) + removedAudio(opening, slide)
        val visibility = state.draft.visibility
        val userIds = ComposerAudienceSelection.wireUserIds(visibility, state.draft.visibilityUserIds).orEmpty()
        val audienceChanged = visibility.wire != opening.post.visibility || (visibility.requiresUserSelection && userIds.toSet() != opening.post.visibilityUserIds.orEmpty().toSet())
        val content = slide.text.trim()
        val mentionsChanged = opening.mentionsKnown && state.draft.mentions.references() != opening.mentions.references()
        val request = UpdatePostRequest(
            content = content.takeIf { it != opening.post.content.orEmpty().trim() },
            visibility = visibility.wire.takeIf { audienceChanged },
            visibilityUserIds = userIds.takeIf { audienceChanged && visibility.requiresUserSelection },
            removeMediaIds = removed.takeIf { it.isNotEmpty() },
            storyEffects = StoryEditDocument.written(served.json, opening.effects, merged)?.let { StoryEffects(document = it) },
            mediaIds = attach.takeIf { it.isNotEmpty() },
            mentions = state.draft.mentions.takeIf { mentionsChanged },
            allowSoundExtraction = state.draft.allowSoundExtraction,
            mediaAlt = MediaDescriptionLaw.wire(state.draft.mediaAlt, attach),
            mediaCaption = MediaDescriptionLaw.wire(state.draft.mediaCaption, attach),
        )
        return StoryEditPlan.Ready(request, optimistic(opening, state, request, merged, removed))
    }

    /** La composition éditée : le blob d'origine, dont seuls les champs du composeur sont remplacés. */
    fun effects(opening: StoryEditOpening, slide: StorySlide, rebuilt: StoryEffects?): StoryEffects {
        val original = opening.effects
        val built = rebuilt ?: StoryEffects()
        val hydrated = opening.slide
        val frameKept = slide.frame == hydrated.frame
        val filterKept = slide.filter == hydrated.filter && slide.filterIntensity == hydrated.filterIntensity
        return original.copy(
            background = if (slide.background == hydrated.background) original.background else built.background,
            textObjects = texts(original.textObjects, slide.elements, hydrated.elements, built.textObjects),
            stickerObjects = stickers(opening, slide, built.stickerObjects.orEmpty()),
            mediaObjects = medias(opening, slide, built.mediaObjects.orEmpty()),
            drawingStrokes = if (slide.strokes == hydrated.strokes) original.drawingStrokes else built.drawingStrokes,
            filter = if (filterKept) original.filter else built.filter,
            filterIntensity = if (filterKept) original.filterIntensity else built.filterIntensity,
            timelineDuration = if (slide.durationSecondsPin == hydrated.durationSecondsPin) original.timelineDuration else built.timelineDuration,
            audioPlayerObjects = if (slide.audio == hydrated.audio) original.audioPlayerObjects else built.audioPlayerObjects,
            locationObjects = if (slide.places == hydrated.places) original.locationObjects else built.locationObjects,
            backgroundTransform = if (frameKept) original.backgroundTransform else framed(original, built),
            opening = if (frameKept) original.opening else built.opening,
            closing = if (frameKept) original.closing else built.closing,
        )
    }

    private fun framed(original: StoryEffects, built: StoryEffects) =
        (original.backgroundTransform?.copy(videoFitMode = built.backgroundTransform?.videoFitMode, backdrop = built.backgroundTransform?.backdrop)
            ?: built.backgroundTransform)?.takeUnless { it.isIdentity }

    private fun texts(
        originals: List<StoryTextObject>,
        now: List<StoryTextElement>,
        opened: List<StoryTextElement>,
        built: List<StoryTextObject>,
    ): List<StoryTextObject> {
        val byId = originals.associateBy { it.id }
        val openedById = opened.associateBy { it.id }
        return now.filter { it.isPublishable }.zip(built).map { (element, wire) ->
            val original = byId[element.id]
            val before = openedById[element.id]
            if (original == null || before == null) wire else touched(original, element, before, wire)
        }
    }

    /**
     * Un texte touché : l'ORIGINAL, dont seuls les traits que le geste a changés prennent la forme du composeur. Déplacer un
     * texte ne lui retire ni ses traductions, ni son effet, ni son fond ; seules en changer les mots périme ses traductions.
     */
    private fun touched(original: StoryTextObject, now: StoryTextElement, before: StoryTextElement, wire: StoryTextObject): StoryTextObject =
        TEXT_TRAITS.filter { (changed, _) -> changed(now, before) }.fold(original) { text, (_, take) -> take(text, wire) }

    private val TEXT_TRAITS: List<Pair<(StoryTextElement, StoryTextElement) -> Boolean, (StoryTextObject, StoryTextObject) -> StoryTextObject>> = listOf(
        { a: StoryTextElement, b: StoryTextElement -> a.text != b.text } to { o: StoryTextObject, w: StoryTextObject -> o.copy(text = w.text, translations = null) },
        { a: StoryTextElement, b: StoryTextElement -> a.x != b.x || a.y != b.y } to { o: StoryTextObject, w: StoryTextObject -> o.copy(x = w.x, y = w.y) },
        { a: StoryTextElement, b: StoryTextElement -> a.scale != b.scale || a.size != b.size } to { o: StoryTextObject, w: StoryTextObject -> o.copy(scale = w.scale, fontSize = w.fontSize) },
        { a: StoryTextElement, b: StoryTextElement -> a.rotationDeg != b.rotationDeg } to { o: StoryTextObject, w: StoryTextObject -> o.copy(rotation = w.rotation) },
        { a: StoryTextElement, b: StoryTextElement -> a.style != b.style } to { o: StoryTextObject, w: StoryTextObject -> o.copy(textStyle = w.textStyle, textEffect = w.textEffect) },
        { a: StoryTextElement, b: StoryTextElement -> a.color != b.color } to { o: StoryTextObject, w: StoryTextObject -> o.copy(textColor = w.textColor) },
        { a: StoryTextElement, b: StoryTextElement -> a.align != b.align } to { o: StoryTextObject, w: StoryTextObject -> o.copy(textAlign = w.textAlign) },
        { a: StoryTextElement, b: StoryTextElement -> a.background != b.background } to { o: StoryTextObject, w: StoryTextObject -> o.copy(textBg = w.textBg, backgroundStyle = w.backgroundStyle) },
        { a: StoryTextElement, b: StoryTextElement -> a.outline != b.outline } to { o: StoryTextObject, w: StoryTextObject -> o.copy(borderColor = w.borderColor, borderWidth = w.borderWidth) },
        { a: StoryTextElement, b: StoryTextElement -> a.frame != b.frame } to { o: StoryTextObject, w: StoryTextObject ->
            o.copy(frameShape = w.frameShape, framePaddingScale = w.framePaddingScale, frameBorderWidth = w.frameBorderWidth, frameBorderColor = w.frameBorderColor)
        },
        { a: StoryTextElement, b: StoryTextElement -> a.fade != b.fade } to { o: StoryTextObject, w: StoryTextObject -> o.copy(fadeIn = w.fadeIn, fadeOut = w.fadeOut) },
        { a: StoryTextElement, b: StoryTextElement -> a.timing != b.timing } to { o: StoryTextObject, w: StoryTextObject -> o.copy(startTime = w.startTime, duration = w.duration) },
        { a: StoryTextElement, b: StoryTextElement -> a.sourceLanguage != b.sourceLanguage } to { o: StoryTextObject, w: StoryTextObject -> o.copy(sourceLanguage = w.sourceLanguage) },
    )

    private fun stickers(opening: StoryEditOpening, slide: StorySlide, built: List<StorySticker>): List<StorySticker>? {
        val byId = opening.effects.stickerObjects.orEmpty().associateBy { it.id }
        val openedById = opening.slide.stickers.associateBy { it.id }
        val editable = slide.stickers.filter { it.isPublishable }.zip(built).map { (sticker, wire) ->
            val original = byId[sticker.id]
            when {
                original == null -> wire
                sticker == openedById[sticker.id] -> original
                else -> original.copy(x = wire.x, y = wire.y, scale = wire.scale, rotation = wire.rotation, startTime = wire.startTime, duration = wire.duration)
            }
        }.toMutableList()
        opening.foreignStickers.forEach { (index, sticker) -> editable.add(index.coerceAtMost(editable.size), sticker) }
        return editable.ifEmpty { null }
    }

    private fun medias(opening: StoryEditOpening, slide: StorySlide, built: List<StoryMediaObject>): List<StoryMediaObject>? {
        val hydrated = opening.slide
        val originals = opening.effects.mediaObjects.orEmpty().filterNot { it.isBackground }.associateBy { it.postMediaId.ifBlank { it.id } }
        val openedPlaced = hydrated.placedMedia.associateBy { it.mediaId }
        val placedNow = slide.placedMedia.associateBy { it.mediaId }
        val foreground = built.filterNot { it.isBackground }.map { wire ->
            val id = wire.postMediaId
            val original = originals[id]
            when {
                original == null -> wire
                placedNow[id] == openedPlaced[id] -> original
                else -> original.copy(
                    x = wire.x, y = wire.y, scale = wire.scale, rotation = wire.rotation, filter = wire.filter,
                    adjustments = wire.adjustments, sourceStart = wire.sourceStart, sourceEnd = wire.sourceEnd,
                    duration = wire.duration, intrinsicDuration = wire.intrinsicDuration ?: original.intrinsicDuration,
                )
            }
        }
        val backgroundKept = slide.backgroundMediaId == hydrated.backgroundMediaId &&
            slide.backgroundLoop == hydrated.backgroundLoop && slide.transform == hydrated.transform &&
            slide.backgroundAdjustments == hydrated.backgroundAdjustments
        val nowBackground = built.firstOrNull { it.isBackground }
        val background = if (backgroundKept) opening.originalBackground else nowBackground?.let { fresh ->
            opening.originalBackground?.takeIf { it.postMediaId == fresh.postMediaId }?.let { served ->
                changedBackground(served, fresh, slide, hydrated)
            } ?: fresh
        }
        return (listOfNotNull(background) + foreground).ifEmpty { null }
    }

    /** Le fond servi, dont seuls les traits que le geste a changés (cadrage, boucle, réglages) prennent la forme du composeur. */
    private fun changedBackground(served: StoryMediaObject, fresh: StoryMediaObject, slide: StorySlide, hydrated: StorySlide): StoryMediaObject =
        BACKGROUND_TRAITS.filter { (changed, _) -> changed(slide, hydrated) }.fold(served) { background, (_, take) -> take(background, fresh) }

    private val BACKGROUND_TRAITS: List<Pair<(StorySlide, StorySlide) -> Boolean, (StoryMediaObject, StoryMediaObject) -> StoryMediaObject>> = listOf(
        { a: StorySlide, b: StorySlide -> a.transform != b.transform } to { o: StoryMediaObject, w: StoryMediaObject -> o.copy(x = w.x, y = w.y, scale = w.scale) },
        { a: StorySlide, b: StorySlide -> a.backgroundLoop != b.backgroundLoop } to { o: StoryMediaObject, w: StoryMediaObject -> o.copy(loop = w.loop) },
        { a: StorySlide, b: StorySlide -> a.backgroundAdjustments != b.backgroundAdjustments } to { o: StoryMediaObject, w: StoryMediaObject -> o.copy(adjustments = w.adjustments) },
    )

    /** Les médias que la slide tenait et qu'elle ne tient plus : seuls ceux-là sont retirés du post. */
    private fun removedMedia(opening: StoryEditOpening, slide: StorySlide): List<String> =
        opening.deckMediaIds.filter { it !in slide.mediaIds }

    /** Une piste enregistrée ou synthétisée que la scène a quittée est un média de la story ; un son emprunté n'en est pas un. */
    private fun removedAudio(opening: StoryEditOpening, slide: StorySlide): List<String> {
        val onPost = opening.post.media.orEmpty().mapTo(mutableSetOf()) { it.id }
        val kept = slide.audio.map { it.postMediaId }.toSet()
        return opening.slide.audio.map { it.postMediaId }.filter { it.isNotBlank() && it in onPost && it !in kept }
    }

    private fun optimistic(opening: StoryEditOpening, state: StoryComposerUiState, request: UpdatePostRequest, merged: StoryEffects, removed: List<String>): ApiPost {
        val added = state.attachments.filter { it.id in request.mediaIds.orEmpty() }.map {
            ApiPostMedia(id = it.id, mimeType = it.mimeType, fileUrl = it.url, width = it.width, height = it.height, thumbnailUrl = it.thumbnailUrl)
        }
        return opening.post.copy(
            content = request.content ?: opening.post.content,
            visibility = request.visibility ?: opening.post.visibility,
            visibilityUserIds = request.visibilityUserIds ?: opening.post.visibilityUserIds,
            storyEffects = merged,
            media = opening.post.media.orEmpty().filter { it.id !in removed } + added,
            isViewedByMe = true,
        )
    }

    private fun List<PostMentionInput>.references(): Set<Pair<String?, String?>> = mapTo(mutableSetOf()) { (it.userId ?: it.username?.lowercase()) to it.display }
}
