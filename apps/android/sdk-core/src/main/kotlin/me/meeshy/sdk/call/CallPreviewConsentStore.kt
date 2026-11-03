package me.meeshy.sdk.call

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.call.CallPreviewConsent
import java.util.concurrent.ConcurrentHashMap

/** Le choix de l'appelant, retenu par (compte, correspondant) — iOS `CallPreviewConsentStoring`. */
interface CallPreviewConsentStoring {
    fun consent(localUserId: String, peerUserId: String): CallPreviewConsent

    fun remember(consent: CallPreviewConsent, localUserId: String, peerUserId: String)
}

internal fun callPreviewAudioKey(localUserId: String, peerUserId: String) = "call.preview.audio.$localUserId|$peerUserId"

internal fun callPreviewVideoKey(localUserId: String, peerUserId: String) = "call.preview.video.$localUserId|$peerUserId"

/** [CallPreviewConsentStoring] volatile — tests et aperçus. */
class InMemoryCallPreviewConsentStore : CallPreviewConsentStoring {
    private val values = ConcurrentHashMap<Pair<String, String>, CallPreviewConsent>()

    override fun consent(localUserId: String, peerUserId: String): CallPreviewConsent =
        values[localUserId to peerUserId] ?: CallPreviewConsent.INITIAL

    override fun remember(consent: CallPreviewConsent, localUserId: String, peerUserId: String) {
        values[localUserId to peerUserId] = consent
    }
}

/**
 * La mémoire de l'appareil, un choix par couple (compte, correspondant), adossée à un Preferences
 * [DataStore] — iOS `CallPreviewConsentStore` : un autre compte connecté sur le même téléphone ne
 * rejoue jamais les choix du premier. Un correspondant jamais appelé rend
 * [CallPreviewConsent.INITIAL] (micro coupé, caméra activée).
 *
 * L'aperçu décide de façon synchrone à la sonnerie : la lecture attend le fichier (déjà en mémoire
 * après la première), et l'écriture, confiée à [scope], reste lisible aussitôt par [pending].
 */
class DataStoreCallPreviewConsentStore(
    private val dataStore: DataStore<Preferences>,
    private val scope: CoroutineScope,
) : CallPreviewConsentStoring {
    private val pending = ConcurrentHashMap<Pair<String, String>, CallPreviewConsent>()

    override fun consent(localUserId: String, peerUserId: String): CallPreviewConsent {
        pending[localUserId to peerUserId]?.let { return it }
        val prefs = runBlocking { dataStore.data.first() }
        val audio = prefs[booleanPreferencesKey(callPreviewAudioKey(localUserId, peerUserId))]
        val video = prefs[booleanPreferencesKey(callPreviewVideoKey(localUserId, peerUserId))]
        if (audio == null && video == null) return CallPreviewConsent.INITIAL
        return CallPreviewConsent(
            sendsAudio = audio ?: CallPreviewConsent.INITIAL.sendsAudio,
            sendsVideo = video ?: CallPreviewConsent.INITIAL.sendsVideo,
        )
    }

    override fun remember(consent: CallPreviewConsent, localUserId: String, peerUserId: String) {
        val couple = localUserId to peerUserId
        pending[couple] = consent
        scope.launch {
            dataStore.edit {
                it[booleanPreferencesKey(callPreviewAudioKey(localUserId, peerUserId))] = consent.sendsAudio
                it[booleanPreferencesKey(callPreviewVideoKey(localUserId, peerUserId))] = consent.sendsVideo
            }
            pending.remove(couple, consent)
        }
    }
}
