package me.meeshy.app.auth.visitor

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.visitor.VisitorContentKind
import me.meeshy.sdk.model.visitor.VisitorContentState
import me.meeshy.sdk.model.visitor.VisitorInvitationAction
import me.meeshy.sdk.model.visitor.VisitorSharerName
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La carte d'invitation d'un visiteur (iOS `VisitorInvitationCard`) : qui a partage, pourquoi se connecter, les gestes. */
@Composable
internal fun VisitorInvitationCard(
    kind: VisitorContentKind,
    state: VisitorContentState,
    onAction: (VisitorInvitationAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val sharer = (state as? VisitorContentState.Served)?.sharer
    Column(
        modifier = modifier
            .navigationBarsPadding()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.lg)
            .clip(RoundedCornerShape(MeeshyRadius.xxl))
            .background(tokens.backgroundSecondary)
            .padding(MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        if (sharer != null) {
            MeeshyAvatar(name = VisitorSharerName.of(sharer), imageUrl = sharer.avatar)
        }
        Text(
            text = title(kind, state, sharerName = sharer?.let(VisitorSharerName::of)),
            style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = message(state),
            style = androidx.compose.material3.MaterialTheme.typography.bodyLarge,
            color = tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), modifier = Modifier.fillMaxWidth()) {
            VisitorInvitationAction.actions(state).forEach { action -> ActionButton(action) { onAction(action) } }
        }
    }
}

@Composable
private fun title(kind: VisitorContentKind, state: VisitorContentState, sharerName: String?): String = when {
    state == VisitorContentState.Refused -> stringResource(R.string.visitor_refused_title)
    sharerName == null -> stringResource(R.string.visitor_title)
    else -> stringResource(
        when (kind) {
            VisitorContentKind.REEL -> R.string.visitor_shared_by_reel
            VisitorContentKind.POST -> R.string.visitor_shared_by_post
            VisitorContentKind.STORY -> R.string.visitor_shared_by_story
        },
        sharerName,
    )
}

@Composable
private fun message(state: VisitorContentState): String = stringResource(
    when (state) {
        VisitorContentState.Refused -> R.string.visitor_refused_body
        is VisitorContentState.Failed -> R.string.visitor_failed_body
        VisitorContentState.Pending, is VisitorContentState.Served -> R.string.visitor_body
    },
)

@Composable
private fun ActionButton(action: VisitorInvitationAction, onClick: () -> Unit) {
    when (action) {
        VisitorInvitationAction.SIGN_UP -> MeeshyPrimaryButton(
            text = stringResource(R.string.visitor_signup),
            onClick = onClick,
            modifier = Modifier.fillMaxWidth(),
        )
        VisitorInvitationAction.SIGN_IN, VisitorInvitationAction.RETRY -> OutlinedButton(
            onClick = onClick,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) {
            Text(
                text = stringResource(if (action == VisitorInvitationAction.RETRY) R.string.visitor_retry else R.string.visitor_login),
                color = MeeshyPalette.Indigo500,
            )
        }
        VisitorInvitationAction.KEEP_WATCHING -> Text(
            text = stringResource(R.string.visitor_later),
            color = MeeshyPalette.Indigo500,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onClick).padding(top = MeeshySpacing.md),
        )
    }
}
