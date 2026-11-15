package me.meeshy.app.auth.invite

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.theme.MeeshyPalette

internal val InviteCardRadius: Dp = 28.dp

/** Les encres de la page d'invitation, résolues une fois selon le thème. */
internal object InviteInk {
    fun title(isDark: Boolean): Color = if (isDark) MeeshyPalette.Indigo50 else MeeshyPalette.Indigo950
    fun muted(isDark: Boolean): Color = if (isDark) MeeshyPalette.Indigo200 else MeeshyPalette.Neutral500
    fun body(isDark: Boolean): Color = if (isDark) MeeshyPalette.Indigo100 else MeeshyPalette.Indigo950.copy(alpha = 0.8f)
    fun accent(isDark: Boolean): Color = if (isDark) MeeshyPalette.Indigo300 else MeeshyPalette.Indigo600
    fun hairline(isDark: Boolean): Color = if (isDark) MeeshyPalette.Indigo800.copy(alpha = 0.55f) else MeeshyPalette.Indigo100
    fun well(isDark: Boolean): Color = if (isDark) MeeshyPalette.Indigo900.copy(alpha = 0.6f) else MeeshyPalette.Indigo50
}

/**
 * La surface d'une carte de la page : blanche en clair, indigo profond en sombre, bord discret —
 * la même pour chaque section. L'ombre indigo ne se pose qu'en clair. Miroir de `InviteCardSurface` (iOS).
 */
internal fun Modifier.inviteCardSurface(isDark: Boolean, radius: Dp = 20.dp, elevated: Boolean = false): Modifier {
    val shape = RoundedCornerShape(radius)
    val shadowed = if (elevated && !isDark) {
        shadow(10.dp, shape, ambientColor = MeeshyPalette.Indigo600.copy(alpha = 0.14f), spotColor = MeeshyPalette.Indigo600.copy(alpha = 0.14f))
    } else {
        this
    }
    return shadowed
        .background(if (isDark) MeeshyPalette.Indigo950.copy(alpha = 0.72f) else Color.White, shape)
        .border(1.dp, InviteInk.hairline(isDark), shape)
}

/** L'espacement des capitales coupe les ligatures d'une écriture liée (arabe) : nul en RTL. */
@Composable
internal fun scriptSafeSpacing(amount: Float): androidx.compose.ui.unit.TextUnit =
    if (androidx.compose.ui.platform.LocalLayoutDirection.current == androidx.compose.ui.unit.LayoutDirection.Rtl) 0.sp else amount.sp

/** Le titre de section en capitales (« ON Y PARLE »), annoncé comme titre. */
@Composable
internal fun InviteSectionTitle(text: String, isDark: Boolean, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        modifier = modifier.semantics { heading() },
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.ExtraBold,
        letterSpacing = scriptSafeSpacing(1.1f),
        color = InviteInk.accent(isDark),
    )
}
