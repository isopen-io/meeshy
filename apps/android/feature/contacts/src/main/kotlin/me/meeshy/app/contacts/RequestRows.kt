package me.meeshy.app.contacts

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.friend.resolvedName
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.requestedLevel
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.format.RelativeTimeLongText
import me.meeshy.ui.format.rememberRelativeTimeLongStrings
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/** Cible tactile des deux boutons ronds d'une demande reçue. */
internal val RequestActionSize = 44.dp

private const val STATUS_ALPHA = 0.15f
private const val NEUTRAL_ALPHA = 0.15f
private const val OUTLINE_ALPHA = 0.4f

/**
 * Une demande REÇUE (iso `RequestsTab.receivedRow`) : avatar, nom, @identifiant, message de la demande (2 lignes) ou
 * l'intention par défaut, ancienneté relative longue, et deux boutons ronds de 44 dp — croix neutre (refuser) puis
 * coche verte en dégradé (accepter).
 */
@Composable
internal fun ReceivedRequestRow(
    request: FriendRequest,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val name = request.sender.displayLabel()
    RequestRowFrame(
        user = request.sender,
        userId = request.senderId,
        name = name,
        createdAt = request.createdAt,
        subtitle = request.personalMessage() ?: stringResource(R.string.contacts_requests_received_intent),
        level = request.raisedLevel(),
        levelCaption = R.string.circles_requests_incoming,
        onOpenProfile = onOpenProfile,
        modifier = modifier,
    ) {
        RoundRequestAction(
            icon = Icons.Filled.Close,
            description = stringResource(R.string.contacts_requests_reject_a11y, name),
            background = Modifier.background(MeeshyTheme.tokens.textSecondary.copy(alpha = NEUTRAL_ALPHA)),
            tint = MeeshyTheme.tokens.textSecondary,
            onClick = onDecline,
        )
        Spacer(Modifier.width(8.dp))
        RoundRequestAction(
            icon = Icons.Filled.Check,
            description = stringResource(R.string.contacts_requests_accept_a11y, name),
            background = Modifier.background(Brush.linearGradient(listOf(MeeshyPalette.Success, MeeshyPalette.SuccessDeep))),
            tint = Color.White,
            onClick = onAccept,
        )
    }
}

/**
 * Une demande ENVOYÉE : avatar, nom, @identifiant, ancienneté, capsule « En attente » (avertissement léger) et bouton
 * « Annuler » à contour d'erreur.
 */
@Composable
internal fun SentRequestRow(
    request: FriendRequest,
    onCancel: () -> Unit,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val name = request.receiver.displayLabel()
    val cancelDescription = stringResource(R.string.contacts_requests_cancel_a11y, name)
    RequestRowFrame(
        user = request.receiver,
        userId = request.receiverId,
        name = name,
        createdAt = request.createdAt,
        subtitle = null,
        level = request.raisedLevel(),
        levelCaption = R.string.circles_requests_outgoing,
        onOpenProfile = onOpenProfile,
        modifier = modifier,
    ) {
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = stringResource(R.string.contacts_discover_pending),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyPalette.Warning,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MeeshyPalette.Warning.copy(alpha = STATUS_ALPHA))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
            Text(
                text = stringResource(R.string.contacts_request_cancel),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyPalette.Error,
                modifier = Modifier
                    .heightIn(min = RequestActionSize)
                    .clip(CircleShape)
                    .border(1.dp, MeeshyPalette.Error.copy(alpha = OUTLINE_ALPHA), CircleShape)
                    .clickable(role = Role.Button, onClick = onCancel)
                    .semantics { contentDescription = cancelDescription }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun RoundRequestAction(
    icon: ImageVector,
    description: String,
    background: Modifier,
    tint: Color,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(RequestActionSize)
            .clip(CircleShape)
            .then(background),
    ) {
        Icon(icon, contentDescription = description, tint = tint, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun RequestRowFrame(
    user: FriendRequestUser?,
    userId: String,
    name: String,
    createdAt: String?,
    subtitle: String?,
    level: RelationLevel?,
    levelCaption: Int,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
    actions: @Composable () -> Unit,
) {
    val age = requestAge(createdAt)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = userId.isNotBlank(), onClick = onOpenProfile)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            context = AvatarContext.UserListItem,
            containerColor = hexColor(DynamicColorGenerator.colorForName(userId.ifBlank { name })),
            imageUrl = user?.avatar,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            user?.username?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = "@$it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            subtitle?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            level?.let {
                Text(
                    text = stringResource(levelCaption, levelTitle(it, null)),
                    style = MaterialTheme.typography.labelMedium,
                    color = it.tint(),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            age?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Row(horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            actions()
        }
    }
}

/** L'ancienneté relative LONGUE (« il y a 5 min », « hier »…) ; `null` quand la date n'est pas lisible. */
@Composable
private fun requestAge(createdAt: String?): String? {
    val strings = rememberRelativeTimeLongStrings()
    val locale: Locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    return remember(createdAt, strings, locale) {
        val millis = createdAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return@remember null
        RelativeTimeLongText.long(millis, System.currentTimeMillis(), ZoneId.systemDefault(), locale, strings)
    }
}

/** Le cran que vise une demande de montée (#13938) ; une demande d'Ami (sens historique) ou illisible reste simple. */
private fun FriendRequest.raisedLevel(): RelationLevel? = requestedLevel?.takeUnless { it == RelationLevel.FRIEND }

private fun FriendRequestUser?.displayLabel(): String = this?.resolvedName?.takeIf { it.isNotBlank() } ?: "?"
