package me.meeshy.ui.component.message

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le verre « dans le verre » des contrôles du composer ((+), champ, bande d'emojis) : un lavis
 * clair et le liseré liquide, sans second flou (iOS `adaptiveLiquidGlass` sur la plaque). Site
 * UNIQUE, partagé par le composer du fil et la barre de commentaire (#13988).
 */
@Composable
public fun Modifier.meeshyComposerGlass(shape: Shape, tint: Color? = null): Modifier {
    val dark = MeeshyTheme.isDark
    val wash = Color.White.copy(alpha = if (dark) 0.08f else 0.5f)
    return this
        .clip(shape)
        .background(wash, shape)
        .then(if (tint != null) Modifier.background(tint.copy(alpha = if (dark) 0.35f else 0.25f), shape) else Modifier)
        .border(1.dp, MeeshyGradients.liquidGlassRim(dark, tint != null), shape)
}

/**
 * Un bouton rond de verre de 44 dp posé à côté de la capsule (le (+) du fil, la pièce jointe d'un
 * commentaire). Inactif, il s'estompe sans disparaître : on voit qu'il existe.
 */
@Composable
public fun MessageComposerGlassAction(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color = MeeshyTheme.tokens.textSecondary,
) {
    Box(
        modifier = modifier
            .size(44.dp)
            .alpha(if (enabled) 1f else 0.45f)
            .meeshyComposerGlass(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(21.dp))
    }
}
