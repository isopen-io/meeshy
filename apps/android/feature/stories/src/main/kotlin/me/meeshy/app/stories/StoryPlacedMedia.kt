package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryDraftPlacedMediaSnapshot
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.scene.wireValue

/**
 * Un média de premier plan posé sur la scène d'une slide (miroir d'un `StoryMediaObject` iOS non-fond) : le média
 * (id d'un média de la slide) et sa pose normalisée — position 0..1 (centre 0,5), échelle et rotation, bornées par
 * les mêmes lois que les textes et stickers ([StoryTextElement]). Son [filter] est le sien, à pleine force, jamais celui de la
 * scène (iOS `StoryMediaObject.filter`) ; `null` : aucun filtre.
 */
data class StoryPlacedMedia(
    val mediaId: String,
    val x: Float = StoryTextElement.CENTER,
    val y: Float = StoryTextElement.CENTER,
    val scale: Float = StoryTextElement.DEFAULT_SCALE,
    val rotationDeg: Float = StoryTextElement.DEFAULT_ROTATION,
    val filter: StoryFilter? = null,
) {
    fun normalised(): StoryPlacedMedia = copy(
        x = coord(x),
        y = coord(y),
        scale = StoryTextElement.clampScale(scale),
        rotationDeg = StoryTextElement.normaliseRotation(rotationDeg),
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
        val duration = durationSeconds?.takeIf { it > 0.0 && video }
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
            intrinsicDuration = duration,
            duration = duration,
        )
    }

    fun toDraftSnapshot(): StoryDraftPlacedMediaSnapshot =
        StoryDraftPlacedMediaSnapshot(id = mediaId, x = x, y = y, scale = scale, rotationDeg = rotationDeg, filter = filter?.wireValue())

    companion object {
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
                ).normalised()
            }

        fun from(snapshot: StoryDraftPlacedMediaSnapshot): StoryPlacedMedia =
            StoryPlacedMedia(
                snapshot.id, snapshot.x, snapshot.y, snapshot.scale, snapshot.rotationDeg,
                snapshot.filter?.let { token -> StoryFilter.entries.firstOrNull { it.wireValue() == token } },
            ).normalised()
    }
}
