package me.meeshy.sdk.audio

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.AudioPreferenceSyncBody
import me.meeshy.sdk.model.AudioPreferences
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Synchronisation durable du bloc audio (`PATCH /me/preferences/audio`), sur le patron de
 * `PrivacyPreferencesSyncRepository` : le magasin local reste la source de vérité de l'écran, la
 * file ne porte que le dernier instantané (une rafale hors ligne se réduit à un seul PATCH) et
 * survit à la mort du processus. Sans session : inerte, rend `null`.
 */
@Singleton
public class AudioPreferencesSyncRepository @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val outboxRepository: OutboxRepository,
    private val preferencesApi: PreferencesApi,
    private val store: AudioPreferencesStore,
) {
    /** @return le `cmid` de la ligne mise en file, ou `null` hors session ou si elle a été supplantée. */
    public suspend fun enqueueSync(preferences: AudioPreferences): String? {
        val userId = sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_AUDIO_SETTINGS,
                lane = OutboxLanes.SETTINGS,
                targetId = userId,
                payload = MeeshyApi.json.encodeToString(AudioPreferenceSyncBody.from(preferences)),
            ),
        )
    }

    /**
     * Replace le bloc local sur la valeur de la passerelle — ce qu'un autre appareil a changé, ou
     * le retour arrière d'un envoi refusé. Saute la relecture tant qu'un envoi attend : elle
     * écraserait un choix que cet appareil n'a pas encore poussé. Une file illisible vaut « attend ».
     */
    public suspend fun refresh() {
        val owesAWrite = try {
            outboxRepository.hasDeliverable(OutboxLanes.SETTINGS, OutboxKind.UPDATE_AUDIO_SETTINGS)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            Timber.w(error, "Outbox illisible : relecture des préférences audio sautée")
            true
        }
        if (owesAWrite) return
        when (val result = apiCall { preferencesApi.getAudio() }) {
            is NetworkResult.Success -> store.setPreferences(result.data.toPreferences(store.preferences.value))
            is NetworkResult.Failure -> Timber.w("Relecture des préférences audio échouée : %s", result.error.message)
        }
    }

    /**
     * Relit le bloc à chaque compte qui s'ouvre (démarrage à froid, connexion, changement de compte) —
     * iOS `UserPreferencesManager` le recharge à la connexion. Sans elle, la bulle d'un vocal reçu
     * suivrait le défaut local tant que l'écran des Réglages n'a pas été ouvert : un choix fait sur
     * iOS ou le web, ou le bloc du compte suivant après un changement de compte, resterait ignoré. Une déconnexion
     * (`null`) suivie d'une reconnexion au même compte relit aussi : la déconnexion a remis le bloc aux défauts.
     */
    public suspend fun refreshOnEachAccount(accountIds: Flow<String?>) {
        accountIds.distinctUntilChanged().filterNotNull().collect { refresh() }
    }
}
