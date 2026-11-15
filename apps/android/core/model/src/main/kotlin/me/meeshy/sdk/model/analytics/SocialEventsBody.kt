package me.meeshy.sdk.model.analytics

import kotlinx.serialization.Serializable

/**
 * Le corps de `POST /social/events` : `{events, context:{sentAt, consent}}`.
 *
 * `sentAt` est l'heure de l'APPAREIL au départ du lot (la passerelle corrige le décalage
 * d'horloge par `sentAt − occurredAt`) ; `consent` est le consentement d'analyse, absent
 * quand aucune source n'est installée. Un serveur antérieur supprime ces clés sans erreur.
 */
@Serializable
data class SocialEventsBody(
    val events: List<StampedSocialEvent>,
    val context: Context,
) {
    @Serializable
    data class Context(
        val sentAt: String,
        val consent: Consent? = null,
    )

    @Suppress("EnumEntryName")
    @Serializable
    enum class Consent { granted, denied, unknown }

    companion object {
        fun of(events: List<StampedSocialEvent>, sentAtMs: Long, consent: Consent? = null): SocialEventsBody =
            SocialEventsBody(events, Context(IsoUtc.format(sentAtMs), consent))
    }
}
