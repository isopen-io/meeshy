package me.meeshy.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.calls.CallPill
import me.meeshy.app.calls.CallPillPresenter
import me.meeshy.app.calls.CallStatus
import me.meeshy.app.calls.CallViewModel
import me.meeshy.app.calls.IncomingCallViewModel
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.feed.PostDetailViewModel
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
import me.meeshy.sdk.net.SessionExpiryNotifier
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
) {
    val navController = rememberNavController()
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
    val callState by callViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(authState.isAuthenticated) {
        chromeViewModel.warmUpIfAuthenticated(authState.isAuthenticated)
    }

    val navBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route
    val showMenuFab = currentRoute in tabRoutes
    val leftButtonPosition by floatingButtonPositions.leftPosition.collectAsStateWithLifecycle()
    val rightButtonPosition by floatingButtonPositions.rightPosition.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val onCallScreen = currentRoute == CallRoute.PATTERN

    // Settle a call that ended while minimised: [CallScreen]'s own auto-dismiss only
    // runs while it is composed, so an ended call left in the pill would strand the
    // Activity-scoped FSM in ENDED and block the next call. The pill has already
    // vanished (ENDED is not a pill status); this only resets the state machine.
    LaunchedEffect(callState.status, onCallScreen) {
        if (callState.status == CallStatus.ENDED && !onCallScreen) {
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
        // La validation d'un magic link est la SEULE destination de lancement
        // legitime hors session : c'est precisement elle qui en ouvre une. Tout le
        // reste (chat, appel) attend l'authentification.
        val isMagicLink = launchRoute?.startsWith("auth/magic-link") == true
        if (launchRoute != null && (authState.isAuthenticated || isMagicLink)) {
            navController.navigate(launchRoute)
            onLaunchRouteConsumed()
        }
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
        sessionExpiry.expirations.collect { authViewModel.logout() }
    }

    LaunchedEffect(Unit) {
        incomingCallViewModel.incomingOffers.collect { offer ->
            LaunchRouter.routeIncomingSocketOffer(offer, navController.currentDestination?.route)
                ?.let(navController::navigate)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
            // Pas de floatingActionButton (les boutons deplacables se posent par-dessus le
            // NavHost) et `contentWindowInsets` a ZERO : chaque destination porte ses propres
            // insets, ce qui laisse le fond de marque plein ecran (edge-to-edge).
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
        ) { padding ->
            Box(modifier = Modifier.fillMaxSize()) {
                ProvideAppLocals(extensions.localsProviders) {
                    NavHost(
                        navController = navController,
                        startDestination = startDestination,
                        modifier = Modifier.padding(padding),
                    ) {
                        authNavGraph(navController, authViewModel)
                        conversationsNavGraph(navController, authViewModel, callState)
                        feedNavGraph(navController)
                        callNavGraph(navController, callViewModel)
                        socialNavGraph(navController)
                        settingsNavGraph(navController, authViewModel)
                        extensions.graphContributors.forEach { it.contribute(this, navController) }
                    }
                }

                // Minimised-call pill: a full-width banner pinned under the status bar, shown
                // only for a live, non-incoming call while off the CALL screen. A tap rebuilds
                // the CALL route from the live config; the Activity-scoped [callViewModel] is
                // reused, so `start()` is inert.
                if (CallPillPresenter.shouldShow(callState.status, onCallScreen)) {
                    CallPill(
                        state = callState,
                        onClick = {
                            navController.navigate(CallRoute.reopen(callViewModel.activeConfig)) {
                                launchSingleTop = true
                            }
                        },
                        onToggleMute = callViewModel::toggleMute,
                        onToggleSpeaker = callViewModel::toggleSpeaker,
                        onHangUp = callViewModel::hangUp,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(padding)
                            .padding(top = MeeshySpacing.sm),
                    )
                }

                // Les deux boutons flottants (parite iOS RootView.draggableFloatingButtons),
                // par-dessus le NavHost. Leurs StateFlow sont lus DANS MeeshyFloatingChrome,
                // jamais ici : une pastille qui bouge ne reconstruit pas le graphe.
                if (showMenuFab) {
                    MeeshyFloatingChrome(
                        navController = navController,
                        currentRoute = currentRoute,
                        leftButtonPosition = leftButtonPosition,
                        rightButtonPosition = rightButtonPosition,
                        onLeftPositionChange = { scope.launch { floatingButtonPositions.setLeftPosition(it) } },
                        onRightPositionChange = { scope.launch { floatingButtonPositions.setRightPosition(it) } },
                    )
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
        )

        AppOverlayStack(extensions.overlays, navController)

        SplashOverlay()
    }
}
