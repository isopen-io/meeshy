package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.MeeshyMediaConsumption

/**
 * **La réhydratation multi-appareil de la reprise média** — port de `MediaResumeResolver` d'iOS
 * (#7212), pour l'audio ET la vidéo, qui ne diffèrent que par la PAIRE de champs servis.
 *
 * Deux magasins existent pour une pièce jointe : le magasin LOCAL des positions (par appareil) et la
 * valeur SERVIE (`currentUserConsumption`, que la passerelle tient depuis tous les appareils du
 * compte). La règle de lecture est une PRÉCÉDENCE, pas un maximum : le local, dès qu'il porte une
 * valeur — même hors zone de reprise —, garde la main ; le serveur ne comble que son ABSENCE.
 * À l'ÉCRITURE en revanche (amorçage d'un magasin durable), [newest] prend la position la plus
 * RÉCENTE : une reprise plus récente gagne, d'où qu'elle vienne.
 */
public object MediaResumeMerge {

    public enum class Medium { Audio, Video }

    /** Une position mémorisée avec l'instant (epoch ms) où elle l'a été. */
    public data class StampedPosition(val positionMs: Long, val savedAtEpochMs: Long)

    /** La position la plus récente ; à égalité d'instant, [first] (le local) garde la main. */
    public fun newest(first: StampedPosition?, second: StampedPosition?): StampedPosition? = when {
        first == null -> second
        second == null -> first
        second.savedAtEpochMs > first.savedAtEpochMs -> second
        else -> first
    }

    /**
     * La consommation DÉTENUE par un moteur, ou `null` quand elle qualifie une AUTRE pièce jointe que
     * celle chargée : les moteurs sont partagés et changent de piste sous la surface qui les a nourris.
     */
    public fun heldConsumption(
        heldAttachmentId: String?,
        held: MeeshyMediaConsumption?,
        matching: String,
    ): MeeshyMediaConsumption? = if (heldAttachmentId == matching) held else null

    public fun servedPositionMs(consumption: MeeshyMediaConsumption?, medium: Medium): Long? = when (medium) {
        Medium.Audio -> consumption?.lastPlayPositionMs
        Medium.Video -> consumption?.lastWatchPositionMs
    }?.toLong()

    public fun servedComplete(consumption: MeeshyMediaConsumption?, medium: Medium): Boolean = when (medium) {
        Medium.Audio -> consumption?.listenedComplete
        Medium.Video -> consumption?.watchedComplete
    } ?: false

    /**
     * La fraction « au repos » (0..1) qui teinte la forme d'onde avant la lecture. [localFraction] gagne
     * dès qu'il est non nul — y compris 0, une valeur locale légitime —, le serveur ne comble que
     * l'absence : complétion = 1, sinon position servie sur la durée.
     */
    public fun restingFraction(
        localFraction: Double?,
        served: MeeshyMediaConsumption?,
        medium: Medium,
        totalMs: Long,
    ): Double {
        if (localFraction != null) return localFraction.coerceIn(0.0, 1.0)
        if (servedComplete(served, medium)) return 1.0
        val positionMs = servedPositionMs(served, medium)
        if (positionMs == null || totalMs <= 0L) return 0.0
        return (positionMs.toDouble() / totalMs).coerceIn(0.0, 1.0)
    }

    /**
     * Le point de reprise (ms) filtré par la zone morte. Le local gagne dès qu'il existe : hors zone,
     * c'est `null`, pas un repli sur le serveur. Un média terminé ailleurs n'offre pas de reprise.
     */
    public fun resumePositionMs(
        localMs: Long?,
        served: MeeshyMediaConsumption?,
        medium: Medium,
        totalMs: Long,
        isEligible: (Long, Long) -> Boolean = PlaybackResumeDeadZone::isResumable,
    ): Long? {
        if (localMs != null) return localMs.takeIf { isEligible(it, totalMs) }
        if (servedComplete(served, medium)) return null
        val servedMs = servedPositionMs(served, medium) ?: return null
        return servedMs.takeIf { isEligible(it, totalMs) }
    }
}
