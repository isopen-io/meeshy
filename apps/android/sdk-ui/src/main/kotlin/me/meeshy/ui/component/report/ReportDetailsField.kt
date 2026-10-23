package me.meeshy.ui.component.report

import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Champ de détails multi-lignes plafonné à [limit] caractères, teinté « info », avec son
 * [CharacterCountLabel] (avertissement dès [warningThreshold]). Le plafond est appliqué ici, à la
 * saisie et au collage : l'hôte ne reçoit jamais plus que [limit] caractères.
 */
@Composable
public fun ReportDetailsField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    accessibilityLabel: String,
    modifier: Modifier = Modifier,
    limit: Int = 500,
    warningThreshold: Int? = 450,
) {
    val tokens = MeeshyTheme.tokens
    val dark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        BasicTextField(
            value = value,
            onValueChange = { onValueChange(it.take(limit)) },
            textStyle = MaterialTheme.typography.bodyMedium.copy(color = tokens.textPrimary),
            cursorBrush = SolidColor(tokens.info),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 100.dp, max = 150.dp)
                .background(MeeshyGradients.surfaceGradient(tokens.info, dark), shape)
                .border(1.dp, MeeshyGradients.tintedBorder(tokens.info, dark), shape)
                .padding(MeeshySpacing.smPlus)
                .semantics { contentDescription = accessibilityLabel },
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) {
                        Text(placeholder, style = MaterialTheme.typography.bodyMedium, color = tokens.textMuted)
                    }
                    inner()
                }
            },
        )
        CharacterCountLabel(count = value.length, limit = limit, warningThreshold = warningThreshold)
    }
}
