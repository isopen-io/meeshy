package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.model.appearance.AppearanceCatalog

/** Le catalogue embarqué des bannières et cadres, chargé une fois hors du fil principal. */
@HiltViewModel
class ProfileBannerViewModel @Inject constructor(
    loader: AppearanceCatalogLoader,
) : ViewModel() {
    val catalog: StateFlow<AppearanceCatalog?> = loader.state

    init {
        viewModelScope.launch { runCatching { loader.catalog() } }
    }
}
