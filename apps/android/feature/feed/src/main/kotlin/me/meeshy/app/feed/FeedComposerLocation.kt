package me.meeshy.app.feed

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import me.meeshy.sdk.location.awaitFreshLocationFix
import me.meeshy.sdk.model.SharedPlace

/**
 * The feed composer's location tile: one fresh GPS/network fix via `android.location.LocationManager`,
 * no Play Services dependency. Independent of the media cap and upload gate — only guarded against a
 * concurrent capture of its own.
 */
internal class FeedLocationCapture(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onPlace: () -> (SharedPlace) -> Unit,
    private val onUnavailable: () -> () -> Unit,
) {
    var isCapturing: Boolean by mutableStateOf(false)
        private set
    internal var askPermission: () -> Unit = {}

    fun request() {
        val granted = LOCATION_PERMISSIONS.any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
        if (granted) capture() else askPermission()
    }

    fun capture() {
        if (isCapturing) return
        scope.launch {
            isCapturing = true
            val fix = context.awaitFreshLocationFix()
            isCapturing = false
            if (fix != null) onPlace()(SharedPlace(latitude = fix.latitude, longitude = fix.longitude)) else onUnavailable()()
        }
    }

    fun denied() = onUnavailable()()

    companion object {
        val LOCATION_PERMISSIONS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
}

@Composable
internal fun rememberFeedLocationCapture(onPlace: (SharedPlace) -> Unit, onUnavailable: () -> Unit): FeedLocationCapture {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val place by rememberUpdatedState(onPlace)
    val unavailable by rememberUpdatedState(onUnavailable)
    val location = remember { FeedLocationCapture(context, scope, { place }, { unavailable }) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        if (FeedLocationCapture.LOCATION_PERMISSIONS.any { results[it] == true }) location.capture() else location.denied()
    }
    location.askPermission = { permission.launch(FeedLocationCapture.LOCATION_PERMISSIONS) }
    return location
}
