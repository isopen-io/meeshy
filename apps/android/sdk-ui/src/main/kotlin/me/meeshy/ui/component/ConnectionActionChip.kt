package me.meeshy.ui.component

import android.provider.Settings
import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.friend.ConnectionActionRender
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Minimum touch target of every gesture the chip exposes. */
public val ConnectionActionMinTarget: Dp = 44.dp

private const val TINT_ALPHA = 0.15f
private const val OUTLINE_ALPHA = 0.4f

/** Container colour of the "Ajouter" capsule — the accent of the hosting context, never a fixed colour. */
internal fun addCapsuleColor(accent: Color): Color = accent

/**
 * The single "Ajouter / En attente / Accepter-Refuser / Contact / Bloqué" control of
 * any user row or profile — port of iOS `ConnectionActionView`. Stateless: the
 * [render] decision comes from `ConnectionActionRender` and every gesture is a
 * callback owned by `ConnectionActionController` (optimistic + rollback).
 *
 * @param accent the colour of the surrounding context (conversation or profile accent).
 */
@Composable
public fun ConnectionActionChip(
    render: ConnectionActionRender,
    userName: String,
    accent: Color,
    onAdd: () -> Unit,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val context = LocalContext.current
    val reduceMotion = remember(context) { animationsDisabled(context.contentResolver) }
    val fade: FiniteAnimationSpec<Float> = if (reduceMotion) snap() else connectionSpring()
    AnimatedContent(
        targetState = render,
        modifier = modifier,
        contentKey = { it::class },
        transitionSpec = {
            val enter = fadeIn(fade) + if (reduceMotion) scaleIn(snap()) else scaleIn(connectionSpring(), initialScale = 0.85f)
            val exit = fadeOut(fade) + if (reduceMotion) scaleOut(snap()) else scaleOut(connectionSpring(), targetScale = 0.85f)
            enter togetherWith exit
        },
        label = "connectionAction",
    ) { current ->
        when (current) {
            ConnectionActionRender.Hidden -> Unit
            ConnectionActionRender.BlockedBadge -> Badge(
                text = stringResource(R.string.connection_badge_blocked),
                color = MeeshyPalette.Error,
                icon = null,
            )
            ConnectionActionRender.ContactBadge -> Badge(
                text = stringResource(R.string.connection_badge_contact),
                color = MeeshyPalette.Success,
                icon = Icons.Filled.Check,
            )
            is ConnectionActionRender.AcceptDecline -> AcceptDeclineButtons(userName, enabled, onAccept, onDecline)
            ConnectionActionRender.PendingSent -> PendingCapsule(userName, enabled, onCancel)
            ConnectionActionRender.Add -> AddCapsule(userName, accent, enabled, onAdd)
        }
    }
}

private fun connectionSpring(): androidx.compose.animation.core.SpringSpec<Float> =
    spring(dampingRatio = 0.85f, stiffness = MeeshyMotion.stiffnessForResponse(0.35f))

private fun animationsDisabled(resolver: android.content.ContentResolver): Boolean =
    runCatching {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }.getOrDefault(false)

@Composable
private fun Badge(text: String, color: Color, icon: androidx.compose.ui.graphics.vector.ImageVector?) {
    Row(
        modifier = Modifier
            .defaultMinSize(minHeight = ConnectionActionMinTarget)
            .semantics(mergeDescendants = true) { contentDescription = text },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .background(color.copy(alpha = TINT_ALPHA), CircleShape)
                .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            icon?.let { Icon(it, contentDescription = null, tint = color, modifier = Modifier.size(12.dp)) }
            Text(text, color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun AcceptDeclineButtons(userName: String, enabled: Boolean, onAccept: () -> Unit, onDecline: () -> Unit) {
    val declineLabel = userLabel(R.string.connection_action_decline, userName)
    val acceptLabel = userLabel(R.string.connection_action_accept, userName)
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        RoundButton(
            label = declineLabel,
            enabled = enabled,
            onClick = onDecline,
            fill = MeeshyPalette.Error.copy(alpha = TINT_ALPHA),
            icon = Icons.Filled.Close,
            tint = MeeshyPalette.Error,
        )
        RoundButton(
            label = acceptLabel,
            enabled = enabled,
            onClick = onAccept,
            fill = MeeshyPalette.Success,
            icon = Icons.Filled.Check,
            tint = Color.White,
        )
    }
}

@Composable
private fun RoundButton(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    fill: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
) {
    Box(
        modifier = Modifier
            .size(ConnectionActionMinTarget)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.size(32.dp).background(fill, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
private fun PendingCapsule(userName: String, enabled: Boolean, onCancel: () -> Unit) {
    val label = userLabel(R.string.connection_action_cancel, userName)
    val color = MeeshyPalette.Warning
    Box(
        modifier = Modifier
            .defaultMinSize(minHeight = ConnectionActionMinTarget)
            .clickable(enabled = enabled, role = Role.Button, onClick = onCancel)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        CapsuleContent(
            text = stringResource(R.string.connection_badge_pending_sent),
            icon = Icons.Filled.Schedule,
            contentColor = color,
            modifier = Modifier
                .background(color.copy(alpha = TINT_ALPHA), CircleShape)
                .border(1.dp, color.copy(alpha = OUTLINE_ALPHA), CircleShape),
        )
    }
}

@Composable
private fun AddCapsule(userName: String, accent: Color, enabled: Boolean, onAdd: () -> Unit) {
    val label = userLabel(R.string.connection_action_add, userName)
    Box(
        modifier = Modifier
            .defaultMinSize(minHeight = ConnectionActionMinTarget)
            .clickable(enabled = enabled, role = Role.Button, onClick = onAdd)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        CapsuleContent(
            text = stringResource(R.string.connection_action_add),
            icon = Icons.Filled.PersonAdd,
            contentColor = Color.White,
            modifier = Modifier.background(addCapsuleColor(accent), RoundedCornerShape(percent = 50)),
        )
    }
}

@Composable
private fun CapsuleContent(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentColor: Color,
    modifier: Modifier,
) {
    Row(
        modifier = modifier.padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(12.dp))
        Spacer(Modifier.width(MeeshySpacing.xs))
        Text(text, color = contentColor, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun userLabel(@StringRes action: Int, userName: String): String =
    stringResource(R.string.connection_a11y_with_user, stringResource(action), userName)
