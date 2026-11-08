package me.meeshy.ui.component.identity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import me.meeshy.sdk.model.MemberRole
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Le badge d'un rôle : créateur ambre, admin indigo 500, modérateur indigo 400, membre rien. */
public enum class RoleBadgeStyle {
    Creator, Admin, Moderator;

    public val color: Color
        get() = when (this) {
            Creator -> MeeshyPalette.Warning
            Admin -> MeeshyPalette.Indigo500
            Moderator -> MeeshyPalette.Indigo400
        }

    public companion object {
        public fun of(role: MemberRole): RoleBadgeStyle? = when (role) {
            MemberRole.CREATOR -> Creator
            MemberRole.ADMIN -> Admin
            MemberRole.MODERATOR -> Moderator
            MemberRole.MEMBER -> null
        }
    }
}

private fun RoleBadgeStyle.icon(): ImageVector = when (this) {
    RoleBadgeStyle.Creator -> MeeshyIcons.Premium
    RoleBadgeStyle.Admin -> MeeshyIcons.AdminPanel
    RoleBadgeStyle.Moderator -> MeeshyIcons.ShieldFilled
}

@Composable
private fun RoleBadgeStyle.label(): String = when (this) {
    RoleBadgeStyle.Creator -> stringResource(R.string.identity_role_creator)
    RoleBadgeStyle.Admin -> stringResource(R.string.identity_role_admin)
    RoleBadgeStyle.Moderator -> stringResource(R.string.identity_role_moderator)
}

/** Icône + libellé du rôle ; ne rend rien pour un simple membre. */
@Composable
public fun RoleBadge(role: MemberRole, modifier: Modifier = Modifier) {
    val style = RoleBadgeStyle.of(role) ?: return
    val label = style.label()
    Row(
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Icon(style.icon(), contentDescription = null, tint = style.color, modifier = Modifier.size(MeeshyIconSize.xs))
        Text(
            text = label,
            fontSize = MeeshyFontSize.footnote,
            color = style.color,
            maxLines = 1,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}
