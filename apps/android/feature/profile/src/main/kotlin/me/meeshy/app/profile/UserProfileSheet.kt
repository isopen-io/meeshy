package me.meeshy.app.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.accessibility.MeeshyMinTapTarget
import me.meeshy.ui.component.ConnectionFeedbackHost
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/** Largeur bornée de la feuille sur tablette et pliable (miroir de `adaptiveWideSheet` iOS). */
val PROFILE_SHEET_MAX_WIDTH: Dp = 640.dp

internal const val PROFILE_SHEET_CLOSE_TAG = "profile-sheet-close"
private val CLOSE_VISUAL_SIZE = 36.dp

/**
 * La fiche d'une personne, présentée en feuille d'où que l'on vienne (miroir de `UserProfileSheet`
 * iOS) : demi-hauteur puis plein écran, largeur bornée à [PROFILE_SHEET_MAX_WIDTH], fond
 * `backgroundPrimary`, contenu sous la barre d'état et bouton Fermer en verre toujours présent. Le
 * geste retour système, le glissement et le voile la ferment par [onDismiss]. Les sorties passent par
 * [environment], fourni par `:app`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserProfileSheet(
    user: ProfileSheetUser,
    onDismiss: () -> Unit,
    environment: ProfileSheetEnvironment = ProfileSheetEnvironment(),
    viewModel: UserProfileSheetViewModel = hiltViewModel(),
    actionsViewModel: ProfileActionsViewModel = hiltViewModel(),
    bannerViewModel: ProfileBannerViewModel = hiltViewModel(),
) {
    LaunchedEffect(user) { viewModel.onEvent(UserProfileSheetEvent.Open(user)) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val actionsState by actionsViewModel.state.collectAsStateWithLifecycle()
    val catalog by bannerViewModel.catalog.collectAsStateWithLifecycle()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val scope = rememberCoroutineScope()
    val latestDismiss by rememberUpdatedState(onDismiss)
    val close: () -> Unit = remember(sheetState, scope) {
        { scope.launch { sheetState.hide() }.invokeOnCompletion { latestDismiss() } }
    }
    val toasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 4) }
    ProfileSheetActionsBinding(state, actionsViewModel, environment, toasts)
    LaunchedEffect(state.content) {
        // L'état VIVANT, pas l'instantané composé : une fiche précédente fermée ne referme pas la suivante.
        if (viewModel.state.value.content == ProfileSheetContent.Close) close()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        sheetMaxWidth = PROFILE_SHEET_MAX_WIDTH,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        dragHandle = null,
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
    ) {
        Box {
            UserProfileSheetBody(
                state = state,
                actionsState = actionsState,
                environment = environment,
                isExpanded = sheetState.targetValue == SheetValue.Expanded,
                onClose = close,
                onRetry = { viewModel.onEvent(UserProfileSheetEvent.Retry) },
                actions = actionsViewModel.callbacks(state, environment),
                catalog = catalog,
            )
            ConnectionFeedbackHost(feedback = actionsViewModel.connectionFeedback)
            FeedbackToastHost(toasts = toasts)
        }
    }
}

/** Relie les actions à la personne résolue et route leurs sorties (conversation, toasts). */
@Composable
private fun ProfileSheetActionsBinding(
    state: UserProfileSheetUiState,
    actionsViewModel: ProfileActionsViewModel,
    environment: ProfileSheetEnvironment,
    toasts: MutableSharedFlow<FeedbackToastRequest>,
) {
    val resolvedId = state.profile?.id?.takeIf { it.isNotBlank() }
    LaunchedEffect(resolvedId, state.isSelf) {
        val id = resolvedId ?: return@LaunchedEffect
        if (!state.isSelf) actionsViewModel.bind(id, isAnonymous = state.user.isAnonymous || state.profile?.isAnonymous == true)
    }
    val latest by rememberUpdatedState(environment)
    LaunchedEffect(actionsViewModel) {
        actionsViewModel.events.collect { event ->
            when (event) {
                is ProfileActionEvent.OpenConversation -> latest.onOpenConversation(event.conversationId)
                is ProfileActionEvent.Toast -> toasts.tryEmit(event.feedback.toToastRequest())
            }
        }
    }
}

private fun ProfileActionsViewModel.callbacks(
    state: UserProfileSheetUiState,
    environment: ProfileSheetEnvironment,
): ProfileActionCallbacks = ProfileActionCallbacks(
    onSendMessage = this::sendMessage,
    onRequest = this::requestConnection,
    onCancel = this::cancelConnection,
    onResend = this::resendConnection,
    onAccept = this::acceptConnection,
    onDecline = this::declineConnection,
    onBlock = this::block,
    onUnblock = this::unblock,
    onReport = {
        val profile = state.profile
        if (profile != null) environment.onReport(profile.id, profile.username)
    },
)

/**
 * Le corps de la feuille, projection mince de [UserProfileSheetUiState] : squelette sur cache vide,
 * échec + Réessayer, refus sans Réessayer, ou la fiche peinte — chacun en UN SEUL défilement. Le
 * bouton Fermer reste au-dessus de tout (barre compacte comprise), en haut au début ; la feuille
 * porte le nom de la personne comme titre de volet (TalkBack).
 */
@Composable
internal fun UserProfileSheetBody(
    state: UserProfileSheetUiState,
    actionsState: ProfileActionsState,
    environment: ProfileSheetEnvironment,
    isExpanded: Boolean,
    onClose: () -> Unit,
    onRetry: () -> Unit,
    actions: ProfileActionCallbacks,
    catalog: AppearanceCatalog? = null,
) {
    val accent = hexColor(state.accentHex, MeeshyPalette.Indigo500)
    val title = state.profile?.let { it.displayName ?: it.username } ?: state.user.resolvedDisplayName
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { paneTitle = title },
    ) {
        when (state.content) {
            ProfileSheetContent.Skeleton -> ProfileSheetPlaceholderList { ProfileSheetSkeleton() }
            ProfileSheetContent.Failed -> ProfileSheetPlaceholderList { ProfileSheetUnavailable(state.user, accent, onRetry) }
            ProfileSheetContent.Refused -> ProfileSheetPlaceholderList { ProfileSheetUnavailable(state.user, accent, onRetry = null) }
            ProfileSheetContent.Close -> Unit
            ProfileSheetContent.Loaded -> ProfileSheetLoadedContent(
                state = state,
                actionsState = actionsState,
                environment = environment,
                accent = accent,
                catalog = catalog,
                isExpanded = isExpanded,
                actions = actions,
            )
        }
        ProfileSheetCloseButton(
            onClose = onClose,
            modifier = Modifier
                .align(Alignment.TopStart)
                .then(if (isExpanded) Modifier.statusBarsPadding() else Modifier)
                .padding(start = MeeshySpacing.xs, top = MeeshySpacing.xs),
        )
    }
}

/** Un état sans profil peint (squelette, panne, refus), dans le même défilement unique. */
@Composable
private fun ProfileSheetPlaceholderList(content: @Composable ColumnScope.() -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(bottom = MeeshySpacing.xxxl)) {
        item(key = "placeholder", contentType = "placeholder") {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
                content = content,
            )
        }
    }
}

/** La fiche sans profil (panne ou refus) : ce que la surface d'origine savait, puis le message. */
@Composable
private fun ProfileSheetUnavailable(user: ProfileSheetUser, accent: Color, onRetry: (() -> Unit)?) {
    Box(Modifier.height(ProfileSheetLayout.TOP_CLEARANCE))
    MeeshyAvatar(
        name = user.resolvedDisplayName,
        size = 96.dp,
        containerColor = accent,
        imageUrl = user.avatarUrl,
    )
    ProfileSheetIdentity(user)
    ProfileLoadFailure(accent = accent, onRetry = onRetry)
}

/**
 * Le bouton Fermer en verre (miroir de `closeButton` iOS) : visuel de 36 dp, cible de 48 dp, libellé
 * « Fermer » et action annoncée « Ferme le profil ».
 */
@Composable
internal fun ProfileSheetCloseButton(onClose: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(MeeshyMinTapTarget)
            .clip(CircleShape)
            .clickable(
                onClickLabel = stringResource(R.string.profile_close_hint),
                role = Role.Button,
                onClick = onClose,
            )
            .testTag(PROFILE_SHEET_CLOSE_TAG),
        contentAlignment = Alignment.Center,
    ) {
        MeeshyGlassSurface(modifier = Modifier.size(CLOSE_VISUAL_SIZE), shape = CircleShape) {
            Icon(
                imageVector = MeeshyIcons.Close,
                contentDescription = stringResource(R.string.common_close),
                tint = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.align(Alignment.Center).size(18.dp),
            )
        }
    }
}

internal object ProfileSheetLayout {
    /** La place du bouton Fermer au-dessus d'une fiche sans bannière. */
    val TOP_CLEARANCE: Dp = 56.dp
}

private fun ProfileActionFeedback.toToastRequest(): FeedbackToastRequest = FeedbackToastRequest(
    messageRes = when (this) {
        ProfileActionFeedback.UserBlocked -> R.string.profile_toast_user_blocked
        ProfileActionFeedback.BlockFailed -> R.string.profile_toast_block_failed
        ProfileActionFeedback.UserUnblocked -> R.string.profile_toast_user_unblocked
        ProfileActionFeedback.UnblockFailed -> R.string.profile_toast_unblock_failed
        ProfileActionFeedback.OpenConversationFailed -> R.string.profile_open_conversation_error
    },
    kind = if (isError) FeedbackKind.Error else FeedbackKind.Success,
)
