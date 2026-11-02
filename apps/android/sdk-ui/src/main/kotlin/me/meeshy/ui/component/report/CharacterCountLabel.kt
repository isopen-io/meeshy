package me.meeshy.ui.component.report

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.sdk.model.CharacterCountPolicy
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import java.text.NumberFormat

/**
 * Compteur de caractères discret sous un champ — miroir de `CharacterCountLabel` (iOS) : nombres
 * formatés selon la locale, passe en avertissement dès [warningThreshold] (80 % de [limit] par
 * défaut), lu « N sur M caractères » par le lecteur d'écran. L'état d'alerte n'est pas surchargeable.
 */
@Composable
public fun CharacterCountLabel(
    count: Int,
    limit: Int,
    modifier: Modifier = Modifier,
    warningThreshold: Int? = null,
    mutedColor: Color? = null,
) {
    val locale = LocalConfiguration.current.locales[0]
    val format = remember(locale) { NumberFormat.getIntegerInstance(locale) }
    val template = LocalContext.current.resources.getString(R.string.components_characterCount_a11y)
    val tokens = MeeshyTheme.tokens
    val near = CharacterCountPolicy.isNearLimit(count, limit, warningThreshold)
    val spoken = CharacterCountPolicy.accessibilityText(count, limit, template) { format.format(it) }
    Text(
        text = CharacterCountPolicy.visibleText(count, limit) { format.format(it) },
        modifier = modifier.fillMaxWidth().semantics { contentDescription = spoken },
        style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
        color = if (near) tokens.error else mutedColor ?: tokens.textMuted,
        textAlign = TextAlign.End,
    )
}
