package me.meeshy.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.app.navigation.LaunchExtras
import me.meeshy.app.navigation.LaunchRouter
import me.meeshy.app.navigation.MeeshyApp
import me.meeshy.app.push.MeeshyFcmService
import me.meeshy.app.theme.ThemeViewModel
import me.meeshy.sdk.model.resolveDarkMode
import me.meeshy.ui.theme.MeeshyTheme

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private var launchRoute by mutableStateOf<String?>(null)
    private val themeViewModel: ThemeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        launchRoute = LaunchRouter.route(intent.launchExtras())
        setContent {
            val themeMode by themeViewModel.themeMode.collectAsStateWithLifecycle()
            MeeshyTheme(darkTheme = themeMode.resolveDarkMode(isSystemInDarkTheme())) {
                MeeshyApp(
                    launchRoute = launchRoute,
                    onLaunchRouteConsumed = { launchRoute = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        launchRoute = LaunchRouter.route(intent.launchExtras())
    }
}

/**
 * Thin platform glue: pull the notification extras [MeeshyFcmService] set on the
 * launch/full-screen intent into the pure [LaunchExtras] the [LaunchRouter] decodes.
 */
private fun Intent.launchExtras(): LaunchExtras = LaunchExtras(
    callId = getStringExtra(MeeshyFcmService.EXTRA_CALL_ID),
    conversationId = getStringExtra(MeeshyFcmService.EXTRA_CONVERSATION_ID),
    callerName = getStringExtra(MeeshyFcmService.EXTRA_CALLER_NAME),
    isVideo = getBooleanExtra(MeeshyFcmService.EXTRA_IS_VIDEO, false),
)
