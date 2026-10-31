package me.meeshy.app.stories

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.PostReferenceDisplay
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.scene.SceneFrame
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.scene.StoryElementTiming
import me.meeshy.sdk.model.scene.StoryFilterMatrix
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextFade
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import me.meeshy.sdk.model.scene.StoryTextOutline
import me.meeshy.sdk.model.scene.wireValue
import kotlin.math.abs

/**
 * Une story PUBLIÉE rouverte dans le composeur (#13632) : la scène telle que le serveur la sert, recomposée en une slide,
 * et tout ce dont l'enregistrement a besoin pour ne rien perdre de ce que le composeur ne tient pas.
 *
 * [effects] est le blob d'origine, intact : l'enregistrement repart de lui (iOS prend le sien « verbatim »,
 * `StoryComposerViewModel(editing:)`). [slide] est la slide à l'instant de l'ouverture : tout ce qui y est resté égal à
 * lui-même à l'enregistrement repart sous sa forme d'ORIGINE (traductions d'un texte, keyframes, rognage d'un fond, filtre
 * inconnu de ce build). [foreignStickers] sont les stickers que le composeur ne sait pas éditer (image posée, modèle) :
 * ils restent sur la scène, aux rangs qu'ils occupaient.
 */
internal data class StoryEditOpening(
    val post: ApiPost,
    val effects: StoryEffects,
    val slide: StorySlide,
    val attachments: List<UploadedMedia>,
    val originalBackground: StoryMediaObject?,
    val foreignStickers: List<Pair<Int, StorySticker>>,
    val mentions: List<PostMentionInput>,
    /** `false` : la charge ne portait pas les références SILENCIEUSES — l'enregistrement n'en parle pas plutôt que de les révoquer. */
    val mentionsKnown: Boolean,
    /**
     * Le blob tel que la passerelle le tient, base de l'écriture ([StoryEditDocument]). `null` : la story s'est rouverte du
     * cache, qui ne le garde pas — l'enregistrement le relit avant de rien écrire.
     */
    val served: ServedStoryEffects? = null,
) {
    val postId: String get() = post.id

    /** Les médias de la story que la slide tient : leur retrait est un choix de l'auteur, jamais d'un autre. */
    val deckMediaIds: Set<String> get() = slide.mediaIds.toSet()

    fun applied(state: StoryComposerUiState): StoryComposerUiState {
        val visibility = StoryVisibility.fromWire(post.visibility.orEmpty())
        return state.copy(
            editing = true,
            deck = StorySlideDeck(listOf(slide), slide.id),
            attachments = attachments,
            pendingUploads = emptyList(),
            draft = state.draft
                .withVisibility(visibility)
                .withVisibilityUserIds(post.visibilityUserIds.orEmpty())
                .copy(mentions = mentions, repostOfId = null, allowSoundExtraction = post.allowSoundExtraction),
        ).mirrorDraftToSelection()
    }

    companion object {
        /** La largeur de référence d'un cadrage de fond : le composeur n'a pas encore mesuré son canevas à l'ouverture. */
        fun open(post: ApiPost, mentionsKnown: Boolean, served: ServedStoryEffects? = null): StoryEditOpening {
            val effects = post.storyEffects ?: StoryEffects()
            val media = post.media.orEmpty().associateBy { it.id }
            val objects = effects.mediaObjects.orEmpty()
            val explicitBackground = objects.firstOrNull { it.isBackground }
            val foreground = objects.filterNot { it.isBackground }
            val referenced = (objects.map { it.postMediaId } + effects.audioPlayerObjects.orEmpty().map { it.postMediaId } +
                effects.stickerObjects.orEmpty().map { it.postMediaId } + listOfNotNull(effects.voiceAttachmentId)).filter { it.isNotBlank() }.toSet()
            val legacyBackgroundId = post.media.orEmpty().firstOrNull { it.id !in referenced }?.id.takeIf { explicitBackground == null }
            val backgroundId = explicitBackground?.postMediaId?.takeIf { it.isNotBlank() } ?: legacyBackgroundId
            val placed = StoryPlacedMedia.foreground(foreground).filter { it.mediaId.isNotBlank() }
            val mediaIds = (listOfNotNull(backgroundId) + placed.map { it.mediaId }).distinct()
            val bySticker = effects.stickerObjects.orEmpty().withIndex().partition { it.value.editable }
            val elements = effects.textObjects.map { it.toElement() }
            val slide = StorySlide(
                id = newSlideId(),
                text = post.content.orEmpty(),
                mediaIds = mediaIds,
                transform = explicitBackground?.let { StoryCanvasTransform(scale = StoryCanvasTransform.clampScale(it.scale.toFloat())) } ?: StoryCanvasTransform.IDENTITY,
                elements = elements,
                stickers = bySticker.first.map { it.value.toElement() },
                strokes = effects.drawingStrokes.orEmpty(),
                filter = effects.filter?.let { name -> StoryFilter.entries.firstOrNull { it.wireValue() == name } },
                filterIntensity = effects.filterIntensity?.toFloat() ?: StoryFilterMatrix.DEFAULT_INTENSITY,
                durationSecondsPin = effects.timelineDuration,
                background = effects.background?.let(StoryBackgroundValue::parse),
                backgroundMediaId = backgroundId,
                backgroundLoop = explicitBackground?.loop ?: true,
                backgroundAdjustments = explicitBackground?.adjustments,
                audio = effects.audioPlayerObjects.orEmpty(),
                frame = SceneFrame(
                    fitMode = effects.backgroundTransform?.videoFitMode,
                    backdrop = effects.backgroundTransform?.backdrop,
                    opening = effects.opening,
                    closing = effects.closing,
                ),
                placedMedia = placed,
                places = effects.locationObjects,
            )
            val attachments = mediaIds.mapNotNull { id ->
                val wire = (objects.firstOrNull { it.postMediaId == id })
                if (media[id] == null && wire == null) null else uploaded(id, media[id], wire)
            }
            return StoryEditOpening(
                post = post,
                effects = effects,
                slide = slide,
                attachments = attachments,
                originalBackground = explicitBackground,
                foreignStickers = bySticker.second.map { it.index to it.value },
                mentions = post.mentions.orEmpty()
                    .filter { it.display != PostReferenceDisplay.INLINE }
                    .map { PostMentionInput(userId = it.userId, username = it.username, display = it.display.wire) },
                mentionsKnown = mentionsKnown,
                served = served,
            )
        }

        private fun uploaded(id: String, media: me.meeshy.sdk.model.ApiPostMedia?, wire: StoryMediaObject?): UploadedMedia {
            val video = (media?.mimeType ?: wire?.mediaType.orEmpty()).startsWith("video")
            return UploadedMedia(
                id = id,
                url = media?.fileUrl ?: wire?.mediaURL.orEmpty(),
                mimeType = media?.mimeType ?: if (video) "video/mp4" else "image/jpeg",
                fileSize = media?.fileSize?.toLong() ?: 0L,
                width = media?.width,
                height = media?.height,
                durationMs = wire?.intrinsicDuration?.let { (it * MILLIS).toLong() } ?: media?.duration?.toLong(),
                thumbnailUrl = media?.thumbnailUrl,
            )
        }

        private const val MILLIS = 1000.0
    }
}

/** Un sticker que le composeur sait éditer : un emoji nu (une image posée ou un modèle ne s'y réduit pas). */
internal val StorySticker.editable: Boolean get() = !hasImage && templateId.isBlank()

internal fun StorySticker.toElement(): StoryStickerElement = StoryStickerElement(
    id = id,
    emoji = emoji,
    x = x.toFloat(),
    y = y.toFloat(),
    scale = scale.toFloat(),
    rotationDeg = rotation.toFloat(),
    timing = StoryElementTiming(startSeconds = startTime?.toFloat() ?: 0f, durationSeconds = duration?.toFloat() ?: 0f),
    zIndex = zIndex,
).normalised()

/**
 * Le texte d'un fil en élément du composeur. La taille du composeur est un échelon : le plus proche est pris, et l'écart
 * passe dans l'échelle (taille × échelle est ce que le lecteur peint), de sorte qu'un texte d'iOS garde sa taille à l'écran.
 */
internal fun StoryTextObject.toElement(): StoryTextElement {
    val size = StoryTextSize.entries.minBy { abs(it.designSize - fontSize.toFloat()) }
    return StoryTextElement(
        id = id,
        text = text,
        style = StoryTextStyle.fromWire(textStyle),
        color = textColor ?: StoryTextElement.DEFAULT_COLOR,
        align = StoryTextAlign.entries.firstOrNull { it.wire == textAlign } ?: StoryTextAlign.CENTER,
        size = size,
        background = StoryTextBackground.resolve(backgroundStyle, textBg),
        outline = StoryTextOutline(width = borderWidth?.toFloat() ?: StoryTextOutline.NONE_WIDTH, color = borderColor),
        frame = StoryTextFrame(
            shape = StoryTextFrameShape.fromWire(frameShape),
            paddingScale = framePaddingScale?.toFloat() ?: StoryTextFrame.DEFAULT_PADDING,
            borderWidth = frameBorderWidth?.toFloat() ?: 0f,
            borderColor = frameBorderColor,
        ),
        sourceLanguage = sourceLanguage,
        fade = StoryTextFade(inSeconds = fadeIn?.toFloat() ?: 0f, outSeconds = fadeOut?.toFloat() ?: 0f),
        timing = StoryElementTiming(startSeconds = startTime?.toFloat() ?: 0f, durationSeconds = duration?.toFloat() ?: 0f),
        x = x.toFloat(),
        y = y.toFloat(),
        scale = (scale * fontSize / size.designSize).toFloat(),
        rotationDeg = rotation.toFloat(),
        referenceUserId = referenceUserId,
        zIndex = zIndex,
    ).normalised()
}
