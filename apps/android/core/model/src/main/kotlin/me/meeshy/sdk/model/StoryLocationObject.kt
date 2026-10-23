package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Pastille de lieu posée sur une slide (miroir de `StoryLocationObject.swift`).
 * Mêmes transforms ET même fenêtre de temps qu'un [StoryTextObject] : elle
 * apparaît et disparaît quand elle veut. Distincte du lieu de la PUBLICATION.
 */
@Serializable
data class StoryLocationObject(
    val id: String,
    val place: SharedPlace,
    val x: Double = 0.5,
    val y: Double = 0.5,
    val scale: Double = 1.0,
    val rotation: Double = 0.0,
    val zIndex: Int = 0,
    val anchor: StoryAnchorPoint = StoryAnchorPoint(),
    /** Langue d'origine de l'élément (`null` : publications antérieures). */
    val sourceLanguage: String? = null,
    /** Gabarit qui décore la pastille ; `null` ou inconnu : la pastille d'origine. */
    val styleId: String? = null,
    val startTime: Double? = null,
    val duration: Double? = null,
    val fadeIn: Double? = null,
    val fadeOut: Double? = null,
)
