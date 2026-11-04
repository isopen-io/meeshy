package me.meeshy.ui.component.packs

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.pack.FrameShelfContent
import me.meeshy.sdk.model.pack.FrameTile
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.ui.R
import me.meeshy.ui.component.lottie.PackFileReader
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val THUMB_MAX_PIXELS = 540

/** Le rapport d'une scène de story (9:16) : les cadres se montrent à la forme où ils servent. */
private const val SCENE_ASPECT = 9f / 16f

/**
 * **L'onglet d'un pack de cadres installé** (miroir de `FramePackShelfView`, iOS) : une grille de deux colonnes, chaque
 * cadre avec son nom et le libellé de SON usage (« Rang Ambassadeur IV uniquement »). Chargement = vignettes muettes,
 * jamais un spinner ; contrat d'une version inconnue = « Mets à jour Meeshy » ; panne = message discret.
 * [thumbnails] lit les octets d'une vignette (magasin adressé par contenu, empreinte vérifiée).
 */
@Composable
public fun FramePackShelfView(
    content: FrameShelfContent,
    thumbnails: PackFileReader,
    modifier: Modifier = Modifier,
) {
    when (content) {
        FrameShelfContent.Loading -> LoadingGrid(modifier)
        FrameShelfContent.NeedsUpdate ->
            ShelfNotice(stringResource(R.string.pack_shelf_needsUpdate), MeeshyIcons.Download, modifier)
        FrameShelfContent.Unavailable ->
            ShelfNotice(stringResource(R.string.pack_shelf_unavailable), MeeshyIcons.WifiProblem, modifier)
        is FrameShelfContent.Frames -> FramesGrid(content.tiles, thumbnails, modifier)
    }
}

@Composable
private fun LoadingGrid(modifier: Modifier) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = modifier.clearAndSetSemantics {},
        contentPadding = androidx.compose.foundation.layout.PaddingValues(MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        userScrollEnabled = false,
    ) {
        items(4) {
            androidx.compose.foundation.layout.Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(SCENE_ASPECT)
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(MeeshyTheme.tokens.inputBackground),
            )
        }
    }
}

@Composable
private fun FramesGrid(tiles: List<FrameTile>, thumbnails: PackFileReader, modifier: Modifier) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = modifier,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        items(tiles, key = { it.id }, contentType = { "frame" }) { tile -> FrameTileView(tile, thumbnails) }
    }
}

@Composable
private fun FrameTileView(tile: FrameTile, thumbnails: PackFileReader) {
    Column(
        modifier = Modifier.semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        val image by rememberStoredImage(tile.thumb, thumbnails)
        androidx.compose.foundation.layout.Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(SCENE_ASPECT)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.inputBackground),
        ) {
            image?.let { Image(it, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth()) }
        }
        Text(
            text = tile.name,
            color = MeeshyTheme.tokens.textPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus), verticalAlignment = Alignment.Top) {
            Icon(
                MeeshyIcons.Verified,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(14.dp).padding(top = 1.dp),
            )
            Text(
                text = tile.usageText,
                color = MeeshyTheme.tokens.textSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ShelfNotice(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(MeeshySpacing.lg)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.inputBackground)
            .padding(MeeshySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(20.dp))
        Text(text = text, color = MeeshyTheme.tokens.textSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

/** Décode la vignette à la taille où elle se montre (jamais l'image entière en mémoire) ; `null` tant qu'elle n'est pas lue. */
@Composable
private fun rememberStoredImage(ref: PackAssetRef, reader: PackFileReader): androidx.compose.runtime.State<ImageBitmap?> =
    produceState<ImageBitmap?>(initialValue = null, ref.src, reader) {
        value = reader.read(ref)?.let { bytes -> withContext(Dispatchers.Default) { decodeScaled(bytes) } }
    }

private fun decodeScaled(bytes: ByteArray): ImageBitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val longest = maxOf(bounds.outWidth, bounds.outHeight)
    var sample = 1
    while (longest / (sample * 2) >= THUMB_MAX_PIXELS) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap: Bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
    return bitmap.asImageBitmap()
}
