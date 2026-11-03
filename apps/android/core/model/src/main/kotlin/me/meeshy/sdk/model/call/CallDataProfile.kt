package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.screenshare.VideoDegradation

/**
 * Opus en codec de VOIX (iOS `CallAudioBudget`) : mono, DTX (le silence ne coûte rien) et FEC en bande (un paquet
 * perdu se reconstruit depuis le suivant), débit moyen borné.
 */
data class CallAudioBudget(val maxAverageBitrateBps: Int) {
    fun capping(bitrateBps: Int): Int = minOf(maxAverageBitrateBps, bitrateBps)

    val fmtpParameters: List<String>
        get() = listOf(
            "maxaveragebitrate=$maxAverageBitrateBps",
            "stereo=0",
            "sprop-stereo=0",
            "useinbandfec=1",
            "usedtx=1",
            "maxplaybackrate=$OPUS_MAX_PLAYBACK_RATE_HZ",
        )

    companion object {
        /** `maxaveragebitrate` d'Opus voix sur Wi-Fi : 32 kb/s mono est transparent pour la parole. */
        const val WIFI_MAX_AVERAGE_BITRATE_BPS: Int = 32_000

        /** Plancher de l'encodeur audio : le plafond dégradé ne descend jamais dessous. */
        const val CODEC_FLOOR_BITRATE_BPS: Int = 16_000

        /** Bande complète, la cadence native d'Opus. */
        const val OPUS_MAX_PLAYBACK_RATE_HZ: Int = 48_000
    }
}

data class CallDataBudget(val video: CallVideoBudget, val audio: CallAudioBudget)

/**
 * Combien de données un appel peut dépenser (iOS `CallDataProfile`, #8697). Le chemin choisit Wi-Fi, cellulaire ou
 * économie de données ; un lien pauvre prend le pas sur les trois avec [DEGRADED], et seul un BON lien le lève (un tick
 * moyen garde le palier courant : l'encodeur ne bat pas la campagne à la frontière).
 */
enum class CallDataProfile(val wireName: String) {
    WIFI("wifi"),
    CELLULAR("cellular"),
    DATA_SAVER("dataSaver"),
    DEGRADED("degraded"),
    ;

    val budget: CallDataBudget
        get() = when (this) {
            WIFI -> CallDataBudget(
                CallVideoBudget(1_500_000, 30, 1.0, VideoDegradation.MaintainFramerate),
                CallAudioBudget(CallAudioBudget.WIFI_MAX_AVERAGE_BITRATE_BPS),
            )
            CELLULAR -> CallDataBudget(
                CallVideoBudget(600_000, 24, 1.5, VideoDegradation.MaintainFramerate),
                CallAudioBudget(24_000),
            )
            DATA_SAVER -> CallDataBudget(
                CallVideoBudget(250_000, 15, 2.0, VideoDegradation.MaintainResolution),
                CallAudioBudget(20_000),
            )
            DEGRADED -> CallDataBudget(
                CallVideoBudget(150_000, 15, 2.0, VideoDegradation.MaintainResolution),
                CallAudioBudget(CallAudioBudget.CODEC_FLOOR_BITRATE_BPS),
            )
        }

    companion object {
        fun resolve(path: CallNetworkPath, heuristic: VideoQualityLevel, current: CallDataProfile): CallDataProfile = when {
            heuristic <= VideoQualityLevel.POOR -> DEGRADED
            current == DEGRADED && heuristic < VideoQualityLevel.GOOD -> DEGRADED
            path.isConstrained -> DATA_SAVER
            path.isExpensive -> CELLULAR
            else -> WIFI
        }

        /** Le profil nommé dans le journal réseau (`CallNetworkEventKind.Profile.name`), `null` si inconnu. */
        fun fromWireName(name: String): CallDataProfile? = entries.firstOrNull { it.wireName == name }
    }
}
