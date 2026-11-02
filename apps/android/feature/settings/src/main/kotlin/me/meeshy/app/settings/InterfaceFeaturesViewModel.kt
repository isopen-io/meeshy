package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlag
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlags
import me.meeshy.sdk.reading.LentilleFeatureFlagsStore
import javax.inject.Inject

/**
 * Les trois interrupteurs Lentille / modes de lecture / Rivière (iOS `SettingsView.interfaceFeatureRows`).
 * Réglés sur l'appareil seulement : le magasin publie le nouvel état à l'instant et l'écrit en
 * arrière-plan, le fil de discussion relit les mêmes clés à la prochaine ouverture de conversation.
 */
@HiltViewModel
class InterfaceFeaturesViewModel @Inject constructor(
    private val store: LentilleFeatureFlagsStore,
) : ViewModel() {

    val flags: StateFlow<LentilleFeatureFlags> = store.flags

    fun setEnabled(flag: LentilleFeatureFlag, enabled: Boolean) {
        if (store.flags.value.isEnabled(flag) == enabled) return
        store.setEnabled(flag, enabled)
    }
}
