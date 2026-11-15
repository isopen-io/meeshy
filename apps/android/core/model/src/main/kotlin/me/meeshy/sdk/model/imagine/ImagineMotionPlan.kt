package me.meeshy.sdk.model.imagine

import kotlin.math.ceil
import kotlin.math.floor
import me.meeshy.sdk.model.scene.export.ImagerLength
import me.meeshy.sdk.model.scene.export.ImagerQuarter

/** La fenêtre que la carte animée montre et fait entendre, en secondes depuis le début du média. */
data class ImagineClip(val startSeconds: Double, val durationSeconds: Double) {
    val endSeconds: Double get() = startSeconds + durationSeconds

    companion object {
        /** Une fenêtre de [length] secondes qui commence en [start], glissée pour tenir dans un média de [mediaDuration]. */
        fun window(length: Double, start: Double, mediaDuration: Double?): ImagineClip {
            val safeStart = if (start.isFinite()) maxOf(0.0, start) else 0.0
            if (mediaDuration == null || !mediaDuration.isFinite() || mediaDuration <= 0) return ImagineClip(safeStart, length)
            val duration = minOf(length, mediaDuration)
            return ImagineClip(minOf(safeStart, mediaDuration - duration), duration)
        }
    }
}

/**
 * **Le plan d'une carte animée** — combien d'images, à quelle cadence, à quelle taille et QUEL extrait. Un GIF est court
 * et réduit de moitié ; une vidéo garde sa taille ; un son part sur la durée choisie à partir du point choisi ; au-delà
 * d'une minute, la part choisie depuis le début l'emporte (#14332). Miroir de `MessageCardMotionPlan` (iOS).
 */
data class ImagineMotionPlan(
    val output: ImagineOutput,
    val fps: Double,
    val durationSeconds: Double,
    val frameCount: Int,
    val scale: Double,
    val startSeconds: Double,
) {
    val clip: ImagineClip get() = ImagineClip(startSeconds, durationSeconds)

    /** Les pixels d'une image du plan, ramenés au pair qu'un encodeur vidéo exige. */
    fun pixelSize(width: Double, height: Double): Pair<Int, Int> =
        even(width * scale) to even(height * scale)

    /** L'instant (depuis le début de l'extrait) de l'image [index] : celui où on l'entend. */
    fun timeOfFrame(index: Int): Double = index / fps

    companion object {
        const val GIF_MAX_SECONDS = 6.0
        const val VIDEO_MAX_SECONDS = 15.0

        private fun even(value: Double): Int = maxOf(2, floor(value).toInt() / 2 * 2)

        /** `null` pour une image fixe, ou pour une sortie que le contenu n'offre pas. */
        fun of(
            output: ImagineOutput,
            media: List<ImagineMedia>,
            length: ImagineClipLength = ImagineClipLength.ONE_MINUTE,
            quarter: ImagerQuarter? = null,
            startSeconds: Double = 0.0,
        ): ImagineMotionPlan? {
            if (output == ImagineOutput.IMAGE || output !in ImagineOutput.offered(media.map { it.kind })) return null
            val video = media.firstOrNull { it.kind == ImagineMediaKind.VIDEO }
            val audio = media.firstOrNull { it.kind == ImagineMediaKind.AUDIO }
            val whole = ImagineTrayOffer.clipQuarters(output, media).lastOrNull()?.durationMillis
            if (quarter != null && whole != null) {
                val part = ImagerLength.renderedMillis(whole, quarter) / MILLIS
                return plan(output, if (video == null) SOUND_FPS else VIDEO_FPS, ImagineClip(0.0, part), 1.0)
            }
            return when {
                output == ImagineOutput.GIF && video != null ->
                    plan(output, GIF_FPS, ImagineClip.window(GIF_MAX_SECONDS, startSeconds, video.durationSeconds ?: DEFAULT_VIDEO), 0.5)
                output == ImagineOutput.VIDEO && video != null ->
                    plan(output, VIDEO_FPS, ImagineClip.window(VIDEO_MAX_SECONDS, startSeconds, video.durationSeconds ?: DEFAULT_VIDEO), 1.0)
                output == ImagineOutput.VIDEO && audio != null ->
                    plan(output, SOUND_FPS, ImagineClip.window(length.seconds, startSeconds, audio.durationSeconds ?: DEFAULT_SOUND), 1.0)
                else -> null
            }
        }

        private fun plan(output: ImagineOutput, fps: Double, window: ImagineClip, scale: Double): ImagineMotionPlan {
            val seconds = maxOf(1 / fps, window.durationSeconds)
            return ImagineMotionPlan(output, fps, seconds, maxOf(1, ceil(seconds * fps).toInt()), scale, window.startSeconds)
        }

        private const val GIF_FPS = 10.0
        private const val VIDEO_FPS = 15.0
        private const val SOUND_FPS = 10.0
        private const val DEFAULT_VIDEO = 3.0
        private const val DEFAULT_SOUND = 5.0
        private const val MILLIS = 1000.0
    }
}
