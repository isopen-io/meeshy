package me.meeshy.app.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.NotificationMilestone
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le disque en dégradé d'accent qui tient la place de l'avatar quand la rangée n'a pas d'acteur à montrer :
 * accent 0,30 -> 0,12 en clair, 0,55 -> 0,22 en sombre, bord d'1 dp, ombre d'accent (iOS `milestoneMedallion`).
 * Décoratif — c'est le titre de la rangée qui dit ce qu'il célèbre.
 */
@Composable
internal fun NotificationMedallion(accent: Color, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val isDark = MeeshyTheme.isDark
    val gradient = Brush.linearGradient(
        listOf(accent.copy(alpha = if (isDark) 0.55f else 0.30f), accent.copy(alpha = if (isDark) 0.22f else 0.12f)),
    )
    Box(
        modifier = modifier
            .size(MEDALLION_SIZE)
            .shadow(6.dp, CircleShape, ambientColor = accent.copy(alpha = 0.3f), spotColor = accent.copy(alpha = 0.3f))
            .clip(CircleShape)
            .background(gradient)
            .border(BorderStroke(1.dp, accent.copy(alpha = 0.5f)), CircleShape)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) { content() }
}

/** Le médaillon d'un palier : l'icône du badge, du trophée, du niveau ou de la série. */
@Composable
internal fun NotificationMilestoneMedallion(milestone: NotificationMilestone, accent: Color, modifier: Modifier = Modifier) {
    NotificationMedallion(accent, modifier) {
        Icon(
            imageVector = milestone.icon(),
            contentDescription = null,
            tint = if (MeeshyTheme.isDark) Color.White else accent,
            modifier = Modifier.size(24.dp),
        )
    }
}

private fun NotificationMilestone.icon(): ImageVector = when (this) {
    is NotificationMilestone.Badge -> MeeshyIcons.Badge
    is NotificationMilestone.Achievement -> MeeshyIcons.Trophy
    is NotificationMilestone.Level -> MeeshyIcons.StarFilled
    is NotificationMilestone.Streak -> MeeshyIcons.FlameFilled
}

internal val MEDALLION_SIZE = 44.dp
