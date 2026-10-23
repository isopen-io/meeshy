package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * The composer's stage (#12298): the [scene] takes every row the [footer] (caption, drawing
 * or text settings, media row) leaves, and the open tool [panel] slides OVER the bottom of the
 * stage instead of pushing the scene into a thumbnail — iOS `ComposerRailGeometry.sceneWidth`
 * depends on the usable width only, never on the band. Nothing is laid on the scene itself.
 */
@Composable
internal fun ComposerStage(
    scene: @Composable (Modifier) -> Unit,
    footer: @Composable ColumnScope.() -> Unit,
    panel: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            scene(Modifier.fillMaxWidth().weight(1f))
            footer()
        }
        Box(modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
            panel()
        }
    }
}
