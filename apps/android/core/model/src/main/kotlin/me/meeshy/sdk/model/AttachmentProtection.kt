package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Ce que la pièce jointe DIT d'elle-même : `Masked` (au moins un canal masque),
 * `Open` (elle a déclaré au moins un canal et aucun ne masque) ou `Undeclared` (le
 * fil ne dit RIEN sur ses trois canaux).
 *
 * `Undeclared` n'est pas « ordinaire » : une ligne de cache écrite avant que le
 * modèle ne porte ces champs ne prouve rien, pas plus qu'une charge dont le
 * `select` ne les a pas chargés.
 */
enum class AttachmentProtectionVerdict { Open, Masked, Undeclared }

/**
 * LA PROTECTION DÉCLARÉE SUR LA PIÈCE JOINTE ELLE-MÊME — miroir de
 * `packages/shared/utils/attachment-protection.ts` (le TypeScript fait foi) et de
 * `APIMessageAttachment.declaredProtection` (iOS).
 *
 * Une pièce porte SES PROPRES `isViewOnce` / `isBlurred` / `effectFlags`,
 * indépendants de ceux du message qui la porte. Les trois canaux sont un OU, jamais
 * une cascade : une charge qui ne porterait que le bitfield est retenue quand même,
 * et seuls les bits MASQUANTS (vue unique, flou) comptent — les autres sont
 * décoratifs. `isEncrypted` n'est PAS lu : le chiffrement d'une pièce est un mode
 * de transport, pas un masque d'affichage.
 *
 * **Fermée par défaut.** Sur un secret le doute se tranche fermé :
 *  - [isProtected] vaut `true` tant que le fil n'a pas PROUVÉ la pièce ordinaire
 *    (`Open`) ; `Undeclared` est donc protégée ;
 *  - une valeur du MAUVAIS TYPE sur un canal ne vient pas de la passerelle, elle ne
 *    prouve rien : elle se décode FERMÉE ([ProtectionBooleanSerializer],
 *    [ProtectionFlagsSerializer]) au lieu de faire tomber la pièce — ou, pire, de
 *    la laisser passer pour ordinaire ;
 *  - [declaredProtection] est l'inverse volontaire : `null` sur le silence, jamais
 *    un `false` fabriqué (« nil se laisse corriger »), pour un site qui grave la
 *    protection (citation) et doit pouvoir la corriger plus tard.
 */
object AttachmentProtection {

    /** Les bits qui MASQUENT le fichier : vue unique et flou. */
    const val MASKING_FLAGS: Long = MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.BLURRED

    fun verdict(isViewOnce: Boolean?, isBlurred: Boolean?, effectFlags: Long?): AttachmentProtectionVerdict {
        val masked = isViewOnce == true || isBlurred == true || ((effectFlags ?: 0L) and MASKING_FLAGS) != 0L
        if (masked) return AttachmentProtectionVerdict.Masked
        val silent = isViewOnce == null && isBlurred == null && effectFlags == null
        return if (silent) AttachmentProtectionVerdict.Undeclared else AttachmentProtectionVerdict.Open
    }

    /** `true` sauf si la pièce a prouvé qu'elle est ordinaire : le doute est protégé. */
    fun isProtected(isViewOnce: Boolean?, isBlurred: Boolean?, effectFlags: Long?): Boolean =
        verdict(isViewOnce, isBlurred, effectFlags) != AttachmentProtectionVerdict.Open

    /** `true` masquée, `false` déclarée ordinaire, `null` quand le fil ne dit rien. */
    fun declaredProtection(isViewOnce: Boolean?, isBlurred: Boolean?, effectFlags: Long?): Boolean? =
        when (verdict(isViewOnce, isBlurred, effectFlags)) {
            AttachmentProtectionVerdict.Masked -> true
            AttachmentProtectionVerdict.Open -> false
            AttachmentProtectionVerdict.Undeclared -> null
        }
}

val ApiMessageAttachment.protectionVerdict: AttachmentProtectionVerdict
    get() = AttachmentProtection.verdict(isViewOnce, isBlurred, effectFlags)

/** `true` tant que la pièce n'a pas prouvé qu'elle est ordinaire — le doute est protégé. */
val ApiMessageAttachment.isProtected: Boolean
    get() = AttachmentProtection.isProtected(isViewOnce, isBlurred, effectFlags)

/** `true` masquée, `false` déclarée ordinaire, `null` quand le fil ne dit rien. */
val ApiMessageAttachment.declaredProtection: Boolean?
    get() = AttachmentProtection.declaredProtection(isViewOnce, isBlurred, effectFlags)

/** Les booléens du modèle de domaine sont toujours posés : le verdict n'est jamais `Undeclared`. */
val MeeshyMessageAttachment.protectionVerdict: AttachmentProtectionVerdict
    get() = AttachmentProtection.verdict(isViewOnce, isBlurred, effectFlags)

val MeeshyMessageAttachment.isProtected: Boolean
    get() = AttachmentProtection.isProtected(isViewOnce, isBlurred, effectFlags)

/**
 * Canal booléen de protection (`isViewOnce`, `isBlurred`) décodé FERMÉ : absent ou
 * `null` reste `null` (le silence), un vrai booléen JSON garde son sens, TOUT AUTRE
 * type vaut `true` — jamais une pièce perdue, jamais une pièce ouverte sur la foi
 * d'une chaîne `"false"` ou d'un `0` (`chargeConforme` côté TypeScript).
 */
object ProtectionBooleanSerializer : KSerializer<Boolean?> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): Boolean? {
        val input = decoder as? JsonDecoder
            ?: return decoder.decodeSerializableValue(Boolean.serializer().nullable)
        val element = input.decodeJsonElement()
        if (element is JsonNull) return null
        if (element !is JsonPrimitive || element.isString) return true
        return element.booleanOrNull ?: true
    }

    override fun serialize(encoder: Encoder, value: Boolean?) {
        if (value == null) encoder.encodeNull() else encoder.encodeBoolean(value)
    }
}

/**
 * Canal bitfield de protection (`effectFlags`) décodé FERMÉ : absent ou `null` reste
 * `null`, un entier JSON garde sa valeur (un `UInt32` y tient, d'où le `Long`), TOUT
 * AUTRE type — chaîne, fraction, objet — vaut [AttachmentProtection.MASKING_FLAGS].
 */
object ProtectionFlagsSerializer : KSerializer<Long?> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): Long? {
        val input = decoder as? JsonDecoder
            ?: return decoder.decodeSerializableValue(Long.serializer().nullable)
        val element = input.decodeJsonElement()
        if (element is JsonNull) return null
        if (element !is JsonPrimitive || element.isString) return AttachmentProtection.MASKING_FLAGS
        return element.longOrNull ?: AttachmentProtection.MASKING_FLAGS
    }

    override fun serialize(encoder: Encoder, value: Long?) {
        if (value == null) encoder.encodeNull() else encoder.encodeLong(value)
    }
}
