package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.call.CallDataProfileFeed
import me.meeshy.sdk.call.CallNetworkPathMonitor
import me.meeshy.sdk.call.CallQualityStatsFeed
import me.meeshy.sdk.call.DataProfileSdpTransformer
import me.meeshy.sdk.call.LocalSdpTransformer
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallDataProfile
import me.meeshy.sdk.model.call.CallDataProfileState
import me.meeshy.sdk.model.call.CallNetworkPath
import me.meeshy.sdk.model.call.CallQualityTick
import me.meeshy.sdk.model.call.CallVideoBudget
import javax.inject.Inject

/**
 * Le profil de données d'un appel (#8697), miroir de iOS `WebRTCService.refreshDataProfile` : le chemin du système et
 * l'heuristique de chaque tick choisissent Wi-Fi, cellulaire, économie de données ou dégradé ([CallDataProfileState] porte
 * la loi et son hystérésis). Ce contrôleur n'en est que l'actionneur : il pose le profil sur le SDP local — dès la TOUTE
 * PREMIÈRE offre, le chemin étant lu avant elle —, le plafond audio sur l'émetteur, publie le profil pour la feuille de
 * qualité et le journal réseau, et dit à l'appelant de réécrire l'encodeur vidéo ([onChanged]) quand le profil change.
 */
class CallDataProfileController internal constructor(
    private val ticks: Flow<CallQualityTick>,
    private val paths: Flow<CallNetworkPath>,
    private val currentPath: () -> CallNetworkPath,
    private val publish: (CallDataProfile?) -> Unit,
    private val installTransformer: (LocalSdpTransformer) -> Unit,
    private val setAudioCeiling: (Int) -> Unit,
) {
    @Inject
    constructor(
        feed: CallQualityStatsFeed,
        monitor: CallNetworkPathMonitor,
        profiles: CallDataProfileFeed,
        engine: WebRtcEngine,
    ) : this(
        ticks = feed.ticks,
        paths = monitor.paths,
        currentPath = monitor::current,
        publish = profiles::publish,
        installTransformer = { engine.localSdpTransformer = it },
        setAudioCeiling = engine::setAudioMaxBitrate,
    )

    private val transformer = DataProfileSdpTransformer()
    private var state = CallDataProfileState()
    private val jobs = mutableListOf<Job>()

    /** Le profil a changé : l'encodeur vidéo se réécrit sous le nouveau plafond. */
    var onChanged: () -> Unit = {}

    /** Le plafond du profil courant sur un palier de la caméra (le plus sobre des deux sur chaque axe). */
    fun capVideo(budget: CallVideoBudget): CallVideoBudget = state.profile.budget.video.capping(budget)

    fun begin(scope: CoroutineScope) {
        end()
        state = CallDataProfileState.starting(currentPath())
        transformer.profile = state.profile
        installTransformer(transformer)
        publish(state.profile)
        setAudioCeiling(state.audioCeilingBps)
        jobs += paths.onEach { move(state.onPath(it)) }.launchIn(scope)
        jobs += ticks.onEach { move(state.onSample(it.rttMs, it.packetLossPercent / PERCENT, it.jitterMs)) }.launchIn(scope)
    }

    fun end() {
        if (jobs.isEmpty()) return
        jobs.forEach { it.cancel() }
        jobs.clear()
        state = CallDataProfileState()
        transformer.profile = CallDataProfile.WIFI
        installTransformer(LocalSdpTransformer.Identity)
        publish(null)
    }

    @Synchronized
    private fun move(next: CallDataProfileState) {
        val profileChanged = next.profile != state.profile
        val audioChanged = next.audioCeilingBps != state.audioCeilingBps
        state = next
        if (profileChanged) {
            transformer.profile = next.profile
            publish(next.profile)
        }
        if (audioChanged) setAudioCeiling(next.audioCeilingBps)
        if (profileChanged) onChanged()
    }

    private companion object {
        const val PERCENT = 100.0
    }
}
