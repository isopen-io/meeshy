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
import androidx.compose.ui.semantics.clearAndSetSemantics
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
import me.meeshy.ui.component.circles.CircleRaiseTrailing
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.summaryText
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private const val UNKNOWN_NAME = "?"

/** La goutte du Sang, l'icône de repli du niveau (`CircleLevelIcons`). */
internal val BLOOD_GLYPH: String = me.meeshy.sdk.model.relation.CircleLevelIcons.of(RelationLevel.BLOOD)

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
                presence = rememberPresence(link.userId),
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
        CircleRaiseTrailing(link = link, name = name, pending = pending, config = config, onRaise = onRaise)
    }
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
            presence = rememberPresence(otherId),
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
                RoundAction(MeeshyIcons.Close, MeeshyTheme.tokens.textSecondary, stringResource(R.string.circles_requests_decline), shown, onDecline)
                if (isBlood) {
                    RitualAction(stringResource(R.string.circles_requests_ritual), shown, onRitual)
                } else {
                    RoundAction(MeeshyIcons.Check, MeeshyPalette.Success, stringResource(R.string.circles_requests_accept), shown, onAccept)
                }
            } else {
                if (isBlood) {
                    RitualAction(stringResource(R.string.circles_requests_ritual), shown, onRitual)
                }
                RoundAction(MeeshyIcons.Close, MeeshyTheme.tokens.textSecondary, stringResource(R.string.circles_requests_cancel), shown, onCancel)
            }
        }
    }
}

/** Le rituel se signale par la goutte du Sang (🩸, l'icône servie du niveau) : aucune glyphe Material ne la dit. */
@Composable
private fun RitualAction(label: String, name: String, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(MeeshyPalette.Error.copy(alpha = 0.15f))
            .semantics { contentDescription = "$label — $name" },
    ) {
        Text(text = BLOOD_GLYPH, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.clearAndSetSemantics {})
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
