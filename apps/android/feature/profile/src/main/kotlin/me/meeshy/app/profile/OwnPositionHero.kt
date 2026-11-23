package me.meeshy.app.profile

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.app.contacts.circles.LocationMapDialog
import me.meeshy.feature.profile.R
import me.meeshy.sdk.location.awaitFreshLocationFix
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.ProfileOwnPositionPreview
import me.meeshy.sdk.relation.SharedLocationSharing

/** Ma dernière position connue et l'instant de ce relevé. */
data class OwnKnownPosition(val point: GeoPoint, val atMillis: Long)

/**
 * Ma dernière position connue (#20199, #20242, iso `OwnLastPositionReader`) : le dernier relevé de l'appareil tout de suite,
 * quel que soit son âge, puis — quand ma position part et que la permission est DÉJÀ accordée — un relevé silencieux si le
 * cache manque ou date de plus de dix minutes. Jamais de demande de permission.
 */
@HiltViewModel
class OwnPositionHeroViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    sharing: SharedLocationSharing,
) : ViewModel() {

    /** Les personnes à qui ma position part en ce moment. */
    val recipients: StateFlow<Int> = sharing.roster
        .map { it.pruned(System.currentTimeMillis()).recipients.size }
        .stateIn(viewModelScope, SharingStarted.Eagerly, sharing.roster.value.pruned(System.currentTimeMillis()).recipients.size)

    private val _known = MutableStateFlow(lastKnown())
    val known: StateFlow<OwnKnownPosition?> = _known.asStateFlow()

    fun refresh(sharing: Boolean) {
        viewModelScope.launch {
            _known.value = withContext(Dispatchers.IO) { lastKnown() } ?: _known.value
            val now = System.currentTimeMillis()
            if (!ProfileOwnPositionPreview.needsSilentFix(sharing, authorized(), _known.value?.atMillis, now)) return@launch
            val fix = context.awaitFreshLocationFix() ?: return@launch
            _known.value = OwnKnownPosition(GeoPoint(fix.latitude, fix.longitude), System.currentTimeMillis())
        }
    }

    private fun authorized(): Boolean = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        .any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

    @SuppressLint("MissingPermission")
    private fun lastKnown(): OwnKnownPosition? {
        if (!authorized()) return null
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        return listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
            .maxByOrNull { it.time }
            ?.let { OwnKnownPosition(GeoPoint(it.latitude, it.longitude), it.time) }
    }
}

/**
 * Ma fiche (#20199, #20242) : le bloc héros de MA dernière position connue, avec son heure, seulement quand ma position
 * part et que l'appareil en connaît une — jamais une carte vide. Le toucher ouvre la carte de mes proches.
 */
@Composable
internal fun OwnPositionHero(viewModel: OwnPositionHeroViewModel = hiltViewModel()) {
    val recipients by viewModel.recipients.collectAsStateWithLifecycle()
    val known by viewModel.known.collectAsStateWithLifecycle()
    var isOpen by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(recipients > 0) { viewModel.refresh(sharing = recipients > 0) }
    val preview = ProfileOwnPositionPreview.resolve(recipients, isGhost = false, fix = known?.point, atMillis = known?.atMillis)
    if (preview is ProfileOwnPositionPreview.Map) {
        ProfileWhereHero(
            title = stringResource(R.string.profile_where_own_title),
            point = preview.fix,
            atMillis = preview.atMillis,
            onTap = { isOpen = true },
        )
    }
    if (isOpen) LocationMapDialog(focusUserId = null, displayName = null, onClose = { isOpen = false })
}
