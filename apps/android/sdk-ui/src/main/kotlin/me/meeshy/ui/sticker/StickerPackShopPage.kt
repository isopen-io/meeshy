package me.meeshy.ui.sticker

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerPackState
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.ui.R
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La Boutique : chaque pack, sa couverture, son auteur, ce qu'il contient, et un bouton qui l'installe ou le retire.
 * L'état affiché est l'état OPTIMISTE ([StickerPackState]) : le geste bascule tout de suite, un refus du serveur le
 * remet et dit pourquoi. Un pack intégré ne se retire pas : il n'a pas de bouton « Retirer ». [packs] `null` : la
 * Boutique n'a pas encore répondu une fois.
 */
@Composable
public fun StickerPackShopPage(
    packs: List<StickerPackSummary>?,
    state: StickerPackState,
    onToggle: (String) -> Unit,
    imageModel: (String) -> Any?,
    modifier: Modifier = Modifier,
) {
    if (packs == null) {
        ShopSkeleton(modifier)
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (state.failedSlug != null) {
            item(key = "shop:failed", contentType = "failed") {
                Text(
                    text = stringResource(R.string.sticker_shop_failed),
                    color = MeeshyPalette.Error,
                    fontSize = 13.sp,
                    modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
        items(packs.size, key = { "shop:${packs[it].slug}" }, contentType = { "pack" }) { index ->
            ShopRow(packs[index], state, onToggle, imageModel)
        }
    }
}

/** La Boutique qui n'a jamais répondu : trois rangées muettes à la place des packs (cache vide), jamais un spinner. */
@Composable
private fun ShopSkeleton(modifier: Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm).clearAndSetSemantics {},
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        repeat(3) {
            Box(
                Modifier.fillMaxWidth().heightIn(min = 72.dp).clip(RoundedCornerShape(14.dp)).background(MeeshyTheme.tokens.inputBackground),
            )
        }
    }
}

@Composable
private fun ShopRow(pack: StickerPackSummary, state: StickerPackState, onToggle: (String) -> Unit, imageModel: (String) -> Any?) {
    val installed = state.isInstalled(pack.slug)
    val cover = pack.coverUrl ?: pack.items.firstOrNull()?.fileUrl
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MeeshyTheme.tokens.inputBackground)
            .padding(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Box(Modifier.size(56.dp), contentAlignment = Alignment.Center) {
            val mee = MeeStickerCatalog.cast(pack.slug)?.let { MeeStickerCatalog.stickers(it).firstOrNull() }
            if (mee != null) {
                MeeFigure(filmId = mee.id, side = 56.dp, animates = false)
            } else {
                StickerRemoteArt(cover?.let(imageModel), pack.items.firstOrNull()?.emoji ?: "🎁", Modifier.clearAndSetSemantics {})
            }
        }
        Column(Modifier.weight(1f)) {
            Text(pack.title, color = MeeshyTheme.tokens.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            pack.author?.takeIf { it.isNotBlank() }?.let {
                Text(stringResource(R.string.sticker_pack_by, it), color = MeeshyTheme.tokens.textSecondary, fontSize = 12.sp)
            }
            pack.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = MeeshyTheme.tokens.textMuted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        ShopButton(pack.title, installed, removable = pack.isRemovable, pending = state.isPending(pack.slug)) { onToggle(pack.slug) }
    }
}

/** Le bouton dit ce qu'il fait ET à quel pack (« Installer Fruits »), comme VoiceOver le dit sur iOS. */
@Composable
private fun ShopButton(packName: String, installed: Boolean, removable: Boolean, pending: Boolean, onClick: () -> Unit) {
    when {
        !installed -> {
            val label = stringResource(R.string.sticker_shop_install)
            Button(
                onClick = onClick,
                enabled = !pending,
                modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "$label $packName" },
                colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
            ) { Text(label) }
        }
        removable -> {
            val label = stringResource(R.string.sticker_shop_remove)
            OutlinedButton(
                onClick = onClick,
                enabled = !pending,
                modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "$label $packName" },
            ) { Text(label, color = MeeshyTheme.tokens.textPrimary) }
        }
        else -> Unit
    }
}
