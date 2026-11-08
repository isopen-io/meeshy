package me.meeshy.ui.component.imageedit

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.imageedit.ImageEditHistoryStep
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

/**
 * Le volet d'historique : la liste des pas (le plus récent en haut) avec leur libellé, et le
 * saut direct à n'importe lequel. Un voile ferme le volet au toucher. Miroir d'iOS
 * `ImageEditorHistoryOverlay`.
 */
@Composable
public fun ImageEditorHistoryOverlay(
    steps: List<ImageEditHistoryStep>,
    currentStepId: Long,
    accent: Color,
    onJump: (Long) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    Box(modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.4f)).clickable(onClick = onClose))
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(tokens.backgroundSecondary)
                .navigationBarsPadding(),
        ) {
            Row(Modifier.fillMaxWidth().padding(start = MeeshySpacing.lg, top = MeeshySpacing.sm, end = MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.image_editor_history),
                    color = tokens.textPrimary,
                    style = meeshyText(MeeshyFontSize.body, FontWeight.Bold),
                    modifier = Modifier.weight(1f),
                )
                Box(Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onClose), contentAlignment = Alignment.Center) {
                    Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.image_editor_close), tint = tokens.textSecondary, modifier = Modifier.size(18.dp))
                }
            }
            LazyColumn(
                Modifier.heightIn(max = 320.dp),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            ) {
                items(steps.indices.reversed().toList(), key = { steps[it].id }, contentType = { "step" }) { index ->
                    HistoryRow(index, steps[index], steps[index].id == currentStepId, accent, onJump)
                }
            }
        }
    }
}

@Composable
private fun HistoryRow(index: Int, step: ImageEditHistoryStep, isCurrent: Boolean, accent: Color, onJump: (Long) -> Unit) {
    val tokens = MeeshyTheme.tokens
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.smPlus))
            .background(if (isCurrent) accent.copy(alpha = if (MeeshyTheme.isDark) 0.12f else 0.07f) else Color.Transparent)
            .clickable(role = Role.Button) { onJump(step.id) }
            .padding(horizontal = MeeshySpacing.md)
            .semantics(mergeDescendants = true) { contentDescription = step.label; selected = isCurrent },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            Modifier.size(32.dp).clip(CircleShape).background(if (isCurrent) MeeshyGradients.brand else androidx.compose.ui.graphics.SolidColor(tokens.inputBackground)),
            contentAlignment = Alignment.Center,
        ) {
            Text("$index", color = if (isCurrent) Color.White else tokens.textSecondary, style = meeshyText(MeeshyFontSize.small, FontWeight.Bold))
        }
        Text(
            step.label,
            color = if (isCurrent) tokens.textPrimary else tokens.textSecondary,
            style = meeshyText(MeeshyFontSize.subhead, if (isCurrent) FontWeight.SemiBold else FontWeight.Normal),
            modifier = Modifier.weight(1f),
        )
        if (isCurrent) Icon(MeeshyIcons.Check, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
    }
}
