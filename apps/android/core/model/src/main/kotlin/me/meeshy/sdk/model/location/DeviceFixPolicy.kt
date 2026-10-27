package me.meeshy.sdk.model.location

import me.meeshy.sdk.model.MeeshyLocationCoordinate

/** Une position déjà connue du système, avec son âge au moment de la lecture. */
data class KnownFix(val coordinate: MeeshyLocationCoordinate, val ageMillis: Long)

/**
 * Quelle position retenir sans attendre de nouveau relevé. En intérieur le GPS ne répond pas : le
 * fournisseur réseau ou la dernière position connue servent la carte tout de suite (iOS
 * CoreLocation rend la position Wi-Fi), le relevé frais ne vient qu'en second.
 */
object DeviceFixPolicy {

    /** Une position de moins de deux minutes tient lieu de relevé : la carte se centre sans attendre. */
    const val IMMEDIATE_MAX_AGE_MILLIS: Long = 120_000L

    /** Au-delà de ce délai, une ancienne position n'est plus un repli honnête. */
    const val FALLBACK_MAX_AGE_MILLIS: Long = 1_800_000L

    /** La plus précise des positions assez récentes pour être servie tout de suite, ou `null`. */
    fun immediate(known: List<KnownFix>): MeeshyLocationCoordinate? =
        known.filter { it.ageMillis in 0..IMMEDIATE_MAX_AGE_MILLIS }
            .minByOrNull { it.coordinate.accuracy ?: Double.MAX_VALUE }
            ?.coordinate

    /** Après l'échec du relevé frais : la plus récente des positions encore plausibles, ou `null`. */
    fun fallback(known: List<KnownFix>): MeeshyLocationCoordinate? =
        known.filter { it.ageMillis in 0..FALLBACK_MAX_AGE_MILLIS }
            .minWithOrNull(compareBy<KnownFix> { it.ageMillis }.thenBy { it.coordinate.accuracy ?: Double.MAX_VALUE })
            ?.coordinate
    /** Silence du GPS au-delà duquel le réseau reprend la main pendant le partage en direct. */
    const val STREAM_GPS_SILENCE_MILLIS: Long = 15_000L

    /**
     * Pendant le partage en direct, GPS et réseau sont écoutés ensemble pour que l'intérieur ne
     * reste pas muet ; un relevé réseau (moins précis) ne s'intercale jamais entre deux relevés GPS
     * — la position partagée ne saute pas de plusieurs dizaines de mètres toutes les cinq secondes,
     * et le débit émis ne double pas. Il ne passe que si le GPS se tait depuis
     * [STREAM_GPS_SILENCE_MILLIS] (horloge monotone).
     */
    fun streamKeeps(fromGps: Boolean, lastGpsAtMillis: Long?, nowMillis: Long): Boolean =
        fromGps || lastGpsAtMillis == null || nowMillis - lastGpsAtMillis >= STREAM_GPS_SILENCE_MILLIS
}
