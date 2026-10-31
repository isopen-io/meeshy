package me.meeshy.ui.component.message

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le bouton d'envoi du composer (iOS `sendButton`) : cercle plein de 44 au dégradé accent ->
 * secondaire, ombre de l'accent à 40 %, avion en papier blanc ; en édition, la coche sur le dégradé
 * d'alerte. Pas prêt, il s'efface (opacité 0) au lieu de griser. Un toucher rebondit (1,08). Site
 * UNIQUE, partagé par le composer du fil et la barre de commentaire (#13988).
 */
@Composable
public fun MessageComposerSendButton(
    enabled: Boolean,
    accentColor: Color,
    secondaryColor: Color,
    contentDescription: String,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    isEditing: Boolean = false,
) {
    val warning = MeeshyTheme.tokens.warning
    val brush = if (isEditing) {
        Brush.linearGradient(listOf(warning, warning.copy(alpha = 0.75f)))
    } else {
        MeeshyGradients.conversationAccent(accentColor, secondaryColor)
    }
    val shadowColor = if (isEditing) warning else accentColor
    var bounce by remember { mutableIntStateOf(0) }
    var bouncing by remember { mutableStateOf(false) }
    LaunchedEffect(bounce) {
        if (bounce == 0) return@LaunchedEffect
        bouncing = true
        delay(SEND_BOUNCE_MS)
        bouncing = false
    }
    val scale by animateFloatAsState(
        targetValue = if (bouncing) 1.08f else 1f,
        animationSpec = spring(dampingRatio = 0.5f, stiffness = MeeshyMotion.stiffnessForResponse(0.25f)),
        label = "composer-send-bounce",
    )
    Box(
        modifier = modifier
            .size(44.dp)
            .alpha(if (enabled) 1f else 0f)
            .scale(scale)
            .shadow(8.dp, CircleShape, clip = false, ambientColor = shadowColor.copy(alpha = 0.4f), spotColor = shadowColor.copy(alpha = 0.4f))
            .clip(CircleShape)
            .background(brush, CircleShape)
            .clickable(enabled = enabled, role = Role.Button) {
                bounce += 1
                onSend()
            }
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (isEditing) MeeshyIcons.Check else MeeshyIcons.Send,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(19.dp),
        )
    }
}

private const val SEND_BOUNCE_MS = 200L
