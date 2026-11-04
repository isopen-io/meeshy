package me.meeshy.ui.component.people

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que la ligne propose : écrire à un compte Meeshy, ou inviter un contact du carnet qui n'en a pas. */
@Immutable
public enum class DirectoryPersonAction(internal val icon: ImageVector, internal val isFilled: Boolean) {
    Write(MeeshyIcons.ChatBubble, isFilled = true),
    Invite(MeeshyIcons.Send, isFilled = false),
}

/**
 * La ligne « une personne + une action » de l'annuaire (iOS `DirectoryPersonRow`) : avatar, nom, sous-titre,
 * capsule « Lui écrire » (pleine indigo500) ou « Inviter » (contour). Tous ses paramètres sont stables
 * (primitives, enum, références servies) : la ligne est sautée à la recomposition tant que la personne montrée
 * ne change pas. [accessibilityDetail] complète le nom lu par TalkBack (« sur Meeshy »…).
 */
@Composable
public fun DirectoryPersonRow(
    name: String,
    action: DirectoryPersonAction,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    imageUrl: String? = null,
    presence: PresenceState? = null,
    ring: ServedProfileDecorItem? = null,
    accessibilityDetail: String? = null,
) {
    val tokens = MeeshyTheme.tokens
    val rowLabel = PersonRowLabels.join(name, subtitle, accessibilityDetail)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.md)
            .semantics { contentDescription = rowLabel },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
    ) {
        PersonAvatar(name = name, imageUrl = imageUrl, presence = presence, ring = ring)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(
                text = name,
                color = tokens.textPrimary,
                fontSize = MeeshyFontSize.subhead,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrEmpty()) {
                Text(
                    text = subtitle,
                    color = tokens.textMuted,
                    fontSize = MeeshyFontSize.small,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        DirectoryActionCapsule(action = action, onClick = onAction)
    }
}

@Composable
private fun DirectoryActionCapsule(action: DirectoryPersonAction, onClick: () -> Unit) {
    val title = stringResource(
        if (action == DirectoryPersonAction.Write) R.string.contacts_phonebook_write else R.string.contacts_phonebook_invite,
    )
    val shape = RoundedCornerShape(MeeshyRadius.pill)
    val contentColor = if (action.isFilled) Color.White else MeeshyPalette.Indigo500
    Box(
        modifier = Modifier
            .defaultMinSize(minHeight = MeeshyControlSize.minTouchTarget)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = title },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .background(if (action.isFilled) MeeshyPalette.Indigo500 else Color.Transparent, shape)
                .border(
                    MeeshyBorder.regular,
                    if (action.isFilled) Color.Transparent else MeeshyPalette.Indigo500.copy(alpha = MeeshyOpacity.strong),
                    shape,
                )
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(action.icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(MeeshyIconSize.xs))
            Text(text = title, color = contentColor, fontSize = MeeshyFontSize.small, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}
