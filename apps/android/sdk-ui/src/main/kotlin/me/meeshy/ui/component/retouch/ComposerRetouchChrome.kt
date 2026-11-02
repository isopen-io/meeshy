package me.meeshy.ui.component.retouch

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.look.ComposerEditTool
import me.meeshy.sdk.model.composer.look.ComposerEditTools
import me.meeshy.sdk.model.composer.look.ComposerRetouchState
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons

/** (x) « Annuler » à gauche, « Terminé » à droite — ils cèdent la place aux éléments d'édition. */
@Composable
internal fun RetouchTopRow(finishing: Boolean, onCancel: () -> Unit, onDone: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val cancel = stringResource(R.string.common_cancel)
        IconButton(onClick = onCancel, modifier = Modifier.size(48.dp).semantics { contentDescription = cancel }) {
            Icon(MeeshyIcons.Close, contentDescription = null, tint = Color.White)
        }
        TextButton(onClick = onDone, enabled = !finishing, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)) {
            Text(
                text = stringResource(if (finishing) R.string.retouch_rendering else R.string.common_done),
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.titleSmall,
            )
        }
    }
}

/** Le rail : Filtres · Effets · Cadres, puis les outils que la prise offre (Recadrer, Couper, Son). */
@Composable
internal fun RetouchRail(state: ComposerRetouchState, enabled: Boolean, onFamily: (me.meeshy.sdk.model.composer.look.ComposerLookFamily) -> Unit, onTool: (ComposerEditTool) -> Unit) {
    val familyOpen = state.openFamily != null
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 8.dp, start = 8.dp, end = 8.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        state.families.forEach { family ->
            RailEntry(ComposerRetouchCopy.familyIcon(family), stringResource(ComposerRetouchCopy.family(family)), family == state.openFamily, enabled) { onFamily(family) }
        }
        state.tools.forEach { tool ->
            val shown = ComposerEditTools.isShown(tool, state.activeTools, familyOpen)
            RailEntry(toolIcon(tool), stringResource(toolName(tool)), shown, enabled) { onTool(tool) }
        }
    }
}

@Composable
private fun RailEntry(icon: ImageVector, name: String, chosen: Boolean, enabled: Boolean, onTap: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .sizeIn(minWidth = 72.dp, minHeight = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (chosen) Color.White.copy(alpha = 0.18f) else Color.Transparent)
            .clickable(enabled = enabled, role = Role.Tab, onClick = onTap)
            .semantics(mergeDescendants = true) {
                selected = chosen
                role = Role.Tab
            }
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
        Text(name, color = Color.White, style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(72.dp), maxLines = 1, textAlign = TextAlign.Center)
    }
}

private fun toolIcon(tool: ComposerEditTool): ImageVector = when (tool) {
    ComposerEditTool.CROP -> MeeshyIcons.Crop
    ComposerEditTool.TEXT -> MeeshyIcons.TextFields
    ComposerEditTool.TRIM -> MeeshyIcons.Cut
    ComposerEditTool.SOUND -> MeeshyIcons.Waveform
}

private fun toolName(tool: ComposerEditTool): Int = when (tool) {
    ComposerEditTool.CROP -> R.string.retouch_tool_crop
    ComposerEditTool.TEXT -> R.string.retouch_tool_text
    ComposerEditTool.TRIM -> R.string.retouch_tool_trim
    ComposerEditTool.SOUND -> R.string.retouch_tool_sound
}
