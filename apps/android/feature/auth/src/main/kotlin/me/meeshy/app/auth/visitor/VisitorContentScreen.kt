package me.meeshy.app.auth.visitor

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.visitor.VisitorContentRequest
import me.meeshy.sdk.model.visitor.VisitorContentState
import me.meeshy.sdk.model.visitor.VisitorContentSurface
import me.meeshy.sdk.model.visitor.VisitorInvitationAction
import me.meeshy.sdk.model.visitor.toVisitorReadable
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Le contenu d'un lien universel, en lecture seule, pour qui n'a pas de session** (iOS `VisitorContentView`, #9171).
 * Le media et le texte du post (dans la langue de l'appareil quand une traduction existe) et, par-dessus, la carte qui
 * invite a se connecter en nommant qui a partage le lien. Aucun geste n'exige de compte ici : reagir, commenter, partager
 * passent par la connexion, apres laquelle le lien en attente ouvre le vrai ecran.
 */
@Composable
fun VisitorContentScreen(
    request: VisitorContentRequest,
    onSignUp: () -> Unit,
    onSignIn: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: VisitorContentViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var cardDismissed by rememberSaveable(request.id) { mutableStateOf(false) }
    LaunchedEffect(request.id) { viewModel.start(request) }
    BackHandler(onBack = onClose)

    val surface = VisitorContentSurface.of(state)
    val tokens = MeeshyTheme.tokens
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(if (surface == VisitorContentSurface.NEUTRAL_BACKDROP) MeeshyMediaChromeColors.MediaBackdrop else tokens.backgroundPrimary),
    ) {
        when (val current = state) {
            VisitorContentState.Pending -> CircularProgressIndicator(Modifier.align(Alignment.Center))
            is VisitorContentState.Served -> VisitorPostReader(
                readable = current.post.toVisitorReadable(viewModel.deviceLocale),
            )
            VisitorContentState.Refused, is VisitorContentState.Failed -> Unit
        }
        AnimatedVisibility(
            visible = state.showsCard(dismissed = cardDismissed),
            modifier = Modifier.align(Alignment.BottomCenter),
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
        ) {
            VisitorInvitationCard(
                kind = request.kind,
                state = state,
                onAction = { action ->
                    when (action) {
                        VisitorInvitationAction.SIGN_UP -> onSignUp()
                        VisitorInvitationAction.SIGN_IN -> onSignIn()
                        VisitorInvitationAction.KEEP_WATCHING -> cardDismissed = true
                        VisitorInvitationAction.RETRY -> viewModel.retry()
                    }
                },
            )
        }
        CloseButton(
            onClose = onClose,
            onMedia = surface == VisitorContentSurface.NEUTRAL_BACKDROP,
            modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(horizontal = MeeshySpacing.lg),
        )
    }
}

@Composable
private fun CloseButton(onClose: () -> Unit, onMedia: Boolean, modifier: Modifier) {
    val label = stringResource(R.string.visitor_close)
    Box(
        modifier = modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(MeeshyMediaChromeColors.ChromeFill)
            .clickable(onClick = onClose)
            .semantics { role = Role.Button; contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = MeeshyIcons.Close,
            contentDescription = null,
            tint = if (onMedia) MeeshyMediaChromeColors.ChromeForeground else MeeshyTheme.tokens.textPrimary,
        )
    }
}
