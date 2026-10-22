package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject

/**
 * Un objet de la scène d'une slide — miroir de `MeeshySceneObject.swift` (#4591).
 *
 * Les objets vivent dans cinq listes de [me.meeshy.sdk.model.StoryEffects]
 * (textes, médias, stickers, lieux, sons) : toute question posée à « l'objet
 * d'id X » se réécrivait en cascade sur les cinq. Cette somme est une VUE,
 * construite à la demande et jamais persistée : les listes restent la source de
 * vérité sérialisée. Le `when` exhaustif fait qu'une sixième famille ne compile
 * pas tant qu'elle n'a pas dit sa géométrie.
 */
public sealed interface MeeshySceneObject {

    /** Le genre sans la charge. `PLACE` (et non `location`) : le fil, la timeline et iOS disent `place`. */
    public enum class Kind { TEXT, MEDIA, STICKER, PLACE, AUDIO }

    public data class Text(val value: StoryTextObject) : MeeshySceneObject
    public data class Media(val value: StoryMediaObject) : MeeshySceneObject
    public data class Sticker(val value: StorySticker) : MeeshySceneObject
    public data class Place(val value: StoryLocationObject) : MeeshySceneObject
    public data class Audio(val value: StoryAudioPlayerObject) : MeeshySceneObject

    public val kind: Kind
        get() = when (this) {
            is Text -> Kind.TEXT
            is Media -> Kind.MEDIA
            is Sticker -> Kind.STICKER
            is Place -> Kind.PLACE
            is Audio -> Kind.AUDIO
        }

    public val id: String
        get() = when (this) {
            is Text -> value.id
            is Media -> value.id
            is Sticker -> value.id
            is Place -> value.id
            is Audio -> value.id
        }

    /** Position normalisée (0..1) dans le repère de la scène. */
    public val x: Double
        get() = when (this) {
            is Text -> value.x
            is Media -> value.x
            is Sticker -> value.x
            is Place -> value.x
            is Audio -> value.x
        }

    public val y: Double
        get() = when (this) {
            is Text -> value.y
            is Media -> value.y
            is Sticker -> value.y
            is Place -> value.y
            is Audio -> value.y
        }

    /** Tout objet se redimensionne : l'audio sans échelle posée vaut 1. */
    public val scale: Double
        get() = when (this) {
            is Text -> value.scale
            is Media -> value.scale
            is Sticker -> value.scale
            is Place -> value.scale
            is Audio -> 1.0
        }

    public val rotation: Double
        get() = when (this) {
            is Text -> value.rotation
            is Media -> value.rotation
            is Sticker -> value.rotation
            is Place -> value.rotation
            is Audio -> 0.0
        }

    /** Rang d'empilement ; l'audio le porte optionnel, 0 par défaut. */
    public val zIndex: Int
        get() = when (this) {
            is Text -> value.zIndex
            is Media -> value.zIndex
            is Sticker -> value.zIndex
            is Place -> value.zIndex
            is Audio -> value.zIndex ?: 0
        }

    /** Durée propre ; `null` : l'objet vit toute la slide. Les cinq familles en portent une. */
    public val duration: Double?
        get() = when (this) {
            is Text -> value.duration
            is Media -> value.duration
            is Sticker -> value.duration
            is Place -> value.duration
            is Audio -> value.duration?.toDouble()
        }

    /** D'où l'objet part ; `null` : présent dès le début de la slide (état nominal, distinct de 0). */
    public val startTime: Double?
        get() = when (this) {
            is Text -> value.startTime
            is Media -> value.startTime
            is Sticker -> value.startTime
            is Place -> value.startTime
            is Audio -> value.startTime?.toDouble()
        }

    /** Plan de fond : seuls un média et un audio peuvent l'occuper. */
    public val isBackground: Boolean
        get() = when (this) {
            is Media -> value.isBackground
            is Audio -> value.isBackground == true
            is Text, is Sticker, is Place -> false
        }
}
