package me.meeshy.app.navigation

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import me.meeshy.app.R
import me.meeshy.sdk.model.call.CallLinkRequest
import me.meeshy.sdk.model.call.CallLinkTarget
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **L'hôte du lien d'appel — monté UNE fois, à la racine** (miroir de `callLinkConfirmationSheet`, iOS #13465).
 *
 * `meeshy://call?contactId=…&type=…` n'appelle JAMAIS : il dépose une demande que cet hôte présente en confirmation
 * (« Appeler @x en vidéo ? »), et seul « Appeler » compose. Sans session, le lien ouvre l'app sur la connexion et ne
 * garde rien : [onHandled] le consomme dans tous les cas.
 */
@Composable
fun CallLinkHost(
    request: CallLinkRequest?,
    isAuthenticated: Boolean,
    onHandled: () -> Unit,
    navController: NavHostController,
    viewModel: CallLinkConfirmationViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val unknownMessage = stringResource(R.string.call_link_refused_unknown)
    val blockedMessage = stringResource(R.string.call_link_refused_blocked)

    LaunchedEffect(request, isAuthenticated) {
        val asked = request ?: return@LaunchedEffect
        if (isAuthenticated) viewModel.request(asked)
        onHandled()
    }
    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is CallLinkEvent.Refused -> {
                    val text = if (event.reason == CallLinkRefusal.BLOCKED) blockedMessage else unknownMessage
                    Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
                }
                is CallLinkEvent.Dial -> navController.navigate(
                    CallRoute.path(event.target.conversationId, event.target.displayName, event.target.isVideo),
                )
            }
        }
    }

    val pending by viewModel.pending.collectAsStateWithLifecycle()
    pending?.let { target ->
        CallLinkConfirmationSheet(
            target = target,
            onCall = { viewModel.confirm(target) },
            onCancel = { viewModel.dismissed(target) },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CallLinkConfirmationSheet(target: CallLinkTarget, onCall: () -> Unit, onCancel: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    ModalBottomSheet(onDismissRequest = onCancel, containerColor = tokens.backgroundPrimary) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            MeeshyAvatar(name = target.displayName, size = 72.dp, imageUrl = target.avatarUrl)
            Text(
                text = stringResource(
                    if (target.isVideo) R.string.call_link_confirm_video else R.string.call_link_confirm_audio,
                    target.handle,
                ),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Button(
                onClick = onCall,
                colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500, contentColor = Color.White),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Icon(
                    imageVector = if (target.isVideo) MeeshyIcons.Video else MeeshyIcons.Call,
                    contentDescription = null,
                    modifier = Modifier.padding(end = MeeshySpacing.sm),
                )
                Text(text = stringResource(R.string.call_link_confirm_call), fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.call_link_confirm_cancel), color = tokens.textPrimary)
            }
        }
    }
}
