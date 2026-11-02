package me.meeshy.sdk.model.appearance

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Le fond d'une conversation (#10631, spec § 5.4) — miroir de `ConversationBackground` (Swift) et de
 * `packages/shared/types/conversation-appearance.ts`, qui fait foi.
 */
sealed interface ConversationBackground {
    data object Signature : ConversationBackground
    data class Design(val pack: String, val design: String) : ConversationBackground
    data class Solid(val color: String) : ConversationBackground
    data class Photo(val attachmentId: String, val veil: Double, val blur: Int) : ConversationBackground

    companion object {
        const val PHOTO_VEIL_MAX: Double = 0.8
        const val PHOTO_VEIL_STEP: Double = 0.05
        const val PHOTO_BLUR_MAX: Int = 24

        /** Un voile ne se règle que par pas de 0,05 (le contrat serveur refuse les autres valeurs). */
        fun steppedVeil(veil: Double): Double {
            val clamped = min(max(veil, 0.0), PHOTO_VEIL_MAX)
            return (clamped / PHOTO_VEIL_STEP).roundToInt() * 5 / 100.0
        }
    }
}

/**
 * Le fond ET l'accent PERSONNELS d'une conversation : un choix du lecteur, stocké sur SA ligne de préférences et
 * synchronisé entre SES appareils, jamais partagé avec les autres membres. Lecture TOLÉRANTE PAR CHAMP ([read]) :
 * un fond d'une passerelle plus récente retombe sur Signature sans perdre l'accent, et inversement. Absent ⇔ Signature.
 *
 * Immuable : chaque choix rend une NOUVELLE valeur ([withSignature], [withPhotoVeil]…) ; un choix qui ne change rien
 * rend la même instance — l'appelant n'écrit alors rien au serveur.
 */
data class ConversationAppearance(
    val background: ConversationBackground = ConversationBackground.Signature,
    /** Clé de la gamme ; `null` = l'accent calculé de la conversation (« Automatique »). */
    val accent: String? = null,
    /** La couche animée facultative ; ignorée sous « Réduire les animations ». */
    val animate: Boolean = true,
) {
    val isDefault: Boolean get() = this == DEFAULT

    fun withSignature(): ConversationAppearance = copy(background = ConversationBackground.Signature)

    fun withDesign(pack: String, design: String): ConversationAppearance =
        copy(background = ConversationBackground.Design(pack, design))

    fun withSolid(color: String): ConversationAppearance = copy(background = ConversationBackground.Solid(color))

    /** Une photo arrive avec le voile et le flou de la précédente, sinon (0,3 ; 0). */
    fun withPhoto(attachmentId: String): ConversationAppearance {
        val current = background as? ConversationBackground.Photo
        return copy(background = ConversationBackground.Photo(attachmentId, current?.veil ?: DEFAULT_PHOTO_VEIL, current?.blur ?: 0))
    }

    /** Le même cran, à l'arrondi flottant près, n'est pas un nouveau choix : la même instance revient. */
    fun withPhotoVeil(veil: Double): ConversationAppearance {
        val photo = background as? ConversationBackground.Photo ?: return this
        val stepped = ConversationBackground.steppedVeil(veil)
        if (abs(stepped - photo.veil) < ConversationBackground.PHOTO_VEIL_STEP / 2) return this
        return copy(background = photo.copy(veil = stepped))
    }

    fun withPhotoBlur(blur: Int): ConversationAppearance {
        val photo = background as? ConversationBackground.Photo ?: return this
        val clamped = min(max(blur, 0), ConversationBackground.PHOTO_BLUR_MAX)
        return if (clamped == photo.blur) this else copy(background = photo.copy(blur = clamped))
    }

    fun withAccent(key: String?): ConversationAppearance = if (key == accent) this else copy(accent = key)

    /** Le corps que la passerelle valide en STRICT : `accent` est un `null` EXPLICITE, jamais omis. */
    fun toWire(): JsonObject = JsonObject(
        mapOf(
            "v" to JsonPrimitive(VERSION),
            "background" to background.toWire(),
            "accent" to (accent?.let(::JsonPrimitive) ?: JsonNull),
            "animate" to JsonPrimitive(animate),
        ),
    )

    companion object {
        const val VERSION: Int = 1
        const val DEFAULT_PHOTO_VEIL: Double = 0.3
        val DEFAULT = ConversationAppearance()

        /**
         * Lecture TOLÉRANTE PAR CHAMP : une valeur qui n'est pas un objet rend le défaut ; un fond illisible
         * rend Signature ; un accent hors gamme ([isGamutKey]) rend « Automatique ». Jamais une conversation illisible.
         */
        fun read(element: JsonElement?, isGamutKey: (String) -> Boolean = { it.isNotEmpty() }): ConversationAppearance {
            val record = element as? JsonObject ?: return DEFAULT
            val accentKey = (record["accent"] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull
            return ConversationAppearance(
                background = readBackground(record["background"]) ?: ConversationBackground.Signature,
                accent = accentKey?.takeIf(isGamutKey),
                animate = (record["animate"] as? JsonPrimitive)?.booleanOrNull ?: true,
            )
        }

        private fun readBackground(element: JsonElement?): ConversationBackground? {
            val record = element as? JsonObject ?: return null
            fun text(key: String): String? = (record[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull
            return when (text("kind")) {
                "signature" -> ConversationBackground.Signature
                "design" -> ConversationBackground.Design(text("pack") ?: return null, text("design") ?: return null)
                "solid" -> ConversationBackground.Solid(text("color") ?: return null)
                "photo" -> {
                    val veil = (record["veil"] as? JsonPrimitive)?.doubleOrNull ?: return null
                    val blur = (record["blur"] as? JsonPrimitive)?.intOrNull ?: return null
                    ConversationBackground.Photo(
                        attachmentId = text("attachmentId") ?: return null,
                        veil = min(max(veil, 0.0), ConversationBackground.PHOTO_VEIL_MAX),
                        blur = min(max(blur, 0), ConversationBackground.PHOTO_BLUR_MAX),
                    )
                }
                else -> null
            }
        }

        private fun ConversationBackground.toWire(): JsonObject = JsonObject(
            when (this) {
                ConversationBackground.Signature -> mapOf("kind" to JsonPrimitive("signature"))
                is ConversationBackground.Design -> mapOf("kind" to JsonPrimitive("design"), "pack" to JsonPrimitive(pack), "design" to JsonPrimitive(design))
                is ConversationBackground.Solid -> mapOf("kind" to JsonPrimitive("solid"), "color" to JsonPrimitive(color))
                is ConversationBackground.Photo -> mapOf(
                    "kind" to JsonPrimitive("photo"),
                    "attachmentId" to JsonPrimitive(attachmentId),
                    "veil" to JsonPrimitive(veil),
                    "blur" to JsonPrimitive(blur),
                )
            },
        )
    }
}
