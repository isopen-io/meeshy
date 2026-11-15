package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.appearance.ServedAppearanceContractStore
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ProfileDecorResolver

/**
 * Le catalogue des bannières, cadres et contours, chargé une fois hors du fil principal — embarqué, complété des contrats
 * servis (#16265). Un décor adressé par contrat que le catalogue ne peint pas encore se demande par [request] : le
 * contrat vérifié arrive, le catalogue se complète, la bannière se repeint.
 */
@HiltViewModel
class ProfileBannerViewModel @Inject constructor(
    loader: AppearanceCatalogLoader,
    private val served: ServedAppearanceContractStore,
) : ViewModel() {
    val catalog: StateFlow<AppearanceCatalog?> = loader.state

    init {
        viewModelScope.launch { runCatching { loader.catalog() } }
    }

    fun request(decor: ServedProfileDecor) {
        val current = catalog.value ?: return
        ProfileDecorResolver.missingContracts(decor, current).forEach(served::request)
    }
}
