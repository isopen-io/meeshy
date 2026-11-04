package me.meeshy.ui.component.people

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Un onglet de la barre d'un hub (iOS `HubTabButton`) : icône, titre caption semibold, badge rond indigo500 si
 * [badge] > 0, soulignement de 2 dp indigo500 animé par ressort (réponse 0,3, amortissement 0,7). Non
 * sélectionné, l'onglet est en `textMuted`. TalkBack : « Onglet X », état sélectionné, valeur du badge.
 */
@Composable
public fun HubTabButton(
    icon: ImageVector,
    title: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    badge: Int = 0,
) {
    val tint = if (isSelected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted
    val description = "${stringResource(R.string.contacts_tab_prefix)} $title"
    val reduceMotion = LocalReduceMotion.current
    val underline by animateFloatAsState(
        targetValue = if (isSelected) 1f else 0f,
        animationSpec = if (reduceMotion) snap() else spring(
            dampingRatio = 0.7f,
            stiffness = MeeshyMotion.stiffnessForResponse(0.3f),
        ),
        label = "hubTabUnderline",
    )
    Column(
        modifier = modifier
            .defaultMinSize(minHeight = MeeshyControlSize.minTouchTarget)
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                selected = isSelected
                if (badge > 0) stateDescription = badge.toString()
            }
            .padding(top = MeeshySpacing.smPlus),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(MeeshyIconSize.md))
            Text(
                text = title,
                color = tint,
                fontSize = MeeshyFontSize.caption,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            if (badge > 0) {
                Box(
                    modifier = Modifier.defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
                        .background(MeeshyPalette.Indigo500, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = badge.toString(),
                        color = Color.White,
                        fontSize = MeeshyFontSize.micro,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth(underline)
                .height(2.dp)
                .background(MeeshyPalette.Indigo500),
        )
    }
}
