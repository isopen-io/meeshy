package me.meeshy.app.navigation

import android.app.NotificationManager
import android.content.Context
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.push.MessageNotificationId
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.conversation.DirectConversationOpener
import me.meeshy.sdk.conversation.DirectOpenResult
import me.meeshy.sdk.model.rootnav.ActiveConversationReporting
import me.meeshy.sdk.model.rootnav.ConversationRouteContext
import me.meeshy.sdk.model.rootnav.ConversationSwitch
import me.meeshy.sdk.model.rootnav.PendingIntentInbox
import me.meeshy.sdk.model.rootnav.RootIntent
import me.meeshy.sdk.model.rootnav.RootIntentAction
import me.meeshy.sdk.model.rootnav.RootIntentRouting
import me.meeshy.sdk.notification.ActiveConversationStore

/**
 * Le routeur d'intentions UNIQUE de la racine : push, carte de lecture, raccourcis et intentions
 * internes y passent, les URL de partage seules traversant le routeur de navigation (les autres
 * liens ont leur parseur — aucun second passage, donc aucun double appel API).
 *
 * Le payload d'un push arrive parfois AVANT que la racine soit montee (demarrage a froid) : il est
 * retenu dans [holdPush] et rejoue une seule fois par [replayPendingPush] quand la session existe.
 */
@Singleton
class RootIntentRouter @Inject constructor() {
    private val pendingPush = PendingIntentInbox<RootIntent>()
    private val mutableIntents = MutableSharedFlow<RootIntent>(
        extraBufferCapacity = 16,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val intents: SharedFlow<RootIntent> = mutableIntents.asSharedFlow()

    /** Contexte de reponse en attente et mode force ephemere : consommes a l'arrivee, jamais persistes. */
    val routeContext = ConversationRouteContext<String, String>()

    fun submit(intent: RootIntent) {
        mutableIntents.tryEmit(intent)
    }

    fun holdPush(intent: RootIntent) {
        pendingPush.post(intent)
    }

    /** Rejoue le payload de push en attente une fois la session ouverte, puis l'efface. */
    fun replayPendingPush(isAuthenticated: Boolean): Boolean {
        val intent = pendingPush.take(isAuthenticated) ?: return false
        submit(intent)
        return true
    }
}

/** Retire les notifications systeme de la conversation ouverte (celles que l'application a posees ou que FCM a rendues). */
internal class ConversationNotificationCanceller(private val context: Context) {
    fun cancel(conversationId: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        MessageNotificationId.forConversation(type = "new_message", conversationId = conversationId)
            ?.let(manager::cancel)
        manager.cancel(conversationId, 0)
    }
}

/**
 * Branche le routeur d'intentions sur la navigation, sans toucher `MeeshyApp` : une couche
 * `AppOverlay` qui ne dessine rien. Elle porte aussi la declaration de la conversation affichee.
 */
class RootIntentOverlay @Inject constructor(
    private val router: RootIntentRouter,
    private val opener: ConversationOpenerHost,
    private val directOpener: DirectConversationOpener,
    private val activeConversationStore: ActiveConversationStore,
    @ApplicationContext private val appContext: Context,
) : AppOverlay {

    override val order: Int get() = -1_000

    @Composable
    override fun Content(navController: NavHostController) {
        val authViewModel: AuthViewModel = hiltViewModel()
        val authState by authViewModel.state.collectAsStateWithLifecycle()
        val backStack by navController.currentBackStackEntryAsState()
        val displayedId = backStack
            ?.takeIf { it.destination.route == Routes.CHAT }
            ?.arguments?.getString(ChatViewModel.CONVERSATION_ID_ARG)
        val isAuthenticated by rememberUpdatedState(authState.isAuthenticated)
        val displayed by rememberUpdatedState(displayedId)
        val context = LocalContext.current
        val scope = rememberCoroutineScope()

        val reporting = remember {
            val canceller = ConversationNotificationCanceller(appContext)
            ActiveConversationReporting(
                declare = activeConversationStore::setActive,
                clearSystemNotifications = canceller::cancel,
            )
        }
        LaunchedEffect(displayedId) { reporting.report(displayedId) }

        LaunchedEffect(authState.isAuthenticated) { router.replayPendingPush(authState.isAuthenticated) }

        LaunchedEffect(Unit) {
            opener.events.collect { event ->
                when (event) {
                    is ConversationOpenEvent.Navigate -> navigateReplacingStack(navController, event.route, displayed)
                    is ConversationOpenEvent.ShowError -> Toast.makeText(context, event.message, Toast.LENGTH_SHORT).show()
                }
            }
        }

        LaunchedEffect(Unit) {
            router.intents.collect { intent ->
                when (val action = RootIntentRouting.plan(intent, isAuthenticated)) {
                    is RootIntentAction.NavigateToConversation ->
                        scope.launch { opener.open(action.conversationId, action.highlightMessageId) }
                    is RootIntentAction.OpenDirectConversation -> scope.launch {
                        when (val result = directOpener.openOrCreate(action.userId)) {
                            is DirectOpenResult.Opened -> opener.open(result.conversationId)
                            DirectOpenResult.Queued -> Unit
                            DirectOpenResult.Failed -> opener.reportOpenFailure()
                        }
                    }
                    is RootIntentAction.ShowProfileSheet -> navController.navigate(Routes.profile(action.userId))
                    RootIntentAction.ShowStoryComposer -> navController.navigate(Routes.STORY_COMPOSER)
                    is RootIntentAction.NavigateToRoute -> navController.navigate(action.route)
                    RootIntentAction.Ignore -> Unit
                }
            }
        }
    }

    /**
     * Ouvrir B alors que A est affichee REMPLACE la pile (retour a la liste puis B) : la vue de A
     * est detruite, son ViewModel vide son brouillon, et B recoit une vue neuve.
     */
    private fun navigateReplacingStack(navController: NavHostController, route: String, displayedId: String?) {
        val targetId = route.removePrefix("chat/").substringBefore('?')
        val plan = ConversationSwitch.plan(displayedId, targetId)
        if (plan.reusesCurrentScreen && !route.contains('?')) return
        navController.navigate(route) {
            popUpTo(Routes.CONVERSATIONS) { inclusive = false }
            launchSingleTop = true
        }
    }
}
