package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.call.TelecomSystemRequest

/** Qui est au bout de l'appel, pour que le système l'affiche (nom, adresse, audio ou vidéo, sens). */
data class TelecomCallInfo(
    val peerId: String,
    val peerName: String,
    val isVideo: Boolean,
    val isOutgoing: Boolean,
)

/**
 * The output seam for OS-level call reporting: it turns the decisions of the
 * pure [me.meeshy.sdk.model.call.TelecomCallPolicy] into telecom reports.
 * Isolating it behind an interface keeps every *decision* (which connection
 * state, which disconnect cause, when to report) in the tested policy + the
 * [CallViewModel] fold, and leaves the concrete reporter as thin, decision-free
 * platform glue — so the VM's telecom behaviour is asserted through a recording
 * fake, no device required.
 *
 * [report] is only called by the VM on a genuine transition (the policy dedupes
 * inert edges to `null`), so the implementation may assume each call is a real
 * connection change.
 */
interface TelecomCallReporter {
    /** Un appel naît : le système apprend qui appelle ou qui est appelé, avant le premier [report]. */
    fun begin(call: TelecomCallInfo) = Unit

    /** Report a genuine connection [update] to the OS telecom layer. */
    fun report(update: TelecomConnectionUpdate)

    /** Le média circule : c'est ici, pas au décroché, que le chrono système démarre. */
    fun onMediaConnected() = Unit

    /** Ce que le système demande à l'appel (décrocher, raccrocher, attente, micro). Vide hors téléphonie. */
    val requests: Flow<TelecomSystemRequest> get() = emptyFlow()

    /** Tear down the telecom connection — called when the call surface is torn down. */
    fun release()
}

@Module
@InstallIn(SingletonComponent::class)
interface TelecomCallModule {
    @Binds
    fun bindTelecomCallReporter(impl: CoreTelecomCallReporter): TelecomCallReporter

    @Binds
    fun bindTelecomCallsGateway(impl: JetpackTelecomCallsGateway): TelecomCallsGateway

    @Binds
    fun bindTelecomPlatformSupport(impl: AndroidTelecomPlatformSupport): TelecomPlatformSupport
}
