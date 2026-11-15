package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.call.CallPreviewRequested
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.socket.CallSocialSignalManager
import javax.inject.Inject

/** L'aperçu sur la socket : `call:preview-request` / `-requested` / `-signal`, hors de `call:signal`. */
class SocketCallPreviewSignaling @Inject constructor(
    private val social: CallSocialSignalManager,
) : CallPreviewSignaling {
    override val requested: Flow<CallPreviewRequested> get() = social.previewRequested

    override val signals: Flow<CallSignalEnvelope> get() = social.previewSignals

    override fun request(callId: String) {
        social.requestCallPreview(callId)
    }

    override fun emit(callId: String, type: String, from: String, to: String, negotiationId: Int, fields: Map<String, Any?>) {
        social.emitCallPreviewSignal(callId, type, from, to, negotiationId, fields)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallPreviewModule {
    @Binds
    fun bindLinks(impl: WebRtcCallPreviewLinkFactory): CallPreviewLinkFactory

    @Binds
    fun bindSignaling(impl: SocketCallPreviewSignaling): CallPreviewSignaling
}
