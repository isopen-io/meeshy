package me.meeshy.app.contacts.circles

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.relation.SharedLocationsMap
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA CARTE D'UNE PERSONNE, comme destination (#20540, iso `PersonLocationMapScreen`) : le toucher d'une alerte « un Sang
 * s'approche » — push, bandeau in-app ou ligne de la cloche — l'ouvre en plein écran sur [userId], cadrée sur elle et sur
 * moi. Une personne absente du magasin y déclenche un rattrapage ([SharedLocationsMapViewModel.ensure]) ; tant que rien
 * n'est servi, la feuille montre son état vide. La croix referme ([onClose]).
 */
@Composable
fun PersonLocationMapRoute(
    userId: String,
    onClose: () -> Unit,
    viewModel: SharedLocationsMapViewModel = hiltViewModel(),
) {
    LaunchedEffect(userId) { viewModel.ensure(userId) }
    Box(Modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundPrimary)) {
        LocationMapScreen(userId, null, onClose, LocationMapActions(), viewModel)
    }
}

/**
 * Ma position, telle que l'appareil la connaît DÉJÀ (iso `LocationMapOwnPosition.lastKnown`) : jamais de demande de
 * permission depuis la carte, jamais un relevé de plus d'une heure ([SharedLocationsMap.ownIfFresh]).
 */
@Composable
internal fun rememberOwnFramePoint(): GeoPoint? {
    val context = LocalContext.current
    return remember(context) { context.lastKnownOwnPoint() }
}

@SuppressLint("MissingPermission")
private fun Context.lastKnownOwnPoint(): GeoPoint? {
    val granted = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        .any { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }
    if (!granted) return null
    val manager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val latest = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
        .maxByOrNull { it.time } ?: return null
    return SharedLocationsMap.ownIfFresh(GeoPoint(latest.latitude, latest.longitude), latest.time, System.currentTimeMillis())
}
