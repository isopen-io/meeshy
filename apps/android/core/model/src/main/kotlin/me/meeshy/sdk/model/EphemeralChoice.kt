package me.meeshy.sdk.model

/**
 * Ce que l'auteur choisit au sélecteur d'éphémère — miroir de iOS `EphemeralChoice`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralChoice.swift`, #8303).
 *
 * La flamme-œil n'est PAS une durée : le message disparaît chez chaque lecteur quand il
 * l'a vu puis a quitté la conversation, et seuls les bits `EPHEMERAL` +
 * `EPHEMERAL_AFTER_READ` voyagent. D'où un type somme plutôt qu'un cas de plus dans
 * [EphemeralDuration], dont chaque valeur EST un nombre de secondes.
 */
sealed interface EphemeralChoice {
    data object AfterRead : EphemeralChoice

    data class Duration(val duration: EphemeralDuration) : EphemeralChoice

    companion object {
        /** L'ordre du sélecteur : la flamme-œil, puis 15 s, puis les durées. */
        val menu: List<EphemeralChoice> = listOf(AfterRead) + EphemeralDuration.entries.map(::Duration)

        /** Le choix armé dans [effects], ou `null` quand l'éphémère n'est pas armé (ou sans durée connue). */
        fun of(effects: MessageEffects): EphemeralChoice? = when {
            !effects.has(MessageEffectFlags.EPHEMERAL) -> null
            effects.has(MessageEffectFlags.EPHEMERAL_AFTER_READ) -> AfterRead
            else -> EphemeralDuration.fromSeconds(effects.ephemeralDuration)?.let(::Duration)
        }
    }
}
