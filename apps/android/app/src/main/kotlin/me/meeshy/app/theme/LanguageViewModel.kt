package me.meeshy.app.theme

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.language.InterfaceLanguageStore
import javax.inject.Inject

/**
 * Exposes the persisted interface-language preference to the activity so the whole app
 * re-localises the instant the user changes it in Settings, and paints the stored choice
 * on cold start (no flash of the wrong language). The preference is a supported language
 * code, or `null` to follow the device locale ("System"); the resolution to an effective
 * locale tag stays in the pure `AppLanguage.resolveInterfaceLocaleTag`.
 */
@HiltViewModel
class LanguageViewModel @Inject constructor(
    interfaceLanguageStore: InterfaceLanguageStore,
) : ViewModel() {
    val languageCode: StateFlow<String?> = interfaceLanguageStore.languageCode
}
