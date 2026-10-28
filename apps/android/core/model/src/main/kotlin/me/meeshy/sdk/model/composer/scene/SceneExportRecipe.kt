package me.meeshy.sdk.model.composer.scene

import me.meeshy.sdk.model.scene.export.StoryExportSourceWindowRule

/** Le fond de la scène exportée : une vidéo (fenêtre lue, son propre ou non) ou un fixe peint une fois. */
public sealed interface SceneExportBackground {
    public data object Still : SceneExportBackground
    public data class Video(val clipStartMillis: Long, val clipEndMillis: Long, val keepsOwnAudio: Boolean) : SceneExportBackground
}

public data class SceneExportSound(val id: String, val startMillis: Long, val endMillis: Long, val volume: Float)

public data class SceneExportVideoInput(
    val startSeconds: Double?,
    val endSeconds: Double?,
    val assetDurationSeconds: Double,
    val isMuted: Boolean,
)

public data class SceneExportSoundInput(
    val id: String,
    val startSeconds: Double,
    val endSeconds: Double?,
    val volume: Double,
)

/**
 * La recette du bake d'une scène (miroir de `StoryVideoExportService` iOS) : ce que le moteur doit assembler, déduit de
 * la slide par des lois pures — durée bornée par le fond vidéo, fenêtre de source, sons ramenés dans la scène.
 */
public data class SceneExportRecipe(
    val plan: SceneExportPlan,
    val background: SceneExportBackground,
    val sounds: List<SceneExportSound>,
) {
    public companion object {
        public const val MAX_SOUNDS: Int = 8

        public fun of(
            durationSeconds: Double,
            video: SceneExportVideoInput?,
            sounds: List<SceneExportSoundInput>,
            landscape: Boolean = false,
        ): SceneExportRecipe {
            val slide = SceneExportPlan.of(durationSeconds, landscape)
            val background = video?.let { videoBackground(it, slide.durationMillis) } ?: SceneExportBackground.Still
            val duration = (background as? SceneExportBackground.Video)
                ?.let { minOf(slide.durationMillis, it.clipEndMillis - it.clipStartMillis) }
                ?.coerceAtLeast(SceneExportPlan.MIN_DURATION_MILLIS)
                ?: slide.durationMillis
            val plan = slide.copy(durationMillis = duration)
            return SceneExportRecipe(plan, background, sounds.mapNotNull { sound(it, duration) }.take(MAX_SOUNDS))
        }

        private fun videoBackground(video: SceneExportVideoInput, slideMillis: Long): SceneExportBackground.Video {
            val window = StoryExportSourceWindowRule.resolve(video.startSeconds, video.endSeconds, video.assetDurationSeconds)
            val length = minOf(window.durationMillis, slideMillis)
            return SceneExportBackground.Video(
                clipStartMillis = window.startMillis,
                clipEndMillis = window.startMillis + length,
                keepsOwnAudio = StoryExportSourceWindowRule.carriesSound(video.isMuted, emptyList()),
            )
        }

        private fun sound(input: SceneExportSoundInput, sceneMillis: Long): SceneExportSound? {
            val start = Math.round(input.startSeconds.takeIf { it.isFinite() }.let { it ?: 0.0 } * 1000).coerceAtLeast(0L)
            val end = minOf(sceneMillis, input.endSeconds?.takeIf { it.isFinite() }?.let { Math.round(it * 1000) } ?: sceneMillis)
            if (end <= start) return null
            val volume = input.volume.takeIf { it.isFinite() }?.coerceIn(0.0, 1.0)?.toFloat() ?: 1f
            return SceneExportSound(input.id, start, end, volume)
        }
    }
}
