package me.meeshy.app.reels

import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.ReelPreloadWindow
import me.meeshy.sdk.model.call.ThermalState
import me.meeshy.sdk.model.media.DeviceMediaSignals
import me.meeshy.sdk.model.media.DeviceMediaTier
import me.meeshy.sdk.model.playback.ReelTransferPolicy

/** Ce que le système dit de l'appareil, en valeurs brutes : la lecture est faite ailleurs, la loi ici. */
internal data class ReelPreloadInputs(
    val dataSaverEnabled: Boolean,
    val powerSaveMode: Boolean,
    /** `PowerManager.THERMAL_STATUS_*` (0 quand le capteur est illisible). */
    val thermalStatus: Int,
    val isLowRamDevice: Boolean,
    val totalMemBytes: Long,
    val memoryClassMb: Int,
    val condition: NetworkCondition,
    val tier: DeviceMediaTier?,
)

/**
 * **Les contraintes de l'appareil qui bornent la fenêtre de préchargement** (iOS `ReelPreloadWindow.Context`) :
 * Data Saver, économie d'énergie, chaleur, mémoire comptée, classe d'appareil et réseau facturé deviennent le
 * contexte de [ReelPreloadWindow]. Pure : le plancher N-2…N+2 reste, les contraintes ne font que plafonner.
 */
internal object ReelPreloadConstraints {

    fun network(inputs: ReelPreloadInputs): ReelPreloadWindow.Network =
        ReelPreloadWindow.Network.fromPath(isExpensive = isCellular(inputs.condition), isConstrained = inputs.dataSaverEnabled)

    fun context(inputs: ReelPreloadInputs, visits: List<ReelPreloadWindow.Visit>): ReelPreloadWindow.Context =
        ReelPreloadWindow.Context(
            visits = visits,
            network = network(inputs),
            deviceMemoryGb = DeviceMediaSignals.memoryGb(
                totalMemBytes = inputs.totalMemBytes,
                memoryClassMb = inputs.memoryClassMb,
                isLowRamDevice = inputs.isLowRamDevice,
            ),
            lowPower = inputs.powerSaveMode,
            thermalState = ThermalState.fromAndroidThermalStatus(inputs.thermalStatus),
            tier = inputs.tier,
        )

    /**
     * Le fichier d'un palier a-t-il le droit de partir ? Hors ligne, jamais ; sur cellulaire, les paliers
     * immédiats (play, decode, mount) partent, « prime » et « idle » seulement si le réglage vidéo autorise le cellulaire.
     */
    fun mayTransfer(tier: ReelPreloadWindow.Tier, condition: NetworkCondition, videoPolicy: AutoDownloadPolicy): Boolean {
        if (condition == NetworkCondition.OFFLINE) return false
        if (!isCellular(condition)) return true
        return ReelTransferPolicy.profile(tier, videoPolicy).allowsExpensiveNetworkAccess
    }

    private fun isCellular(condition: NetworkCondition): Boolean =
        condition == NetworkCondition.GOOD_CELLULAR || condition == NetworkCondition.BAD_CELLULAR
}
