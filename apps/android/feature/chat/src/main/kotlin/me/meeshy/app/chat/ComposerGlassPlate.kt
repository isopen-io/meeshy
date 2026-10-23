package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerPlateStyle
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La plaque de verre UNIQUE de la barre de composition : bandeaux, plateau, rails, barre d'outils
 * et rangée de saisie y vivent ensemble (iOS `ComposerBarSlot`). Le flou (API 31+) ou le repli
 * opaque est celui de [MeeshyGlassSurface] ; la forme suit [ComposerPlateStyle]. L'hôte peut poser
 * un [foldSlot] (chevron de repli) dans l'angle haut droit.
 */
@Composable
internal fun ComposerGlassPlate(
    modifier: Modifier = Modifier,
    foldSlot: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(ComposerPlateStyle.CORNER_RADIUS_DP.dp)
    MeeshyGlassSurface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.sm),
        shape = shape,
    ) {
        Column(Modifier.fillMaxWidth()) { content() }
        if (foldSlot != null) ComposerFoldSlot(Modifier.align(Alignment.TopEnd), foldSlot)
    }
}

/** L'emplacement du chevron de repli fourni par l'hôte, posé dans l'angle haut droit de la plaque. */
@Composable
internal fun ComposerFoldSlot(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.padding(MeeshySpacing.xs)) { content() }
}
