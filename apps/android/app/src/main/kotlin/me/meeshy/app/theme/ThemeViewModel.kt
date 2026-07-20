package me.meeshy.app.theme

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.theme.ThemeStore
import javax.inject.Inject

/**
 * Exposes the persisted appearance preference to the activity so the whole app
 * re-themes instantly when the user changes it in Settings, and paints the stored
 * choice on cold start (no flash of the wrong theme). The light/dark resolution
 * against the platform setting stays in the pure `AppThemeMode.resolveDarkMode`.
 */
@HiltViewModel
class ThemeViewModel @Inject constructor(
    themeStore: ThemeStore,
) : ViewModel() {
    val themeMode: StateFlow<AppThemeMode> = themeStore.themeMode
}
