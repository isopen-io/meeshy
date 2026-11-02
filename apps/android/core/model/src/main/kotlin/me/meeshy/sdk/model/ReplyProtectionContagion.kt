package me.meeshy.sdk.model

/**
 * **La contagion des protections par la réponse** (#8557) — miroir de `contaminateReplyProtection`
 * / `imposedReplyProtection` (`packages/shared/utils/reply-protection-contagion.ts`, que la
 * passerelle applique à tout envoi et qui fait foi) et de `ReplyProtectionContagion.swift`.
 *
 * - FLOU cité ⇒ la réponse est floue, sans pouvoir le retirer.
 * - ÉPHÉMÈRE cité ⇒ le MÊME mode : flamme-œil ⇒ flamme-œil, durée d ⇒ durée d. Le mode est IMPOSÉ.
 * - Ce que le cité ne porte pas s'AJOUTE librement ; la vue unique ne se transmet pas.
 * - Un bit `EPHEMERAL` sans durée ni flamme-œil ne transmet rien d'inventé.
 *
 * La citation impose ; elle ne touche jamais l'ARMEMENT persisté du composeur : [imposed] se lit à
 * l'envoi et au verrouillage, l'armement de l'auteur reste ce qu'il a choisi.
 */
object ReplyProtectionContagion {

    /** Les colonnes de protection d'un message, telles que le serveur les stocke. */
    data class Columns(
        val effectFlags: Long = 0L,
        val isBlurred: Boolean = false,
        val ephemeralDuration: Int? = null,
    )

    sealed interface ImposedEphemeral {
        data object AfterRead : ImposedEphemeral
        data class Duration(val seconds: Int) : ImposedEphemeral
    }

    /** Ce que le message cité IMPOSE à toute réponse — ce que le composeur verrouille. */
    data class Imposed(val blurred: Boolean, val ephemeral: ImposedEphemeral?) {
        val isEmpty: Boolean get() = !blurred && ephemeral == null

        companion object {
            val None: Imposed = Imposed(blurred = false, ephemeral = null)
        }
    }

    private const val EPHEMERAL_BITS: Long = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ

    private fun declaredDuration(value: Int?): Int? = value?.takeIf { it > 0 }

    private fun has(flags: Long, bit: Long): Boolean = (flags and bit) != 0L

    fun imposed(quoted: Columns?): Imposed {
        if (quoted == null) return Imposed.None
        val blurred = quoted.isBlurred || has(quoted.effectFlags, MessageEffectFlags.BLURRED)
        if (has(quoted.effectFlags, MessageEffectFlags.EPHEMERAL_AFTER_READ)) {
            return Imposed(blurred, ImposedEphemeral.AfterRead)
        }
        return Imposed(blurred, declaredDuration(quoted.ephemeralDuration)?.let { ImposedEphemeral.Duration(it) })
    }

    /** Les colonnes d'une réponse après contagion. [quoted] absent ⇒ la demande passe, recomposée. */
    fun contaminate(requested: Columns, quoted: Columns?): Columns {
        val imposed = imposed(quoted)
        val isBlurred = requested.isBlurred || has(requested.effectFlags, MessageEffectFlags.BLURRED) || imposed.blurred
        val requestedDuration = declaredDuration(requested.ephemeralDuration)
        val base = requested.effectFlags or (if (isBlurred) MessageEffectFlags.BLURRED else 0L)
        return when (val ephemeral = imposed.ephemeral) {
            null -> Columns(
                effectFlags = if (requestedDuration == null) base else base or MessageEffectFlags.EPHEMERAL,
                isBlurred = isBlurred,
                ephemeralDuration = requestedDuration,
            )
            ImposedEphemeral.AfterRead -> Columns(
                effectFlags = (base and EPHEMERAL_BITS.inv()) or EPHEMERAL_BITS,
                isBlurred = isBlurred,
                ephemeralDuration = null,
            )
            is ImposedEphemeral.Duration -> Columns(
                effectFlags = (base and EPHEMERAL_BITS.inv()) or MessageEffectFlags.EPHEMERAL,
                isBlurred = isBlurred,
                ephemeralDuration = ephemeral.seconds,
            )
        }
    }
}

/** Les colonnes de protection que ce message transmet à une réponse. */
val ApiMessage.replyProtectionColumns: ReplyProtectionContagion.Columns
    get() = ReplyProtectionContagion.Columns(
        effectFlags = effects.flags,
        isBlurred = isBlurred == true,
        ephemeralDuration = ephemeralDuration ?: effects.ephemeralDuration,
    )
