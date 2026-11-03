package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.ReactionStripLayout
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le smiley d'ajout du dernier message reçu (iOS `addButton`) : disque visible de 24 dp, cible de
 * 40 dp. Toucher = réaction rapide (haptique léger), appui long = sélecteur complet (haptique
 * moyen). Quand [expandsHit] est faux, la cible reste à la taille du disque (rangée plate).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ReactionAddButton(
    accent: Color,
    onQuickReact: () -> Unit,
    onOpenPicker: (() -> Unit)?,
    expandsHit: Boolean,
) {
    val isDark = MeeshyTheme.isDark
    val haptics = rememberMeeshyHaptics()
    val label = stringResource(R.string.bubble_add_reaction)
    val hint = stringResource(R.string.bubble_reactions_add_hint)
    val hitDp = if (expandsHit) ReactionStripLayout.HIT_DIAMETER_DP else ReactionStripLayout.CHIP_DIAMETER_DP
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .requiredSize(hitDp.dp)
            .clip(CircleShape)
            .combinedClickable(
                onClickLabel = label,
                onLongClickLabel = onOpenPicker?.let { stringResource(R.string.bubble_reactions_pick_emoji) },
                onClick = {
                    haptics.light()
                    onQuickReact()
                },
                onLongClick = onOpenPicker?.let { open ->
                    {
                        haptics.medium()
                        open()
                    }
                },
            )
            .semantics {
                role = Role.Button
                contentDescription = label
                stateDescription = hint
            },
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(ReactionStripLayout.CHIP_DIAMETER_DP.dp)
                .shadow(3.dp, CircleShape, ambientColor = accent.copy(alpha = 0.18f), spotColor = accent.copy(alpha = 0.18f))
                .clip(CircleShape)
                .background(accent.copy(alpha = if (isDark) 0.18f else 0.14f))
                .border(0.5.dp, accent.copy(alpha = if (isDark) 0.4f else 0.28f), CircleShape),
        ) {
            Icon(
                imageVector = MeeshyIcons.Emoji,
                contentDescription = null,
                tint = accent.copy(alpha = if (isDark) 0.9f else 0.8f),
                modifier = Modifier.size(14.dp),
            )
        }
    }
}
