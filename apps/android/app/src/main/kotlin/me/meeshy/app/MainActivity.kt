package me.meeshy.app

import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
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
import me.meeshy.app.calls.CallPictureInPictureCoordinator
import me.meeshy.app.composer.inbound.ComposerSeedLaunch
import me.meeshy.app.composer.inbound.ComposerSeedStore
import me.meeshy.app.game.banner.gameProfileSlot
import me.meeshy.app.navigation.InboundIntentGate
import me.meeshy.app.navigation.LaunchExtras
import me.meeshy.app.navigation.LaunchRouter
import me.meeshy.app.navigation.MeeshyApp
import me.meeshy.app.navigation.ProvideRootSplash
import me.meeshy.app.navigation.VisitorContentPresenter
import me.meeshy.app.navigation.VisitorLinkGate
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.app.navigation.WarmDeepLink
import me.meeshy.app.push.LaunchIntentProof
import me.meeshy.app.push.MeeshyFcmService
import me.meeshy.app.push.PushTapExtras
import me.meeshy.app.shortcuts.DynamicShortcutsPublisher
import me.meeshy.app.theme.LanguageViewModel
import me.meeshy.app.theme.ThemeViewModel
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.AppLanguage
import me.meeshy.sdk.model.SystemBarsAppearance
import me.meeshy.sdk.model.call.CallLinkRequest
import me.meeshy.sdk.model.call.CallPictureInPicturePolicy
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.LocalPresenceStore
import me.meeshy.ui.profile.LocalProfileGameSlot
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

    /** La base d'API configuree : [LocalMediaBaseUrl] la fournit a tous les avatars (#12569). */
    @Inject
    lateinit var config: MeeshyConfig

    /** Source des raccourcis dynamiques du lanceur (voir [onResume]). */
    @Inject
    lateinit var conversationRepository: ConversationRepository

    @Inject
    lateinit var sessionRepository: SessionRepository

    /** La carte de présence unique de la session : [LocalPresenceStore] la fournit aux avatars. */
    @Inject
    lateinit var presenceStore: PresenceStore

    /** Le Picture-in-Picture de l'appel vidéo : l'activité fournit le geste, le coordinateur la règle. */
    @Inject
    lateinit var callPictureInPicture: CallPictureInPictureCoordinator

    /** La preuve que les extras d'appel d'un intent viennent d'une notification de Meeshy (#13504). */
    @Inject
    lateinit var launchProof: LaunchIntentProof

    /** Un lien reçu SANS session s'ouvre en lecture seule (#13464) : la carte invite à se connecter, le lien attend. */
    @Inject
    lateinit var visitorContent: VisitorContentPresenter

    @Inject
    lateinit var authRepository: AuthRepository

    @Inject
    lateinit var composerSeedStore: ComposerSeedStore

    private val gameSlot = gameProfileSlot()

    private var launchRoute by mutableStateOf<String?>(null)

    /** Un lien reçu app ouverte : [MeeshyApp] le rejoue dans la navigation (les navDeepLink ne lisent que le démarrage). */
    private var warmDeepLink by mutableStateOf<Uri?>(null)

    /** Le lien en attente est celui qu'un VISITEUR a ouvert : il attend un compte, une session d'invité ne le rejoue pas. */
    private var warmDeepLinkAwaitsAccount by mutableStateOf(false)

    /** Un lien d'appel (`meeshy://call`) : une DEMANDE que [MeeshyApp] présente en confirmation, jamais un appel. */
    private var callLink by mutableStateOf<CallLinkRequest?>(null)
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
        InboundIntentGate.admit(intent, launchProof::admits, composerSeedStore::holds)
        val restored = savedInstanceState != null
        launchRoute = LaunchRouter.onCreateRoute(launchRouteOf(intent), restored)
        if (!restored) divertVisitorLink(intent, atLaunch = true)
        // Restaurée, l'activité relit l'intent ORIGINAL : la demande d'appel a déjà été présentée, elle ne revient pas.
        callLink = callLinkOf(intent).takeUnless { restored }
        callPictureInPicture.attachActivity(
            supportsPip = packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE),
            enter = ::enterCallPictureInPicture,
            dismiss = { moveTaskToBack(false) },
        )
        setContent {
            val themeMode by themeViewModel.themeMode.collectAsStateWithLifecycle()
            val languageCode by languageViewModel.languageCode.collectAsStateWithLifecycle()
            val systemBars = SystemBarsAppearance.of(themeMode, isSystemInDarkTheme())
            // Les icônes de la barre d'état suivent le thème CHOISI dans l'app, pas seulement celui du système (#13666).
            DisposableEffect(systemBars) {
                applySystemBars(systemBars)
                onDispose {}
            }
            LocalizedContent(languageCode = languageCode) {
                MeeshyTheme(darkTheme = systemBars.darkTheme) {
                    CompositionLocalProvider(
                        LocalMediaBaseUrl provides config.apiBaseUrl,
                        LocalPresenceStore provides presenceStore,
                        // Le niveau et le rang d'un membre, posés sur sa bannière (iOS `ProfileSheetEnvironment`).
                        LocalProfileGameSlot provides gameSlot,
                    ) {
                        ProvideRootSplash {
                            MeeshyApp(
                                floatingButtonPositions = floatingButtonPositions,
                                sessionExpiry = sessionExpiry,
                                launchRoute = launchRoute,
                                onLaunchRouteConsumed = { launchRoute = null },
                                warmDeepLink = warmDeepLink,
                                warmDeepLinkAwaitsAccount = warmDeepLinkAwaitsAccount,
                                onWarmDeepLinkHandled = {
                                    warmDeepLink = null
                                    warmDeepLinkAwaitsAccount = false
                                },
                                callLink = callLink,
                                onCallLinkHandled = { callLink = null },
                            )
                        }
                    }
                }
            }
        }
    }

    private fun applySystemBars(appearance: SystemBarsAppearance) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { appearance.darkTheme },
            navigationBarStyle = SystemBarStyle.auto(NAVIGATION_SCRIM_LIGHT, NAVIGATION_SCRIM_DARK) { appearance.darkTheme },
        )
    }

    /**
     * La route de lancement d'un intent. Un lien d'e-mail a jeton (connexion, adresse, mot de passe) porte son
     * secret dans l'adresse de l'intent : la route le recueille, et l'intent est VIDE de son adresse aussitot, pour
     * que ni une restauration de l'activite ni une relecture ne rejoue un jeton a usage unique.
     */
    private fun launchRouteOf(intent: Intent): String? {
        val route = LaunchRouter.route(intent.launchExtras()) ?: LaunchRouter.routeForDeepLink(intent.dataString)
        if (LaunchRouter.opensWithoutSession(route)) intent.data = null
        return route
    }

    /** Un lien d'appel est une demande a usage unique : l'intent est vide de son adresse des qu'elle est recueillie. */
    private fun callLinkOf(intent: Intent): CallLinkRequest? =
        CallLinkRequest.parse(intent.dataString)?.also { intent.data = null }

    private fun enterCallPictureInPicture(): Boolean {
        val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(CallPictureInPicturePolicy.ASPECT_WIDTH, CallPictureInPicturePolicy.ASPECT_HEIGHT))
            .build()
        return runCatching { enterPictureInPictureMode(params) }.getOrDefault(false)
    }

    @Deprecated("ComponentActivity deprecates it; every activity launch still funnels through it")
    @Suppress("DEPRECATION")
    override fun startActivityForResult(intent: Intent, requestCode: Int, options: Bundle?) {
        callPictureInPicture.holdForInAppLaunch()
        try {
            super.startActivityForResult(intent, requestCode, options)
        } catch (failure: RuntimeException) {
            callPictureInPicture.releaseInAppLaunch()
            throw failure
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        callPictureInPicture.onUserLeaveHint()
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        callPictureInPicture.setInPip(isInPictureInPictureMode)
    }

    override fun onDestroy() {
        callPictureInPicture.detachActivity()
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        InboundIntentGate.admit(intent, launchProof::admits, composerSeedStore::holds)
        setIntent(intent)
        launchRoute = launchRouteOf(intent)
        callLink = callLinkOf(intent)
        warmDeepLink = if (launchRoute == null && callLink == null) WarmDeepLink.replayable(intent) else null
        warmDeepLinkAwaitsAccount = false
        divertVisitorLink(intent, atLaunch = false)
    }

    /**
     * Un lien de publication, de réel ou de story reçu sans session montre son contenu public (iOS `VisitorContentPresenter`).
     * Le lien reste EN ATTENTE (`warmDeepLink`, que la racine ne rejoue qu'une fois connectée) et, au démarrage à froid,
     * l'adresse est retirée de l'intent pour que le NavHost n'ouvre pas l'écran connecté d'un visiteur.
     */
    private fun divertVisitorLink(intent: Intent, atLaunch: Boolean) {
        val request = VisitorLinkGate.divert(intent, signedIn = authRepository.isAuthenticated) ?: return
        warmDeepLink = intent.data
        warmDeepLinkAwaitsAccount = true
        if (atLaunch) intent.data = null
        visitorContent.present(request)
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
        callPictureInPicture.releaseInAppLaunch()
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
 * The Activity stays the context's base ([localizedContext]) so links, shares and
 * permission prompts keep working when a language is forced.
 */
@androidx.compose.runtime.Composable
private fun LocalizedContent(
    languageCode: String?,
    content: @androidx.compose.runtime.Composable () -> Unit,
) {
    val tag = AppLanguage.resolveInterfaceLocaleTag(languageCode)
    val baseContext = LocalContext.current
    val baseConfiguration = LocalConfiguration.current
    val locale = remember(tag) { tag?.let(Locale::forLanguageTag) }
    if (locale != null) SideEffect { Locale.setDefault(locale) }
    val context = remember(tag, baseContext, baseConfiguration) {
        tag?.let { localizedContext(baseContext, it, baseConfiguration) } ?: baseContext
    }
    val localizedConfiguration = remember(locale, baseConfiguration) {
        locale?.let { Configuration(baseConfiguration).apply { setLocale(it) } } ?: baseConfiguration
    }

    // Toujours le même nœud : passer de « Système » à une langue ne recrée pas l'arbre,
    // donc la navigation reste sur l'écran où la langue a été choisie.
    CompositionLocalProvider(
        LocalContext provides context,
        LocalConfiguration provides localizedConfiguration,
    ) {
        content()
    }
}

/**
 * Thin platform glue: pull the notification extras [MeeshyFcmService] set on the
 * launch/full-screen intent into the pure [LaunchExtras] the [LaunchRouter] decodes.
 * Only read AFTER [InboundIntentGate.admit] has stripped the call extras an unproven intent carried.
 */
internal fun Intent.launchExtras(): LaunchExtras {
    val (tap, routeHint) = PushTapExtras.read(this)
    return LaunchExtras(
        callId = getStringExtra(MeeshyFcmService.EXTRA_CALL_ID),
        conversationId = getStringExtra(MeeshyFcmService.EXTRA_CONVERSATION_ID),
        callerName = getStringExtra(MeeshyFcmService.EXTRA_CALLER_NAME),
        isVideo = getBooleanExtra(MeeshyFcmService.EXTRA_IS_VIDEO, false),
        autoAnswer = getBooleanExtra(MeeshyFcmService.EXTRA_AUTO_ANSWER, false),
        tap = tap,
        routeHint = routeHint,
        composerSeed = getStringExtra(ComposerSeedLaunch.EXTRA_SEED),
    )
}

/** Les voiles de la barre de navigation à trois boutons, ceux d'`enableEdgeToEdge` : clair sur un thème clair, sombre sur un sombre. */
private val NAVIGATION_SCRIM_LIGHT = Color.argb(0xE6, 0xFF, 0xFF, 0xFF)
private val NAVIGATION_SCRIM_DARK = Color.argb(0x80, 0x1B, 0x1B, 0x1B)
