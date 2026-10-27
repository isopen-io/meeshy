package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.audio.AudioPreferencesStore
import me.meeshy.sdk.audio.AudioPreferencesSyncRepository
import me.meeshy.sdk.outbox.OutboxFlushWorker
import javax.inject.Inject

/**
 * La transcription automatique des vocaux entrants (iOS `SettingsView.transcriptionSection`,
 * `audio.autoTranscribeIncoming`). Le magasin local se peint à l'instant (optimiste), puis le choix
 * part en file durable vers `PATCH /me/preferences/audio` ; le réveil du worker n'a lieu que si une
 * ligne a vraiment été mise en file. À l'ouverture, le bloc est relu depuis la passerelle (un autre
 * appareil a pu le changer), sans jamais écraser un choix encore en attente d'envoi.
 */
@HiltViewModel
class TranscriptionSettingsViewModel @Inject constructor(
    private val store: AudioPreferencesStore,
    private val syncRepository: AudioPreferencesSyncRepository,
    private val workManager: WorkManager,
) : ViewModel() {

    val autoTranscribeIncoming: StateFlow<Boolean> = store.preferences
        .map { it.autoTranscribeIncoming }
        .stateIn(viewModelScope, SharingStarted.Eagerly, store.preferences.value.autoTranscribeIncoming)

    init {
        viewModelScope.launch { syncRepository.refresh() }
    }

    fun setAutoTranscribeIncoming(enabled: Boolean) {
        viewModelScope.launch {
            val current = store.preferences.value
            if (current.autoTranscribeIncoming == enabled) return@launch
            val updated = current.copy(autoTranscribeIncoming = enabled)
            store.setPreferences(updated)
            val cmid = syncRepository.enqueueSync(updated)
            if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
        }
    }
}
