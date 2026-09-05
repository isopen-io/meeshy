package me.meeshy.app

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import me.meeshy.app.navigation.LaunchExtras
import me.meeshy.app.navigation.LaunchRouter
import me.meeshy.app.navigation.MeeshyApp
import me.meeshy.app.push.MeeshyFcmService
import me.meeshy.app.shortcuts.DynamicShortcutsPublisher
import me.meeshy.app.theme.LanguageViewModel
import me.meeshy.app.theme.ThemeViewModel
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.AppLanguage
import me.meeshy.sdk.model.resolveDarkMode
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.theme.MeeshyTheme
import java.util.Locale
import javax.inject.Inject
import me.meeshy.sdk.chrome.FloatingButtonPositionStore
import me.meeshy.sdk.net.SessionExpiryNotifier

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    /**
     * Ou l'utilisateur a range ses deux boutons flottants. Injecte ici et passe a
     * [MeeshyApp] : c'est un singleton Hilt, pas un ViewModel.
     */
    @Inject
    lateinit var floatingButtonPositions: FloatingButtonPositionStore

    /** Emet quand la passerelle refuse l'identite : [MeeshyApp] y deconnecte. */
    @Inject
    lateinit var sessionExpiry: SessionExpiryNotifier

    /** Source des raccourcis dynamiques du lanceur (voir [onResume]). */
    @Inject
    lateinit var conversationRepository: ConversationRepository

    @Inject
    lateinit var sessionRepository: SessionRepository

    private var launchRoute by mutableStateOf<String?>(null)
    private val themeViewModel: ThemeViewModel by viewModels()
    private val languageViewModel: LanguageViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        // Must run BEFORE super.onCreate — installs the system pre-Compose splash
        // (Theme.Meeshy.Starting) so a cold start never flashes a blank window
        // before the branded, animated MeeshySplashScreen (:sdk-ui) takes over
        // inside the Compose tree (see themes.xml + MeeshyApp.kt).
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        launchRoute = LaunchRouter.route(intent.launchExtras()) ?: LaunchRouter.routeForDeepLink(intent.dataString)
        setContent {
            val themeMode by themeViewModel.themeMode.collectAsStateWithLifecycle()
            val languageCode by languageViewModel.languageCode.collectAsStateWithLifecycle()
            LocalizedContent(languageCode = languageCode) {
                MeeshyTheme(darkTheme = themeMode.resolveDarkMode(isSystemInDarkTheme())) {
                    MeeshyApp(
                        floatingButtonPositions = floatingButtonPositions,
                        sessionExpiry = sessionExpiry,
                        launchRoute = launchRoute,
                        onLaunchRouteConsumed = { launchRoute = null },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        launchRoute = LaunchRouter.route(intent.launchExtras()) ?: LaunchRouter.routeForDeepLink(intent.dataString)
    }

    /**
     * Republishes the launcher's dynamic shortcuts (long-press the launcher icon)
     * from whatever is currently Room-cached — cheap, idempotent (`setDynamicShortcuts`
     * fully replaces the set), so a stale entry from a since-deleted/renamed
     * conversation self-corrects on the very next resume rather than needing a
     * dedicated live-update hook.
     */
    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            DynamicShortcutsPublisher.publish(
                context = this@MainActivity,
                conversations = conversationRepository.recentCachedConversations(),
                currentUserId = sessionRepository.currentUserId,
            )
        }
    }
}

/**
 * Applies the persisted interface-language preference app-wide by re-localising the
 * [Context]/[Configuration] the whole Compose tree resolves `stringResource`s against.
 *
 * The *decision* — which locale tag to force, or `null` to leave the device locale in
 * place — lives in the pure, tested [AppLanguage.resolveInterfaceLocaleTag]. When the
 * preference is "System" (`null`) the original context is used unchanged, so a device
 * locale the app has no translation for still falls back through Android's own resource
 * resolution. Works on every supported API level (minSdk 26) with no extra dependency.
 */
@androidx.compose.runtime.Composable
private fun LocalizedContent(
    languageCode: String?,
    content: @androidx.compose.runtime.Composable () -> Unit,
) {
    val tag = AppLanguage.resolveInterfaceLocaleTag(languageCode)
    val baseContext = LocalContext.current
    val baseConfiguration = LocalConfiguration.current

    if (tag == null) {
        content()
        return
    }

    val localizedContext = remember(tag, baseContext, baseConfiguration) {
        val locale = Locale.forLanguageTag(tag)
        Locale.setDefault(locale)
        val configuration = Configuration(baseConfiguration).apply { setLocale(locale) }
        baseContext.createConfigurationContext(configuration)
    }
    val localizedConfiguration = remember(tag, baseConfiguration) {
        Configuration(baseConfiguration).apply { setLocale(Locale.forLanguageTag(tag)) }
    }

    CompositionLocalProvider(
        LocalContext provides localizedContext,
        LocalConfiguration provides localizedConfiguration,
    ) {
        content()
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
    autoAnswer = getBooleanExtra(MeeshyFcmService.EXTRA_AUTO_ANSWER, false),
)
