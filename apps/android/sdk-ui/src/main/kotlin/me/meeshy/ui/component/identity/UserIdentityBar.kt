package me.meeshy.ui.component.identity

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.avatar.AvatarGestureHost
import me.meeshy.ui.component.avatar.AvatarGestures
import me.meeshy.ui.component.bubble.CompactFlagChip
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** L'avatar de la barre : l'accent est reçu en paramètre (jamais recalculé ici). */
@Immutable
public class IdentityAvatarConfig(
    public val context: AvatarContext,
    public val containerColor: Color,
    public val imageUrl: String? = null,
    public val presence: PresenceState? = null,
    public val moodEmoji: String? = null,
    public val gestures: AvatarGestures? = null,
)

/**
 * L'en-tête d'identité d'un message, d'un post ou d'un commentaire (iOS `UserIdentityBar`) : un avatar
 * optionnel, puis deux lignes déclaratives de [IdentityBarElement]. Une seule ligne par rangée ; le nom
 * se tronque en premier, puis le pseudo, jamais l'heure, le statut ni les drapeaux.
 * [tint] = couleur méta d'une bulle sortante teintée (heure et statut), `null` = texte secondaire.
 */
@Composable
public fun UserIdentityBar(
    slots: IdentityBarSlots,
    modifier: Modifier = Modifier,
    name: String? = null,
    avatar: IdentityAvatarConfig? = null,
    tint: Color? = null,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (avatar != null) IdentityAvatar(avatar, name.orEmpty())
        Column(
            modifier = Modifier.weight(1f, fill = false),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            IdentityRow(slots.leadingPrimary, slots.trailingPrimary, name, tint)
            if (slots.hasSecondaryRow) IdentityRow(slots.leadingSecondary, slots.trailingSecondary, name, tint)
        }
    }
}

@Composable
private fun IdentityAvatar(config: IdentityAvatarConfig, name: String) {
    val face: @Composable () -> Unit = {
        MeeshyAvatar(
            name = name,
            context = config.context,
            containerColor = config.containerColor,
            imageUrl = config.imageUrl,
            presence = config.presence,
            moodEmoji = config.moodEmoji,
            enablePulse = false,
        )
    }
    val gestures = config.gestures
    if (gestures == null) face() else AvatarGestureHost(
        gestures = gestures,
        contextTappable = true,
        isUser = true,
        storyUnread = false,
        hasStory = gestures.onViewStory != null,
        content = face,
    )
}

@Composable
private fun IdentityRow(
    leading: List<IdentityBarElement>,
    trailing: List<IdentityBarElement>,
    name: String?,
    tint: Color?,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        // Les groupes de fin ne cèdent jamais : le début prend le reste et c'est lui qui se tronque.
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) { leading.forEach { IdentityElement(it, name, tint, truncating(it)) } }
        trailing.forEach { IdentityElement(it, name, tint, Modifier) }
    }
}

private fun RowScope.truncating(element: IdentityBarElement): Modifier = when (element.truncation) {
    IdentityTruncation.First -> Modifier.weight(1f, fill = false)
    IdentityTruncation.Second -> Modifier.widthIn(max = 160.dp)
    IdentityTruncation.Never -> Modifier
}

@Composable
private fun IdentityElement(element: IdentityBarElement, name: String?, tint: Color?, modifier: Modifier) {
    val secondary = tint ?: MeeshyTheme.tokens.textSecondary
    when (element) {
        IdentityBarElement.Name -> if (name != null) Text(
            text = name, fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier,
        )
        is IdentityBarElement.Username -> MetaText(element.value, MeeshyTheme.tokens.textSecondary, modifier)
        is IdentityBarElement.RoleBadge -> RoleBadge(element.role, modifier)
        is IdentityBarElement.Time -> Text(
            text = element.value, fontSize = MeeshyFontSize.footnote, fontWeight = FontWeight.Medium,
            color = secondary, maxLines = 1, modifier = modifier,
        )
        is IdentityBarElement.Delivery -> DeliveryStatusGlyphView(element.status, secondary, tinted = tint != null, modifier = modifier)
        is IdentityBarElement.Flags -> FlagsRow(element, modifier)
        is IdentityBarElement.TranslateButton -> TranslateButton(element.onClick, modifier)
        is IdentityBarElement.Presence -> PresenceLabel(element.state, modifier)
        is IdentityBarElement.MemberSince -> MetaText(element.value, MeeshyTheme.tokens.textSecondary, modifier)
        is IdentityBarElement.ActionButton -> PillButton(element.label, modifier = modifier, onClick = element.onClick)
        is IdentityBarElement.ActionMenu -> ActionMenuPill(element, modifier)
        is IdentityBarElement.Text -> MetaText(element.value, MeeshyTheme.tokens.textSecondary, modifier)
    }
}

@Composable
private fun MetaText(value: String, color: Color, modifier: Modifier) {
    Text(text = value, fontSize = MeeshyFontSize.footnote, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)
}

@Composable
private fun FlagsRow(flags: IdentityBarElement.Flags, modifier: Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs), verticalAlignment = Alignment.CenterVertically) {
        flags.chips.forEach { chip ->
            val showLabel = stringResource(R.string.userIdentity_language_show_a11y, chip.info?.name ?: chip.code)
            Box(
                modifier = Modifier.semantics { contentDescription = showLabel },
            ) { CompactFlagChip(chip, MeeshyTheme.tokens.textSecondary, flags.onTap) }
        }
    }
}

@Composable
private fun TranslateButton(onClick: () -> Unit, modifier: Modifier) {
    val label = stringResource(R.string.userIdentity_translation_available)
    Box(
        modifier = modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { role = Role.Button; contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(MeeshyIcons.Translate, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(MeeshyIconSize.xs))
    }
}

@Composable
private fun PresenceLabel(state: PresenceState, modifier: Modifier) {
    val dot = meeshyPresenceDotColor(state) ?: return
    val label = when (state) {
        PresenceState.ONLINE -> stringResource(R.string.presence_online)
        PresenceState.AWAY -> stringResource(R.string.presence_away)
        PresenceState.IDLE -> stringResource(R.string.presence_idle)
        PresenceState.OFFLINE -> return
    }
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Box(Modifier.size(6.dp).background(dot, CircleShape))
        Text(text = label, fontSize = MeeshyFontSize.footnote, color = dot, maxLines = 1)
    }
}

@Composable
private fun PillButton(label: String, modifier: Modifier, trailing: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(percent = 50))
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .background(MeeshyPalette.Indigo500.copy(alpha = MeeshyOpacity.light), RoundedCornerShape(percent = 50))
                .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Text(label, fontSize = MeeshyFontSize.small, fontWeight = FontWeight.Medium, color = MeeshyPalette.Indigo500, maxLines = 1)
            trailing?.invoke()
        }
    }
}

@Composable
private fun ActionMenuPill(menu: IdentityBarElement.ActionMenu, modifier: Modifier) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        PillButton(
            label = menu.label,
            modifier = Modifier,
            trailing = { Icon(MeeshyIcons.ChevronDown, null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(MeeshyIconSize.xs)) },
            onClick = { expanded = true },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            menu.items.forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.label, color = if (item.isDestructive) MeeshyPalette.Error else Color.Unspecified) },
                    onClick = { expanded = false; item.onClick() },
                )
            }
        }
    }
}
