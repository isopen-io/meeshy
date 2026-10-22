package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Easing curve for story animations — port of StoryEasing (StoryModels.swift). */
@Serializable
enum class StoryEasing {
    @SerialName("linear") LINEAR,
    @SerialName("easeIn") EASE_IN,
    @SerialName("easeOut") EASE_OUT,
    @SerialName("easeInOut") EASE_IN_OUT,
}

/** A single animation keyframe — port of StoryKeyframe (StoryModels.swift). */
@Serializable
data class StoryKeyframe(
    /**
     * Le fil n'envoie PAS cet identifiant — il n'en a jamais envoyé. iOS en
     * synthétise un à la lecture (`StoryModels.swift:4137`) ; l'exiger ici
     * faisait échouer kotlinx sur le DOCUMENT entier, donc emportait le post
     * complet dès qu'un objet portait une animation.
     *
     * Il ne sert que de clé de liste : le repli doit rester UNIQUE, jamais une
     * constante partagée. Corollaire assumé, identique à iOS : deux lectures
     * du même JSON ne sont pas `equals` si l'identifiant a été synthétisé.
     */
    val id: String = java.util.UUID.randomUUID().toString(),
    val time: Float = 0f,
    val x: Double? = null,
    val y: Double? = null,
    val scale: Double? = null,
    val opacity: Double? = null,
    val easing: StoryEasing? = null,
)
