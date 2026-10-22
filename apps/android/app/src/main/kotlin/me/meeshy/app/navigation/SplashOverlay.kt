package me.meeshy.app.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.delay
import me.meeshy.app.BuildConfig
import me.meeshy.app.R
import me.meeshy.ui.component.chrome.MeeshySplashScreen

/**
 * Floor duration the branded [MeeshySplashScreen] stays up on cold start — parity with iOS
 * `MeeshyApp.swift`'s `minSplashDuration` (1.2s), which exists so the animation never flashes
 * away before it can register on a hot-cache launch. Android's `AuthViewModel.isAuthenticated`
 * is resolved synchronously at construction (no async "session check" phase to additionally
 * gate on the way iOS's `.task` block does — cache hydration + socket handshake), so this is a
 * pure minimum-display-duration floor, not a readiness gate; deferred as a documented follow-up
 * once Android grows an equivalent async boot sequence worth waiting on.
 */
internal const val SPLASH_MIN_DURATION_MS = 1200L

/**
 * Branded splash: shown ALWAYS on cold start (parity iOS `MeeshyApp.swift`'s `showSplash`),
 * for a minimum floor duration so it never flashes away. `rememberSaveable` would survive
 * process death into a fresh cold start showing no splash at all, which defeats the purpose,
 * so this stays a plain `remember`: a configuration change (rotation) keeps it, a real
 * process restart correctly shows it again.
 */
@Composable
internal fun SplashOverlay() {
    var showSplash by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        delay(SPLASH_MIN_DURATION_MS)
        showSplash = false
    }
    if (showSplash) {
        MeeshySplashScreen(
            tagline = stringResource(R.string.splash_tagline),
            versionLabel = stringResource(
                R.string.splash_version_label,
                BuildConfig.VERSION_NAME,
                BuildConfig.VERSION_CODE.toString(),
            ),
            credit = stringResource(R.string.brand_signature_credit),
            modifier = Modifier.fillMaxSize(),
        )
    }
}
