package me.meeshy.app.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.composer.ComposerCounterState
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le compteur « n/max » de la bande de fin (iOS `topToolbar`) : monospace semibold 11, muet
 * puis rouge à la limite, apparition et disparition en fondu. La loi vit dans
 * [me.meeshy.sdk.model.composer.ComposerCounterLaw].
 */
@Composable
internal fun ComposerCharacterCounter(state: ComposerCounterState, modifier: Modifier = Modifier) {
    val visible = state as? ComposerCounterState.Visible
    AnimatedVisibility(visible = visible != null, enter = fadeIn(), exit = fadeOut(), modifier = modifier) {
        if (visible != null) {
            Text(
                text = visible.label,
                color = if (visible.atLimit) MeeshyTheme.tokens.error else MeeshyTheme.tokens.textSecondary,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
}
