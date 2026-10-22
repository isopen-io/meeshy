package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Type of a story media object — port of StoryMediaKind (StoryModels.swift). */
@Serializable
enum class StoryMediaKind {
    @SerialName("image") IMAGE,
    @SerialName("video") VIDEO,
}

/** An image/video object on a story canvas — port of StoryMediaObject (StoryModels.swift). */
@Serializable
data class StoryMediaObject(
    val id: String,
    val postMediaId: String = "",
    val mediaURL: String? = null,
    val mediaType: String = "image",
    val placement: String = "media",
    val x: Double = 0.5,
    val y: Double = 0.5,
    val scale: Double = 1.0,
    val rotation: Double = 0.0,
    override val volume: Float = 1.0f,
    val aspectRatio: Double = 1.0,
    val anchor: StoryAnchorPoint = StoryAnchorPoint(),
    val intrinsicDuration: Double? = null,
    val isBackground: Boolean = false,
    val loop: Boolean = false,
    /**
     * Crop bounds in fractions of the source (#5085) — `null` when the whole media is
     * shown. The v1 wire nests them under `crop`; the canvas-v3 payload flattens them
     * to `cropX`/`cropY`/`cropW`/`cropH`, projected by [CanvasV3Projection].
     *
     * They travelled from iOS with **no Android reader at all** until 2026-09-04: an
     * image cropped by the author rendered WHOLE here, and no test could turn red —
     * the field simply never reached a decoder.
     */
    val crop: StoryMediaCrop? = null,
    val zIndex: Int = 0,
    val startTime: Double? = null,
    val duration: Double? = null,
    /**
     * Playback bounds INSIDE the source, in seconds (#5129) — `null` when the whole
     * source plays. Distinct from [startTime]/[duration], which say WHEN the object is
     * on screen; these say WHICH PART of the file plays once it is. Both travel or
     * neither does (see [StorySourceWindow]).
     *
     * They travelled from iOS with no Android reader at all until 2026-09-04: a clip
     * trimmed to seconds 3 → 8 of a thirty-second video played all thirty here.
     */
    val sourceStart: Double? = null,
    val sourceEnd: Double? = null,
    val fadeIn: Double? = null,
    val fadeOut: Double? = null,
    val sourceLanguage: String? = null,
    val keyframes: List<StoryKeyframe>? = null,
    /** Nom d'auteur de la piste dans la timeline (`null` : aucun). */
    val name: String? = null,
    /** Coupe l'atténuation automatique de ce clip vidéo (`null` : ducking actif). */
    val isDuckingDisabled: Boolean? = null,
    /** Niveau d'avant le mute d'auteur ; invariant `mutedVolumeMemento != null => volume == 0`. */
    override val mutedVolumeMemento: Float? = null,
) : me.meeshy.sdk.model.scene.StoryVolumeCarrying
