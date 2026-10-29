package me.meeshy.app.calls

import android.content.Context
import android.content.SharedPreferences
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.call.CallPreviewConsent
import me.meeshy.sdk.model.call.CallPreviewRequested
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.socket.CallSocialSignalManager
import javax.inject.Inject
import javax.inject.Singleton

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

/**
 * La mémoire de l'appareil, un choix par (compte, correspondant) — iOS `CallPreviewConsentStore` :
 * un autre compte connecté sur le même téléphone ne rejoue jamais ceux du premier. Un correspondant
 * jamais appelé rend [CallPreviewConsent.INITIAL].
 */
@Singleton
class SharedPreferencesCallPreviewConsentStore internal constructor(
    private val preferences: () -> SharedPreferences,
) : CallPreviewConsentStoring {

    @Inject
    constructor(@ApplicationContext context: Context) :
        this({ context.getSharedPreferences(FILE, Context.MODE_PRIVATE) })

    private val prefs by lazy(preferences)

    override fun consent(localUserId: String, peerUserId: String): CallPreviewConsent {
        val entry = entry(localUserId, peerUserId)
        if (!prefs.contains(entry + AUDIO)) return CallPreviewConsent.INITIAL
        return CallPreviewConsent(
            sendsAudio = prefs.getBoolean(entry + AUDIO, CallPreviewConsent.INITIAL.sendsAudio),
            sendsVideo = prefs.getBoolean(entry + VIDEO, CallPreviewConsent.INITIAL.sendsVideo),
        )
    }

    override fun remember(consent: CallPreviewConsent, localUserId: String, peerUserId: String) {
        val entry = entry(localUserId, peerUserId)
        prefs.edit()
            .putBoolean(entry + AUDIO, consent.sendsAudio)
            .putBoolean(entry + VIDEO, consent.sendsVideo)
            .apply()
    }

    private fun entry(localUserId: String, peerUserId: String) = "$localUserId|$peerUserId"

    private companion object {
        const val FILE = "meeshy.call.previewConsents"
        const val AUDIO = ".audio"
        const val VIDEO = ".video"
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallPreviewModule {
    @Binds
    fun bindLinks(impl: WebRtcCallPreviewLinkFactory): CallPreviewLinkFactory

    @Binds
    fun bindSignaling(impl: SocketCallPreviewSignaling): CallPreviewSignaling

    @Binds
    fun bindConsents(impl: SharedPreferencesCallPreviewConsentStore): CallPreviewConsentStoring
}
