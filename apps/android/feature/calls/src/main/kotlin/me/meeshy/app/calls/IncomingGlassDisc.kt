package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.ui.motion.pressable

private val DISC_SIZE = 64.dp

/**
 * P17.13 : le disque de verre d'un bouton de l'écran entrant (Refuser, Sans vidéo, Répondre), comme iOS
 * `adaptiveGlassProminent` / `adaptiveLiquidGlass`. Un [IncomingChoiceLook.fill] teinte le verre (et le double d'un
 * lavis plein, comme Fin) ; sans teinte, c'est le verre neutre du bouton d'appel. Le verre s'éclaircit sous le doigt.
 */
@Composable
internal fun IncomingGlassDisc(look: IncomingChoiceLook, contentDescription: String, hint: String, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val modifier = Modifier
        .size(DISC_SIZE)
        .pressable()
        .clickable(interactionSource = source, indication = null, onClickLabel = hint, role = Role.Button, onClick = onClick)
        .semantics { this.contentDescription = contentDescription }
    val glyph = @Composable { Icon(look.icon, contentDescription = null, tint = look.glyph) }
    val fill = look.fill
    if (fill == null) {
        CallGlassButtonSurface(role = CallButtonRole.Neutral, shape = CircleShape, isPressed = pressed, modifier = modifier) { glyph() }
        return
    }
    CallGlassPlate(modifier = modifier, shape = CircleShape, tint = fill, liquid = true) {
        Box(Modifier.matchParentSize().background(fill).background(CallButtonFill.pressedHighlight(pressed)))
        Box(Modifier.align(Alignment.Center)) { glyph() }
    }
}
