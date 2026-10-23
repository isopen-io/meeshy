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
    /**
     * Le ratio MESURÉ sur l'asset — `null` tant qu'aucune mesure n'est arrivée (#5100). `1.0`
     * disait à la fois « pas encore mesuré » et « ce média est carré » ; la PRÉSENCE de la clé
     * fait la mesure. Lire le ratio à servir par [servedAspectRatio].
     */
    val aspectRatio: Double? = null,
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
    /**
     * Les réglages d'image (exposition, contraste, saturation, température, vignette, netteté,
     * flou…) — `null` quand rien n'est réglé. Seules les valeurs actives voyagent.
     */
    val adjustments: ImageAdjustments? = null,
    /** Nom d'auteur de la piste dans la timeline (`null` : aucun). */
    val name: String? = null,
    /** Coupe l'atténuation automatique de ce clip vidéo (`null` : ducking actif). */
    val isDuckingDisabled: Boolean? = null,
    /** Niveau d'avant le mute d'auteur ; invariant `mutedVolumeMemento != null => volume == 0`. */
    override val mutedVolumeMemento: Float? = null,
    /** Le filtre de CET objet (`StoryFilter` par son nom de fil) ; `null` : aucun filtre. */
    val filter: String? = null,
    /** ThumbHash du contenu (placeholder) ; au-delà de [MAX_THUMB_HASH_LENGTH] il se lit absent. */
    val thumbHash: String? = null,
) : me.meeshy.sdk.model.scene.StoryVolumeCarrying {

    /** Le ratio à SERVIR : la mesure, ou le repli historique quand elle manque. */
    val servedAspectRatio: Double get() = aspectRatio ?: UNMEASURED_ASPECT_RATIO

    /** Type sûr de [mediaType] ; `null` pour un kind inconnu (client plus récent), jamais un échec. */
    val kind: StoryMediaKind?
        get() = when (mediaType) {
            "image" -> StoryMediaKind.IMAGE
            "video" -> StoryMediaKind.VIDEO
            else -> null
        }

    /** Le filtre typé ; une valeur inconnue se lit « aucun filtre ». */
    val parsedFilter: StoryFilter?
        get() = filter?.let { name -> StoryFilter.entries.firstOrNull { it.name.lowercase() == name } }

    /** Le thumbHash servi : un blob démesuré (charge malformée) se lit absent. */
    val servedThumbHash: String? get() = thumbHash?.takeIf { it.length <= MAX_THUMB_HASH_LENGTH }

    companion object {
        const val UNMEASURED_ASPECT_RATIO: Double = 1.0
        const val MAX_THUMB_HASH_LENGTH: Int = 100
    }
}
