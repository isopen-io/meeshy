package me.meeshy.app.chat

import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.ComposerTray
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.TrayEntryKind
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val TRAY_HEIGHT = 100.dp
private const val TRAY_SPRING_DAMPING = 0.8f
private const val TRAY_SPRING_STIFFNESS = 440f

/**
 * **LE PLATEAU DES PIÈCES CHOISIES** (`ComposerAttachmentZone` iOS) : une rangée horizontale de 100 dp au fond
 * dégradé teinté de l'[accent] de la conversation et bordée de lui ; d'abord les pièces en préparation, puis les
 * prêtes, puis le lieu en attente. Sans rien, le plateau est ABSENT. Le même plateau sert les messages et les
 * commentaires. Toucher une pièce l'édite ([onEdit], remplacement par id) ou l'aperçoit ; l'appui long ouvre
 * l'aperçu plein écran avec « Supprimer ». Retirer est léger au toucher.
 */
@Composable
internal fun ComposerAttachmentTrayView(
    tray: ComposerTray,
    accent: Color,
    onRemove: (String) -> Unit,
    onRemovePlace: () -> Unit,
    modifier: Modifier = Modifier,
    onEdit: ((PendingAttachment) -> Unit)? = null,
) {
    if (tray.isEmpty) return
    val haptics = rememberMeeshyHaptics()
    var previewing by remember { mutableStateOf<String?>(null) }
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    val remove: (String) -> Unit = { id ->
        haptics.light()
        if (previewing == id) previewing = null
        if (id == ComposerTrayKeys.PLACE) onRemovePlace() else onRemove(id)
    }
    val itemSpring = spring<IntOffset>(dampingRatio = TRAY_SPRING_DAMPING, stiffness = TRAY_SPRING_STIFFNESS)
    LazyRow(
        modifier = modifier
            .fillMaxWidth()
            .height(TRAY_HEIGHT)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(accent.copy(alpha = 0.14f), accent.copy(alpha = 0.04f))))
            .border(BorderStroke(1.dp, accent.copy(alpha = 0.3f)), shape),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        items(tray.entries, key = { it.key }, contentType = { it.kind }) { entry ->
            val item = entry.item
            ComposerAttachmentTile(
                entry = entry,
                accent = accent,
                onRemove = { remove(entry.key) },
                onEdit = if (item != null) onEdit?.let { edit -> { edit(item) } } else null,
                onPreview = { if (entry.kind == TrayEntryKind.READY) previewing = entry.key },
                modifier = Modifier.animateItem(placementSpec = itemSpring),
            )
        }
    }
    if (tray.capReached) {
        Text(
            text = stringResource(R.string.chat_tray_cap_reached),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md),
        )
    }
    val shown = tray.entries.firstOrNull { it.key == previewing }?.item
    if (shown != null) {
        ComposerAttachmentPreview(item = shown, onDismiss = { previewing = null }, onDelete = { remove(shown.id) })
    }
}

internal object ComposerTrayKeys {
    const val PLACE: String = me.meeshy.sdk.model.composer.ComposerTrayPresenter.PLACE_KEY
}
