package me.meeshy.app.onboarding

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.feature.auth.R
import me.meeshy.sdk.game.OnboardingPresence
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.onboarding.OnboardingCard
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.openAppSettings
import me.meeshy.ui.component.permission.rememberPermissionFlow

/** Les portes qui sortent du calque : le composeur de story, Meeshy Global, le jeu, la fin de session sous 13 ans. */
class OnboardingNavigation(
    val openStoryComposer: () -> Unit = {},
    val openConversation: (String) -> Unit = {},
    val openProgression: () -> Unit = {},
    val signOut: () -> Unit = {},
)

/** Le délai entre deux relectures de l'état serveur tant qu'une carte l'attend (adresse vérifiée, story publiée). */
private const val VERIFICATION_WATCH_MS = 5_000L

/**
 * L'hôte de l'onboarding post-inscription, posé UNE fois à la racine connectée (iOS `OnboardingHost`) : lecture de l'état
 * au premier utilisateur connu, présentation en calque, publication de [OnboardingPresence] (les célébrations plein écran
 * attendent), et les portes qui sortent du calque.
 *
 * Le calque s'efface pendant que le composeur de story est ouvert ([isStoryComposerOpen]) sans que le parcours finisse ;
 * à sa fermeture le modèle relit si la story est partie. Il s'efface de même devant un appel ([isCallOpen]) : sur iOS
 * l'écran d'appel est une présentation modale, PAR-DESSUS le calque, et un appel entrant ne se cache jamais derrière
 * une carte. Le retour système ne ferme rien, comme iOS : « Tout passer » est visible dès la première carte, et le
 * récapitulatif a ses deux sorties.
 *
 * Le modèle vit avec l'activité, pas avec la session : une session fermée ([user] nul) le remet à zéro, sans quoi le
 * calque recouvrirait l'écran de connexion. Les relectures périodiques ne tournent qu'au premier plan — iOS suspend
 * l'app en arrière-plan, Android non.
 */
@Composable
fun OnboardingLayer(
    viewModel: OnboardingViewModel,
    presence: OnboardingPresence,
    user: MeeshyUser?,
    isRoutedElsewhere: Boolean,
    isCelebrating: Boolean,
    isStoryComposerOpen: Boolean,
    navigation: OnboardingNavigation,
    isCallOpen: Boolean = false,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val permissions = rememberPermissionFlow()
    PermissionFlowHost(permissions)

    LaunchedEffect(isRoutedElsewhere) { viewModel.routingChanged(isRoutedElsewhere) }
    LaunchedEffect(isCelebrating) { viewModel.celebrationChanged(isCelebrating) }
    LaunchedEffect(user?.id) { if (user == null) viewModel.sessionEnded() else viewModel.start(user) }
    LaunchedEffect(state.isPresented) { presence.update(state.isPresented) }
    LaunchedEffect(state.signOutRequested) { if (state.signOutRequested) navigation.signOut() }

    var composerWasOpen by remember { mutableStateOf(false) }
    LaunchedEffect(isStoryComposerOpen) {
        if (isStoryComposerOpen) {
            composerWasOpen = true
            return@LaunchedEffect
        }
        if (!composerWasOpen) return@LaunchedEffect
        composerWasOpen = false
        viewModel.storyComposerClosed()
    }

    val card = state.card
    LaunchedEffect(card) { if (card == OnboardingCard.Step(OnboardingStepId.FRIENDS)) viewModel.friendsCardAppeared() }
    val onStoryCard = card == OnboardingCard.Step(OnboardingStepId.STORY)
    val watchesServer = state.isPresented && (
        card == OnboardingCard.Step(OnboardingStepId.EMAIL) ||
            (onStoryCard && (state.storyNeedsEmailVerification || state.storyAwaitsPublication))
        )
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(watchesServer, lifecycle) {
        if (!watchesServer) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                delay(VERIFICATION_WATCH_MS)
                viewModel.refreshVerification()
            }
        }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch {
            viewModel.refreshVerification()
            viewModel.refreshContactsAccess()
        }
    }

    val visible = state.isPresented && !isStoryComposerOpen && !isCallOpen
    BackHandler(enabled = visible) { }
    if (!visible) return

    val actions = remember(viewModel, navigation, context) {
        OnboardingCardActions(
            later = { scope.launch { viewModel.later() } },
            advance = { scope.launch { viewModel.advance() } },
            confirmLanguages = { scope.launch { viewModel.confirmLanguages() } },
            selectPrimaryLanguage = viewModel::selectPrimaryLanguage,
            toggleSecondaryLanguage = viewModel::toggleSecondaryLanguage,
            resendVerificationLink = { scope.launch { viewModel.resendVerificationLink() } },
            editGreeting = viewModel::editGreeting,
            sendGreeting = { scope.launch { viewModel.sendGreeting() } },
            openStory = navigation.openStoryComposer,
            addFriend = { id -> scope.launch { viewModel.addFriend(id) } },
            findFriends = {
                scope.launch { viewModel.findFriendsInContacts { permissions.ensure(PermissionNature.CONTACTS, announcesRefusal = false) } }
            },
            declineContacts = { scope.launch { viewModel.declineContacts() } },
            continueFromFriends = { scope.launch { viewModel.continueFromFriends() } },
            openContactsSettings = { context.openAppSettings() },
            inviteByText = {
                val body = context.getString(R.string.onboarding_contacts_invite_message)
                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")).putExtra("sms_body", body)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { context.startActivity(intent) }
            },
            acceptNotifications = {
                scope.launch {
                    viewModel.acceptNotifications { permissions.ensure(PermissionNature.NOTIFICATIONS, announcesRefusal = false) }
                }
            },
            explore = {
                scope.launch {
                    val conversationId = viewModel.state.value.globalConversationId
                    viewModel.finish()
                    conversationId?.let(navigation.openConversation)
                }
            },
            finish = { scope.launch { viewModel.finish() } },
            openGame = {
                scope.launch {
                    viewModel.finish()
                    navigation.openProgression()
                }
            },
            pickBirthDate = viewModel::pickBirthDate,
            declareBirthDate = { scope.launch { viewModel.declareBirthDate() } },
            acknowledgeAgeRefusal = { scope.launch { viewModel.acknowledgeAgeRefusal() } },
        )
    }

    OnboardingOverlay(
        state = OnboardingOverlayState(
            cardKey = card ?: "none",
            sessionPoints = state.sessionPoints,
            isRecap = card == OnboardingCard.Recap,
            stepPosition = state.stepPosition,
            stepCount = state.stepCount,
            reward = state.gain?.let { OnboardingReward(it.id.toLong(), it.points) },
        ),
        onSkipAll = { scope.launch { viewModel.skipAll() } },
    ) {
        OnboardingCardContent(state = state, actions = actions, reduceMotion = rememberOnboardingReduceMotion())
    }
}
