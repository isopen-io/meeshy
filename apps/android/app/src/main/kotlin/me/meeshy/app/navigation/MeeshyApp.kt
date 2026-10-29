package me.meeshy.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import android.net.Uri
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import androidx.navigation.NavHostController
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.LoggingOutVeil
import me.meeshy.app.auth.guest.GuestSessionEndViewModel
import me.meeshy.app.auth.guest.GuestSessionEndedScreen
import me.meeshy.app.calls.CallPill
import me.meeshy.app.calls.CallPillPresenter
import me.meeshy.app.calls.CallStatus
import me.meeshy.app.calls.CallViewModel
import me.meeshy.app.calls.IncomingCallViewModel
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.feed.PostDetailViewModel
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.navigation.graph.authNavGraph
import me.meeshy.app.navigation.graph.callNavGraph
import me.meeshy.app.navigation.graph.conversationsNavGraph
import me.meeshy.app.navigation.graph.feedNavGraph
import me.meeshy.app.navigation.graph.settingsNavGraph
import me.meeshy.app.navigation.graph.socialNavGraph
import me.meeshy.app.notifications.NotificationBannerHost
import me.meeshy.app.startup.AppExtensionsViewModel
import me.meeshy.app.startup.AppOverlayStack
import me.meeshy.app.startup.ProvideAppLocals
import me.meeshy.sdk.chrome.FloatingButtonPositionStore
import me.meeshy.sdk.model.call.CallLinkRequest
import me.meeshy.sdk.net.SessionExpiryNotifier
import me.meeshy.ui.component.chrome.FloatingChromeReserveState
import me.meeshy.ui.component.chrome.LocalFloatingChromeReserve
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * A call that ends while minimised leaves the full-screen [CallScreen] un-composed,
 * so its own auto-dismiss never fires. This app-level settle window brings the
 * Activity-scoped [CallViewModel] back to idle after the ended beat, so the next
 * call can start (parity with [CallScreen]'s CALL_ENDED_AUTO_DISMISS_MS).
 */
private const val CALL_ENDED_MINIMISED_SETTLE_MS = 1500L

@Composable
fun MeeshyApp(
    floatingButtonPositions: FloatingButtonPositionStore,
    sessionExpiry: SessionExpiryNotifier,
    launchRoute: String? = null,
    onLaunchRouteConsumed: () -> Unit = {},
    warmDeepLink: Uri? = null,
    warmDeepLinkAwaitsAccount: Boolean = false,
    onWarmDeepLinkHandled: () -> Unit = {},
    callLink: CallLinkRequest? = null,
    onCallLinkHandled: () -> Unit = {},
) {
    val navController = rememberNavController()
    SheetReturnEffect(navController)
    val authViewModel: AuthViewModel = hiltViewModel()
    val incomingCallViewModel: IncomingCallViewModel = hiltViewModel()
    // Hoisted to the MeeshyApp root → resolved against the Activity's ViewModelStore
    // (like [authViewModel] above), NOT the CALL destination's back-stack entry. This
    // is what lets the call survive minimisation: leaving the CALL screen clears only
    // that entry's store, never this Activity-scoped instance, so the WebRTC session
    // and every collector in [CallViewModel] stay alive while the conversation shows.
    val callViewModel: CallViewModel = hiltViewModel()
    // Ne collecte QUE la reference : les StateFlow eux-memes (badges, avatar) sont
    // lus a l'interieur de [MeeshyFloatingChrome], pas ici — sinon toute variation
    // d'un badge invaliderait TOUT MeeshyApp, y compris le lambda `builder` du
    // NavHost ci-dessous, qui perdrait alors son identite et reconstruirait le
    // graphe de navigation entier a chaque notification.
    val chromeViewModel: ChromeViewModel = hiltViewModel()
    val extensions = hiltViewModel<AppExtensionsViewModel>().extensions
    val authState by authViewModel.state.collectAsStateWithLifecycle()
    // La passerelle a terminé la session d'un invité de lien : l'appareil est déjà purgé, la racine retombe sur la
    // connexion (état aligné ci-dessous) et l'écran de fin dit pourquoi, à la place du fil.
    val guestEndViewModel: GuestSessionEndViewModel = hiltViewModel()
    val guestEnded by guestEndViewModel.ended.collectAsStateWithLifecycle()
    LaunchedEffect(guestEnded) {
        if (guestEnded != null) authViewModel.onExternalSessionOpened()
    }
    // Seule la PHASE de l'appel est lue ici : l'etat complet change chaque seconde (le chrono),
    // et le lire a la racine recomposerait MeeshyApp et redonnerait au `builder` du NavHost une
    // identite neuve chaque seconde — le graphe reconstruit pendant tout l'appel. La pastille
    // lit l'etat vivant dans [MinimizedCallPill].
    val callStatus by remember(callViewModel) { callViewModel.state.map { it.status }.distinctUntilChanged() }
        .collectAsStateWithLifecycle(initialValue = callViewModel.state.value.status)

    LaunchedEffect(authState.isAuthenticated) {
        chromeViewModel.warmUpIfAuthenticated(authState.isAuthenticated)
    }

    val navBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route
    val showMenuFab = floatingChromeVisible(currentRoute)
    val onCallScreen = currentRoute == CallRoute.PATTERN

    // Settle a call that ended while minimised: [CallScreen]'s own auto-dismiss only
    // runs while it is composed, so an ended call left in the pill would strand the
    // Activity-scoped FSM in ENDED and block the next call. The pill has already
    // vanished (ENDED is not a pill status); this only resets the state machine.
    LaunchedEffect(callStatus, onCallScreen) {
        if (callStatus == CallStatus.ENDED && !onCallScreen) {
            delay(CALL_ENDED_MINIMISED_SETTLE_MS)
            callViewModel.dismiss()
        }
    }

    val startDestination = remember(authState.isAuthenticated) { if (authState.isAuthenticated) Routes.CONVERSATIONS else Routes.LOGIN }

    // Deep-link from a notification tap / full-screen call intent: navigate once
    // the graph is live and the user is authenticated, then mark it consumed so a
    // recomposition never re-navigates. An unauthenticated launch defers until
    // sign-in resolves (the route survives in Activity state across the login gate).
    LaunchedEffect(launchRoute, authState.isAuthenticated) {
        // Les liens d'e-mail a jeton (connexion, adresse prouvee, nouveau mot de passe) sont les SEULES
        // destinations de lancement legitimes hors session : ce sont eux qui en ouvrent une ou qui
        // choisissent le mot de passe. Tout le reste (chat, appel) attend l'authentification.
        if (launchRoute != null && (authState.isAuthenticated || LaunchRouter.opensWithoutSession(launchRoute))) {
            navController.navigate(launchRoute)
            onLaunchRouteConsumed()
        }
    }

    // Un lien `meeshy://` / App Link / raccourci d'icône reçu alors que l'app est DÉJÀ ouverte
    // (MainActivity.onNewIntent) : les navDeepLink du graphe ne sont lus qu'au démarrage, c'est
    // donc ici qu'on rejoue l'intent, comme le routeur de liens d'iOS (`.onOpenURL`). Il attend la
    // session, puis la pile se refait avec la liste dessous (le retour revient à la liste).
    LaunchedEffect(warmDeepLink, authState.isAuthenticated, authState.hasAccount) {
        val uri = warmDeepLink ?: return@LaunchedEffect
        if (!WarmDeepLink.mayReplay(authState.isAuthenticated, authState.hasAccount, warmDeepLinkAwaitsAccount)) return@LaunchedEffect
        WarmDeepLink.open(navController, uri)
        onWarmDeepLinkHandled()
    }

    // App-level ring: a foreground `call:initiated` socket offer navigates into the
    // incoming-call screen (the Android analogue of iOS CallManager.shared observed
    // at RootView). Reads the live destination per offer so a second offer mid-call
    // yields no route (call-waiting stays with CallViewModel's banner).
    // Session expiree: la passerelle a refuse l'identite hors route d'auth. Sans
    // ceci, l'ecran affichait « verifiez votre connexion » alors que le reseau
    // fonctionnait, et l'utilisateur n'avait aucun moyen de comprendre qu'il devait
    // se reconnecter. La deconnexion vide la session, donc `startDestination`
    // bascule sur LOGIN.
    LaunchedEffect(Unit) {
        sessionExpiry.expirations.collect { authViewModel.logout(closedByServer = true) }
    }

    LaunchedEffect(Unit) {
        incomingCallViewModel.incomingOffers.collect { offer ->
            LaunchRouter.routeIncomingSocketOffer(offer, navController.currentDestination?.route)
                ?.let(navController::navigate)
        }
    }

    ShareLaunchHost(navController) {
    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
            // Pas de floatingActionButton (les boutons deplacables se posent par-dessus le
            // NavHost) et `contentWindowInsets` a ZERO : chaque destination porte ses propres
            // insets, ce qui laisse le fond de marque plein ecran (edge-to-edge).
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
        ) { padding ->
            Box(modifier = Modifier.fillMaxSize().rootPresentationContent()) {
                CompositionLocalProvider(LocalFloatingChromeReserve provides remember { FloatingChromeReserveState() }) {
                    val showsCallPill = CallPillPresenter.shouldShow(callStatus, onCallScreen)
                    // The minimised-call pill PUSHES the destination down instead of floating
                    // over it: pinned under the status bar, it would lie under the system status
                    // window (its controls untappable) and cover the destination's top bar. The
                    // pill takes the status-bar inset, so the destination below consumes it.
                    Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                        // A live, non-incoming call while off the CALL screen. A tap rebuilds the
                        // CALL route from the live config; the Activity-scoped [callViewModel] is
                        // reused, so `start()` is inert.
                        if (showsCallPill) {
                            MinimizedCallPill(
                                callViewModel = callViewModel,
                                navController = navController,
                                modifier = Modifier
                                    .statusBarsPadding()
                                    .padding(vertical = MeeshySpacing.xs),
                            )
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .then(if (showsCallPill) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier),
                        ) {
                            ProvideAppLocals(extensions.localsProviders) {
                                // Le retour interactif depuis le bord (#13364) : UN site, armé par le registre des routes.
                                EdgeSwipeBackHost(
                                    enabled = NavBackChrome.edgeSwipeBackEnabled(currentRoute),
                                    canGoBack = { navController.previousBackStackEntry != null },
                                    modifier = Modifier.fillMaxSize(),
                                ) {
                                    NavHost(
                                        navController = navController,
                                        startDestination = startDestination,
                                        enterTransition = { stackEnter() },
                                        exitTransition = { stackExit() },
                                        popEnterTransition = { stackPopEnter() },
                                        popExitTransition = { stackPopExit() },
                                    ) {
                                        authNavGraph(navController, authViewModel)
                                        conversationsNavGraph(navController, authViewModel, callStatus)
                                        feedNavGraph(navController)
                                        callNavGraph(navController, callViewModel)
                                        socialNavGraph(navController)
                                        settingsNavGraph(navController, authViewModel)
                                        extensions.graphContributors.forEach { it.contribute(this, navController) }
                                    }
                                }
                            }
                        }
                    }

                    // Les deux boutons flottants (parite iOS RootView.draggableFloatingButtons),
                    // par-dessus le NavHost. Leurs StateFlow sont lus DANS MeeshyFloatingChrome,
                    // jamais ici : une pastille qui bouge ne reconstruit pas le graphe.
                    if (showMenuFab) {
                        MeeshyFloatingChrome(
                            navController = navController,
                            currentRoute = currentRoute,
                            floatingButtonPositions = floatingButtonPositions,
                        )
                    }
                }
            }
        }

        // #4457 — la banniere in-app se monte UNE fois, ICI, par-dessus la navigation (une
        // banniere SUIT le lecteur : une instance par ecran en ferait autant de rivales).
        NotificationBannerHost(
            activeConversationId = navBackStack?.arguments?.getString(ChatViewModel.CONVERSATION_ID_ARG),
            activePostId = navBackStack?.arguments?.getString(PostDetailViewModel.POST_ID_ARG),
            onOpenConversation = { navController.navigate(Routes.chat(it)) },
            onOpenPost = { navController.navigate(Routes.postDetail(it)) },
            onOpenGame = { navController.navigate(GameRoutes.route(it)) },
        )

        AppOverlayStack(extensions.overlays, navController)

        EngagementRevealHost(navController)

        CallLinkHost(
            request = callLink,
            isAuthenticated = authState.isAuthenticated,
            onHandled = onCallLinkHandled,
            navController = navController,
        )

        ArrivalCelebrationHost()

        guestEnded?.let { ended ->
            GuestSessionEndedScreen(
                end = ended.end,
                onNewLink = { identifier ->
                    guestEndViewModel.dismiss()
                    navController.navigate(Routes.guestJoin(identifier)) { launchSingleTop = true }
                },
                onHome = guestEndViewModel::dismiss,
            )
        }

        VisitorContentHost(navController = navController, isAuthenticated = authState.isAuthenticated)

        NotificationPermissionOnArrival(isAuthenticated = authState.isAuthenticated)

        LoggingOutVeil(visible = authState.isLoggingOut)

        SplashOverlay()
    }
    }
}


/** La pastille d'appel reduit : seule a lire l'etat VIVANT (chrono compris), elle seule se recompose chaque seconde. */
@Composable
private fun MinimizedCallPill(
    callViewModel: CallViewModel,
    navController: NavHostController,
    modifier: Modifier = Modifier,
) {
    val callState by callViewModel.state.collectAsStateWithLifecycle()
    val callPeerVisual by callViewModel.peerVisual.collectAsStateWithLifecycle()
    CallPill(
        state = callState,
        peerAvatarUrl = callPeerVisual.avatarUrl,
        onClick = {
            navController.navigate(CallRoute.reopen(callViewModel.activeConfig)) {
                launchSingleTop = true
            }
        },
        onToggleMute = callViewModel::toggleMute,
        onToggleSpeaker = callViewModel::toggleSpeaker,
        onHangUp = callViewModel::hangUp,
        modifier = modifier,
    )
}
