package me.meeshy.sdk.voice

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.audio.AudioPreferencesStore
import me.meeshy.sdk.audio.AudioPreferencesSyncRepository
import me.meeshy.sdk.model.voice.ConsentPurpose
import me.meeshy.sdk.net.NetworkResult

interface VoiceConsentGateProviding {
    val isKnownGranted: Boolean

    /** `true` si le consentement MANQUE ; `false` sur toute erreur (fail-safe : jamais de fausse alerte). */
    suspend fun fetchMissing(): Boolean

    /** Accorde le consentement de traduction automatique vocale ; lève si la passerelle ne le confirme pas. */
    suspend fun grant()
}

class VoiceConsentNotGrantedException(message: String) : Exception(message)

/**
 * Le consentement au clonage vocal, lu et octroyé — miroir de `VoiceConsentGate` (iOS) : les consentements CONFIRMÉS par
 * la passerelle d'abord (`PUT`/`GET /me/consents`), le statut REST du profil vocal en repli pour un compte dont la
 * relecture n'a pas encore eu lieu sur cet appareil.
 */
@Singleton
class VoiceConsentGate @Inject constructor(
    private val consents: ConsentsRepository,
    private val store: GrantedConsentsStore,
    private val profiles: VoiceProfileRepository,
    private val audioPreferences: AudioPreferencesStore,
    private val audioSync: AudioPreferencesSyncRepository,
) : VoiceConsentGateProviding {

    override val isKnownGranted: Boolean
        get() = ConsentPurpose.VOICE_PROFILE in store.granted.value

    override suspend fun fetchMissing(): Boolean {
        if (isKnownGranted) return false
        return missing {
            when (val status = profiles.consentStatus()) {
                is NetworkResult.Success -> status.data.hasConsent
                is NetworkResult.Failure -> throw FetchFailed()
            }
        }
    }

    override suspend fun grant() {
        when (val result = consents.grant(ConsentPurpose.VOICE_CLONING)) {
            is NetworkResult.Failure -> throw VoiceConsentNotGrantedException(result.error.message)
            is NetworkResult.Success -> enableAudioFeatures()
        }
    }

    private suspend fun enableAudioFeatures() {
        val updated = audioPreferences.preferences.value.copy(
            transcriptionEnabled = true,
            audioTranslationEnabled = true,
            ttsEnabled = true,
            voiceProfileEnabled = true,
        )
        audioPreferences.setPreferences(updated)
        audioSync.enqueueSync(updated)
    }

    private class FetchFailed : Exception()

    companion object {
        /** Pure : transforme un relevé de `hasConsent` en « manque », fail-safe à `false` sur toute erreur. */
        suspend fun missing(fetchHasConsent: suspend () -> Boolean): Boolean =
            try {
                !fetchHasConsent()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                false
            }
    }
}
