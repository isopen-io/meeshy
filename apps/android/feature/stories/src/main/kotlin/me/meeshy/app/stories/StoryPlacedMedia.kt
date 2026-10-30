package me.meeshy.app.stories

import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryDraftPlacedMediaSnapshot
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule
import me.meeshy.sdk.model.scene.wireValue

/**
 * Un média de premier plan posé sur la scène d'une slide (miroir d'un `StoryMediaObject` iOS non-fond) : le média
 * (id d'un média de la slide) et sa pose normalisée — position 0..1 (centre 0,5), échelle et rotation, bornées par
 * les mêmes lois que les textes et stickers ([StoryTextElement]). Son [filter] est le sien, à pleine force, jamais celui de la
 * scène (iOS `StoryMediaObject.filter`) ; `null` : aucun filtre. Ses [adjustments] (réglages et effets, iOS
 * `StoryMediaObject.adjustments`) sont les siens aussi ; `null` : rien de réglé — jamais un sac neutre. Sa fenêtre de
 * source ([sourceStart], [sourceEnd], en secondes, iOS `sourceStart` / `sourceEnd`) est celle d'une VIDÉO rognée : les
 * deux bornes ou aucune, `null` : la source entière. Son [crop] (iOS `StoryMediaObject.crop`, #13849) est le cadre d'une
 * IMAGE recadrée, en fractions de la source : rien n'est réécrit, chaque lecteur peint la source derrière ce cadre ;
 * `null` : la source entière.
 */
data class StoryPlacedMedia(
    val mediaId: String,
    val x: Float = StoryTextElement.CENTER,
    val y: Float = StoryTextElement.CENTER,
    val scale: Float = StoryTextElement.DEFAULT_SCALE,
    val rotationDeg: Float = StoryTextElement.DEFAULT_ROTATION,
    val filter: StoryFilter? = null,
    val adjustments: ImageAdjustments? = null,
    val sourceStart: Double? = null,
    val sourceEnd: Double? = null,
    val crop: StoryMediaCrop? = null,
) {
    /** La fenêtre rognée, ou `null` : la source entière (jamais une borne seule, jamais une fenêtre sous le plancher). */
    val trim: MediaTrimBounds?
        get() = trimOf(sourceStart, sourceEnd)

    fun normalised(): StoryPlacedMedia = copy(
        x = coord(x),
        y = coord(y),
        scale = StoryTextElement.clampScale(scale),
        rotationDeg = StoryTextElement.normaliseRotation(rotationDeg),
        adjustments = adjustments?.takeUnless { it.isNeutral },
        sourceStart = trim?.start,
        sourceEnd = trim?.end,
        crop = crop?.let { StoryMediaCrop.fromPayloadBounds(it.x, it.y, it.width, it.height) },
    )

    fun transformed(scaleBy: Float, rotateByDeg: Float): StoryPlacedMedia = copy(
        scale = StoryTextElement.clampScale(scale * scaleBy),
        rotationDeg = StoryTextElement.normaliseRotation(rotationDeg + rotateByDeg),
    )

    fun nudged(dx: Float, dy: Float): StoryPlacedMedia =
        copy(x = coord(x + dx), y = coord(y + dy))

    /**
     * L'objet du fil : jamais un fond, la pose en x / y / scale / rotation (degrés) comme iOS, et le ratio MESURÉ
     * quand on le connaît — `null` sinon, jamais un faux carré (#5100).
     */
    fun toMediaObject(url: String?, mimeType: String, durationSeconds: Double?, aspectRatio: Double? = null): StoryMediaObject {
        val video = mimeType.startsWith("video", ignoreCase = true)
        val source = durationSeconds?.takeIf { it > 0.0 && video }
        val window = trim?.takeIf { video }
        val fields = window?.let { MediaTrimRule.fields(it, source ?: it.end) }
        val duration = fields?.duration ?: source
        return StoryMediaObject(
            id = mediaId,
            postMediaId = mediaId,
            mediaURL = url,
            mediaType = if (video) "video" else "image",
            placement = "media",
            x = x.toDouble(),
            y = y.toDouble(),
            scale = scale.toDouble(),
            rotation = rotationDeg.toDouble(),
            aspectRatio = aspectRatio,
            isBackground = false,
            filter = filter?.wireValue(),
            adjustments = adjustments?.takeUnless { it.isNeutral },
            intrinsicDuration = source,
            duration = duration,
            sourceStart = fields?.start,
            sourceEnd = fields?.end,
            crop = crop.takeIf { !video },
        )
    }

    fun toDraftSnapshot(): StoryDraftPlacedMediaSnapshot =
        StoryDraftPlacedMediaSnapshot(id = mediaId, x = x, y = y, scale = scale, rotationDeg = rotationDeg, filter = filter?.wireValue(), adjustments = adjustments, sourceStart = sourceStart, sourceEnd = sourceEnd, crop = crop)

    companion object {
        /** Les deux bornes dans la source, ou `null` : une borne seule, une fenêtre sous le plancher ou aberrante vaut la source entière. */
        fun trimOf(start: Double?, end: Double?): MediaTrimBounds? {
            if (start == null || end == null || !start.isFinite() || !end.isFinite()) return null
            return if (start >= 0.0 && end - start >= MediaTrimRule.MINIMUM_DURATION) MediaTrimBounds(start, end) else null
        }

        private fun coord(value: Float): Float =
            if (value.isFinite()) StoryTextElement.clampCoord(value) else StoryTextElement.CENTER

        /** Les médias de premier plan d'une story (iOS comprise) : tout objet média qui n'est pas le fond. */
        fun foreground(objects: List<StoryMediaObject>): List<StoryPlacedMedia> =
            objects.filterNot { it.isBackground }.map {
                StoryPlacedMedia(
                    mediaId = it.postMediaId.ifBlank { it.id },
                    x = it.x.toFloat(),
                    y = it.y.toFloat(),
                    scale = it.scale.toFloat(),
                    rotationDeg = it.rotation.toFloat(),
                    filter = it.parsedFilter,
                    adjustments = it.adjustments,
                    sourceStart = it.sourceStart.takeIf { _ -> it.mediaType == "video" },
                    sourceEnd = it.sourceEnd.takeIf { _ -> it.mediaType == "video" },
                    crop = it.crop.takeIf { _ -> it.mediaType != "video" },
                ).normalised()
            }

        fun from(snapshot: StoryDraftPlacedMediaSnapshot): StoryPlacedMedia =
            StoryPlacedMedia(
                snapshot.id, snapshot.x, snapshot.y, snapshot.scale, snapshot.rotationDeg,
                snapshot.filter?.let { token -> StoryFilter.entries.firstOrNull { it.wireValue() == token } },
                snapshot.adjustments, snapshot.sourceStart, snapshot.sourceEnd, snapshot.crop,
            ).normalised()
    }
}
