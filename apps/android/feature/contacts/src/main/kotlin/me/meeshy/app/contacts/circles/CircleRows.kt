package me.meeshy.app.contacts.circles

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Opacity
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.CircleProgressSummary
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.sdk.model.relation.RelationRaiseOffer
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.sdk.model.relation.requestedLevel
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private const val UNKNOWN_NAME = "?"

/**
 * La ligne d'un lien (#13938) — iso `CircleRowView` : la personne, son niveau, ce qui manque pour monter, et l'action de
 * montée quand la loi de demande la laisse proposer. Toucher la ligne ouvre la fiche du lien.
 */
@Composable
internal fun CircleLinkRow(
    link: RelationLink,
    person: CirclePerson?,
    pending: RelationLevel?,
    config: RelationsConfig?,
    onOpen: () -> Unit,
    onRaise: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val name = person?.name?.takeIf { it.isNotBlank() } ?: UNKNOWN_NAME
    val line = summaryText(CircleProgressSummary.of(link), config)
    val levelName = levelTitle(link.effectiveLevel, config)
    val description = listOfNotNull(name, levelName, line).joinToString(", ")
    Row(
        modifier = modifier
            .fillMaxWidth()
            .animateContentSize()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clickable(role = Role.Button, onClick = onOpen)
                .semantics(mergeDescendants = true) { contentDescription = description },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(
                name = name,
                size = 44.dp,
                containerColor = hexColor(DynamicColorGenerator.colorForName(link.userId)),
                imageUrl = person?.avatarUrl,
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                line?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Spacer(Modifier.width(8.dp))
        RaiseTrailing(link = link, name = name, pending = pending, config = config, onRaise = onRaise)
    }
}

@Composable
private fun RaiseTrailing(
    link: RelationLink,
    name: String,
    pending: RelationLevel?,
    config: RelationsConfig?,
    onRaise: () -> Unit,
) {
    if (pending != null) {
        Text(
            text = stringResource(R.string.circles_pending, levelTitle(pending, config)),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.End,
            modifier = Modifier.widthIn(max = 120.dp),
        )
        return
    }
    val offer = link.raiseOffer() as? RelationRaiseOffer.Available ?: return
    val targetTitle = levelTitle(offer.target, config)
    val a11y = stringResource(R.string.circles_action_request_a11y, targetTitle, name)
    Text(
        text = stringResource(R.string.circles_action_request, targetTitle),
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        modifier = Modifier
            .heightIn(min = 44.dp)
            .clip(CircleShape)
            .background(offer.target.tint())
            .clickable(role = Role.Button, onClick = onRaise)
            .semantics { contentDescription = a11y }
            .padding(horizontal = 12.dp, vertical = 12.dp),
    )
}

/**
 * La ligne d'une demande de montée (#13938) — iso `CircleRequestRow` : reçue (accepter / refuser) ou envoyée (annuler).
 * Une demande de SANG n'a pas de « accepter » : c'est le rituel qui la scelle.
 */
@Composable
internal fun CircleRequestRow(
    request: FriendRequest,
    incoming: Boolean,
    name: String?,
    config: RelationsConfig?,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    onRitual: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shown = name?.takeIf { it.isNotBlank() } ?: UNKNOWN_NAME
    val otherId = if (incoming) request.senderId else request.receiverId
    val avatar = if (incoming) request.sender?.avatar else request.receiver?.avatar
    val level = request.requestedLevel ?: RelationLevel.FRIEND
    val levelName = levelTitle(level, config)
    val caption = if (incoming) {
        stringResource(R.string.circles_requests_incoming, levelName)
    } else {
        stringResource(R.string.circles_requests_outgoing, levelName)
    }
    val isBlood = level == RelationLevel.BLOOD
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = shown,
            size = 44.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(otherId.ifBlank { shown })),
            imageUrl = avatar,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = shown,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = caption,
                style = MaterialTheme.typography.bodySmall,
                color = level.tint(),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (incoming) {
                RoundAction(Icons.Filled.Close, MeeshyTheme.tokens.textSecondary, stringResource(R.string.circles_requests_decline), shown, onDecline)
                if (isBlood) {
                    RoundAction(Icons.Filled.Opacity, MeeshyPalette.Error, stringResource(R.string.circles_requests_ritual), shown, onRitual)
                } else {
                    RoundAction(Icons.Filled.Check, MeeshyPalette.Success, stringResource(R.string.circles_requests_accept), shown, onAccept)
                }
            } else {
                if (isBlood) {
                    RoundAction(Icons.Filled.Opacity, MeeshyPalette.Error, stringResource(R.string.circles_requests_ritual), shown, onRitual)
                }
                RoundAction(Icons.Filled.Close, MeeshyTheme.tokens.textSecondary, stringResource(R.string.circles_requests_cancel), shown, onCancel)
            }
        }
    }
}

@Composable
private fun RoundAction(icon: ImageVector, tint: Color, label: String, name: String, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(tint.copy(alpha = 0.15f)),
    ) {
        Icon(icon, contentDescription = "$label — $name", tint = tint, modifier = Modifier.size(18.dp))
    }
}
