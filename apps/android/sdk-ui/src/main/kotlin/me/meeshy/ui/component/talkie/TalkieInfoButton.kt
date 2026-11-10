package me.meeshy.ui.component.talkie

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.icons.MeeshyIcons

public const val TALKIE_INFO_TAG: String = "talkie.info"
public const val TALKIE_INFO_BUBBLE_TAG: String = "talkie.info.bubble"

/**
 * Le (i) à côté du bouton talkie de la fiche (#17141, #17150, iso `TalkieInfoButton.swift`) : il dit à qui le talkie est
 * destiné et quand s'en servir — il réveille l'autre même quand Meeshy est en arrière-plan. Cible de 48 dp ; TalkBack lit
 * son libellé ET le texte, sans avoir à l'ouvrir. Il ne vit QUE sur la fiche, jamais dans l'en-tête (#17339).
 */
@Composable
public fun TalkieInfoButton(tint: Color = MeeshyPalette.Indigo500, modifier: Modifier = Modifier) {
    var showing by remember { mutableStateOf(false) }
    val label = stringResource(R.string.talkie_info_a11y)
    val text = stringResource(R.string.talkie_info_text)
    Box(modifier) {
        IconButton(
            onClick = { showing = true },
            modifier = Modifier
                .size(48.dp)
                .semantics {
                    contentDescription = label
                    stateDescription = text
                }
                .testTag(TALKIE_INFO_TAG),
        ) {
            Icon(MeeshyIcons.Info, contentDescription = null, tint = tint)
        }
        if (showing) {
            Popup(
                alignment = Alignment.TopEnd,
                offset = IntOffset(0, 140),
                onDismissRequest = { showing = false },
                properties = PopupProperties(focusable = true),
            ) {
                TalkieInfoBubble(text)
            }
        }
    }
}

@Composable
private fun TalkieInfoBubble(text: String) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        tonalElevation = 6.dp,
        shadowElevation = 8.dp,
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier.widthIn(max = 320.dp).testTag(TALKIE_INFO_BUBBLE_TAG),
    ) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = MeeshyPalette.Indigo500)
            Text(text = text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
        }
    }
}
