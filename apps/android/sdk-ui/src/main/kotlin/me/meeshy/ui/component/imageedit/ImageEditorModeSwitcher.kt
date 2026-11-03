package me.meeshy.ui.component.imageedit

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.imageedit.ImageEditorMode
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.meeshyText
import androidx.compose.ui.text.font.FontWeight

/**
 * La capsule Simple / Pro de l'éditeur d'image : même capsule indigo, segment actif en dégradé
 * de marque et même disposition glyphe + libellé que le sélecteur de la timeline des stories.
 * Miroir d'iOS `ImageEditorModeSwitcher`.
 */
@Composable
public fun ImageEditorModeSwitcher(
    mode: ImageEditorMode,
    isDark: Boolean,
    onSelect: (ImageEditorMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    val fill = if (isDark) MeeshyPalette.Indigo900.copy(alpha = 0.55f) else MeeshyPalette.Indigo100.copy(alpha = 0.85f)
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(fill)
            .border(BorderStroke(0.5.dp, MeeshyPalette.Indigo400.copy(alpha = 0.25f)), CircleShape)
            .padding(MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Segment(ImageEditorMode.SIMPLE, stringResource(R.string.image_editor_mode_simple), "Simple", mode, isDark, onSelect)
        Segment(ImageEditorMode.PRO, stringResource(R.string.image_editor_mode_pro), "Pro", mode, isDark, onSelect)
    }
}

@Composable
private fun Segment(
    target: ImageEditorMode,
    description: String,
    label: String,
    current: ImageEditorMode,
    isDark: Boolean,
    onSelect: (ImageEditorMode) -> Unit,
) {
    val active = current == target
    val ink by animateColorAsState(
        targetValue = when {
            active -> Color.White
            isDark -> MeeshyPalette.Indigo100
            else -> MeeshyPalette.Indigo700
        },
        label = "image-editor-mode-ink",
    )
    val background = if (active) Modifier.background(MeeshyGradients.brand) else Modifier
    Row(
        modifier = Modifier
            .defaultMinSize(minWidth = 72.dp, minHeight = 48.dp)
            .clip(CircleShape)
            .then(background)
            .clickable(role = Role.Tab) { onSelect(target) }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                selected = active
                role = Role.Tab
            },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (target == ImageEditorMode.SIMPLE) MeeshyIcons.Sparkles else MeeshyIcons.Tune,
            contentDescription = null,
            tint = ink,
            modifier = Modifier.size(14.dp),
        )
        Text(label, color = ink, style = meeshyText(MeeshyFontSize.small, FontWeight.SemiBold))
    }
}
