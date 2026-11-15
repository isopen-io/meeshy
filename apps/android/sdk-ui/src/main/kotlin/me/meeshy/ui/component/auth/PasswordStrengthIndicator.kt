package me.meeshy.ui.component.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.PasswordStrengthLevel
import me.meeshy.sdk.model.PasswordStrengthMeter
import me.meeshy.sdk.model.PasswordStrengthTone
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val PASSWORD_STRENGTH_SEGMENT_TAG_PREFIX: String = "passwordStrength.segment."

private val SEGMENT_HEIGHT = 4.dp
private val SEGMENT_RADIUS = 2.dp

/** Le libellé d'un niveau — les six mots du catalogue iOS, « Trop faible » à « Excellent ». */
internal fun passwordStrengthLabelRes(level: PasswordStrengthLevel): Int = when (level) {
    PasswordStrengthLevel.TOO_WEAK -> R.string.auth_password_strength_veryWeak
    PasswordStrengthLevel.WEAK -> R.string.auth_password_strength_weak
    PasswordStrengthLevel.MEDIUM -> R.string.auth_password_strength_medium
    PasswordStrengthLevel.GOOD -> R.string.auth_password_strength_good
    PasswordStrengthLevel.STRONG -> R.string.auth_password_strength_strong
    PasswordStrengthLevel.EXCELLENT -> R.string.auth_password_strength_excellent
}

/**
 * La jauge de force d'un mot de passe (iOS `PasswordStrengthIndicator`) : cinq segments qui se
 * remplissent à mesure que le mot de passe se renforce, du rouge au vert, et le mot du niveau
 * en dessous — de « Trop faible » à « Excellent ».
 *
 * Le niveau vient de [me.meeshy.sdk.model.PasswordStrength], l'unique évaluateur du dépôt ;
 * [PasswordStrengthMeter] le projette en segments et en teinte sans écran. La couleur ne porte
 * jamais seule l'état : le mot le dit aussi, et il est ANNONCÉ — zone « live » polie — à
 * chaque changement de niveau, sans que l'utilisateur ait à chercher la jauge. Les segments,
 * eux, sont décoratifs.
 *
 * Un champ vide ne proclame rien : les segments restent vides et le mot n'apparaît pas.
 */
@Composable
public fun PasswordStrengthIndicator(
    password: String,
    modifier: Modifier = Modifier,
) {
    val meter = remember(password) { PasswordStrengthMeter.of(password) }
    val tokens = MeeshyTheme.tokens
    val toneColor = toneColorOf(meter.tone)

    Column(
        modifier = modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().clearAndSetSemantics { },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            repeat(meter.totalSegments) { index ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(SEGMENT_HEIGHT)
                        .clip(RoundedCornerShape(SEGMENT_RADIUS))
                        .background(if (index < meter.filledSegments) toneColor else tokens.inputBorder)
                        .testTag(PASSWORD_STRENGTH_SEGMENT_TAG_PREFIX + index),
                )
            }
        }
        if (meter.showsLabel) {
            Text(
                text = stringResource(passwordStrengthLabelRes(meter.level)),
                style = MaterialTheme.typography.labelSmall,
                color = toneColor,
            )
        }
    }
}

/**
 * De la teinte au jeton : danger et succès sont les couleurs sémantiques statiques du thème ;
 * l'orange est leur milieu avec l'avertissement, jamais un littéral à part.
 */
@Composable
private fun toneColorOf(tone: PasswordStrengthTone): Color {
    val tokens = MeeshyTheme.tokens
    return when (tone) {
        PasswordStrengthTone.DANGER -> tokens.error
        PasswordStrengthTone.WARNING -> lerp(tokens.error, tokens.warning, 0.5f)
        PasswordStrengthTone.CAUTION -> tokens.warning
        PasswordStrengthTone.SUCCESS -> tokens.success
    }
}
