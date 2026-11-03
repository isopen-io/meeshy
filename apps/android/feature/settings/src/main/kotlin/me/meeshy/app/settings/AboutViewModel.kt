package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.DeviceMediaTierSource
import me.meeshy.sdk.model.media.DeviceMediaTier

/**
 * Lit le niveau média de l'appareil pour la ligne « Profil média » de À propos. La première lecture
 * énumère les décodeurs matériels : elle part hors du fil principal, et la ligne apparaît dès qu'elle
 * rend (le reste de la page ne l'attend pas).
 */
@HiltViewModel
class AboutViewModel @Inject constructor(
    private val tierSource: DeviceMediaTierSource,
) : ViewModel() {

    private val _mediaTier = MutableStateFlow<DeviceMediaTier?>(null)
    val mediaTier: StateFlow<DeviceMediaTier?> = _mediaTier.asStateFlow()

    init {
        viewModelScope.launch(Dispatchers.Default) {
            _mediaTier.value = runCatching { tierSource.current() }.getOrNull()
        }
    }
}
