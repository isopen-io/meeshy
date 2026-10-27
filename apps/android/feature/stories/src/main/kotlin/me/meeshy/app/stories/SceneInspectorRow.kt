package me.meeshy.app.stories

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerObjectChips
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * L'inspecteur de la vue `1c` : une rangée de jetons au-dessus du socle, qui change de contenu
 * selon la famille de l'objet sélectionné et jamais de place. Chaque jeton porte sa VALEUR ; il
 * n'est un bouton que s'il mène quelque part (loi 4) — ici, la fenêtre d'apparition ouvre la frise.
 */
@Composable
internal fun SceneInspectorRow(
    inspector: SceneInspector,
    onOpenTiming: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        inspector.chips.forEach { chip ->
            val opensTiming = chip.destination == ComposerObjectEditorSection.Timing
            SceneChip(
                label = chip.label(),
                onClick = if (opensTiming) {
                    {
                        haptics.light()
                        onOpenTiming()
                    }
                } else {
                    null
                },
            )
        }
    }
}

@Composable
private fun SceneChip(label: String, onClick: (() -> Unit)?) {
    Surface(
        shape = CircleShape,
        color = androidx.compose.ui.graphics.Color.Transparent,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        modifier = Modifier.defaultMinSize(minHeight = 44.dp),
    ) {
        Box(
            modifier = (if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
                .defaultMinSize(minHeight = 44.dp)
                .padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

/** Le texte d'un jeton : « TAILLE 150% », « STYLE · GRAS », « 0:02 → 0:08 » — la valeur, pas l'icône. */
@Composable
internal fun ComposerObjectChips.Chip.label(): String = when (id) {
    "size" -> stringResource(R.string.composer_chip_size, argument)
    "rotation" -> stringResource(R.string.composer_chip_rotation, argument)
    "style" -> stringResource(R.string.composer_chip_style, stringResource(styleRes(argument)))
    "align" -> stringResource(R.string.composer_chip_align, stringResource(alignRes(argument)))
    else -> argument
}

private fun styleRes(wire: String): Int = when (wire.lowercase()) {
    "neon" -> R.string.composer_chip_style_neon
    "typewriter" -> R.string.composer_chip_style_typewriter
    "handwriting" -> R.string.composer_chip_style_handwriting
    "classic" -> R.string.composer_chip_style_classic
    else -> R.string.composer_chip_style_bold
}

private fun alignRes(wire: String): Int = when (wire.lowercase()) {
    "left" -> R.string.composer_chip_align_left
    "right" -> R.string.composer_chip_align_right
    else -> R.string.composer_chip_align_center
}
