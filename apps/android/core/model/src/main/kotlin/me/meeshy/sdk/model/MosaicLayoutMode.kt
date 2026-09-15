package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive

/**
 * **Comment l'auteur veut que les visuels de sa publication soient PRÉSENTÉS**
 * (#6514) — miroir de `MosaicLayoutMode` (`CanvasV3.swift`) et de
 * `MosaicLayoutModeSchema` (`packages/shared/types/canvas-v3.ts`).
 *
 * C'est une décision d'AUTEUR, qui voyage avec la publication
 * (`storyEffects.layout`, document canvas v3) : deux lecteurs doivent voir la
 * même mise en page. La calculer ici d'après le nombre de médias ou la largeur
 * de l'écran rendrait deux réponses pour un même post.
 */
@Serializable(with = MosaicLayoutModeSerializer::class)
enum class MosaicLayoutMode(val wireName: String) {
    /** Hauteurs qui ondulent sur une rangée centrée. */
    WAVE("wave"),

    /** Une grande tuile, les autres en colonne à côté. */
    HERO("hero"),

    /** Défilement horizontal qui déborde, comme les réels. */
    REEL("reel"),

    /** Une en haut, une en bas, une en haut, une en bas. */
    SINE("sine"),

    /** Une page par visuel : le seul mode PAGINÉ, et le défaut. */
    CAROUSEL("carousel"),
    ;

    companion object {
        /**
         * Le défaut de TOUT le corpus : aucune publication antérieure au
         * 2026-09-06 ne porte d'agencement (`MosaicLayoutMode.fallback`).
         */
        val FALLBACK: MosaicLayoutMode = CAROUSEL

        /** Une valeur inconnue, écrite par un client plus récent, retombe sur le défaut. */
        fun fromWire(raw: String?): MosaicLayoutMode =
            entries.firstOrNull { it.wireName == raw } ?: FALLBACK
    }
}

/**
 * Le décodage est TOLÉRANT, comme `MosaicLayoutMode.init(from:)` : une valeur
 * inconnue ou mal typée ne fait pas échouer le document canvas entier. Un post
 * rendu dans une autre disposition coûte moins qu'un post qui ne rend rien.
 */
object MosaicLayoutModeSerializer : KSerializer<MosaicLayoutMode> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("me.meeshy.sdk.model.MosaicLayoutMode", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): MosaicLayoutMode {
        val raw = when (decoder) {
            is JsonDecoder -> (decoder.decodeJsonElement() as? JsonPrimitive)?.takeIf { it.isString }?.content
            else -> decoder.decodeString()
        }
        return MosaicLayoutMode.fromWire(raw)
    }

    override fun serialize(encoder: Encoder, value: MosaicLayoutMode) {
        encoder.encodeString(value.wireName)
    }
}

/**
 * **La disposition à EMPLOYER** : celle de l'auteur, ou le carrousel. Miroir de
 * `CanvasV3.resolvedLayout`. Les consommateurs l'appellent plutôt que de
 * coalescer chacun de leur côté, sans quoi deux vues auraient deux défauts.
 */
val StoryEffects?.resolvedLayout: MosaicLayoutMode
    get() = this?.layout ?: MosaicLayoutMode.FALLBACK
