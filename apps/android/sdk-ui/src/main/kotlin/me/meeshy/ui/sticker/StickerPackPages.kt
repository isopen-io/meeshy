package me.meeshy.ui.sticker

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import me.meeshy.sdk.model.sticker.MeeCharacter
import me.meeshy.sdk.model.sticker.MeeIntent
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.ui.R
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal val StickerArtCellSize = 76.dp
private val StickerArtSize = 64.dp

/** Une grille de cases d'art de 76 dp, adaptée à la largeur, sous l'en-tête des pages de la feuille. */
@Composable
internal fun StickerArtGrid(modifier: Modifier = Modifier, content: LazyGridScope.() -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(StickerArtCellSize),
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        content = content,
    )
}

/**
 * La page d'un pack INTÉGRÉ — Mee, Meo ou Mee & Meo : ses films rangés par ce qu'ils permettent de DIRE, chacun en
 * image fixe (la feuille ne joue pas cinquante films à la fois). Un tap pose le film choisi.
 */
@Composable
public fun MeeStickerPackPage(cast: MeeCharacter, modifier: Modifier = Modifier) {
    val sections = remember(cast) { MeeStickerCatalog.sections(cast) }
    StickerArtGrid(modifier) {
        sections.forEach { section ->
            meeSectionHeader("mee:${section.intent.raw}", section.intent)
            items(section.stickers.size, key = { "mee:${section.stickers[it].id}" }, contentType = { "mee" }) { index ->
                val sticker = section.stickers[index]
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    StickerChoiceCell(StickerSheetChoice.Mee(sticker.id), sticker.title, StickerArtCellSize) {
                        MeeFigure(filmId = sticker.id, side = StickerArtSize, animates = false)
                    }
                }
            }
        }
    }
}

/** L'en-tête d'une intention : son titre, puis la phrase qui dit quand l'employer (comme iOS). */
private fun LazyGridScope.meeSectionHeader(key: String, intent: MeeIntent) {
    item(key = "header:$key", span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
        Column(Modifier.fillMaxWidth()) {
            StickerPageHeader(stringResource(meeIntentTitle(intent)))
            Text(
                text = stringResource(meeIntentHint(intent)),
                color = MeeshyTheme.tokens.textMuted,
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = MeeshySpacing.xs),
            )
        }
    }
}

@Composable
internal fun StickerPageHeader(title: String, modifier: Modifier = Modifier) {
    Text(
        text = title,
        color = MeeshyTheme.tokens.textSecondary,
        fontSize = 13.sp,
        fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
        modifier = modifier.fillMaxWidth().padding(top = MeeshySpacing.md, bottom = MeeshySpacing.xs),
    )
}

private fun meeIntentTitle(intent: MeeIntent): Int = when (intent) {
    MeeIntent.BONJOUR -> R.string.sticker_sheet_intent_bonjour_title
    MeeIntent.AMOUR -> R.string.sticker_sheet_intent_amour_title
    MeeIntent.FETE -> R.string.sticker_sheet_intent_fete_title
    MeeIntent.SOUTIEN -> R.string.sticker_sheet_intent_soutien_title
    MeeIntent.RALE -> R.string.sticker_sheet_intent_rale_title
    MeeIntent.COUP_DE_MOU -> R.string.sticker_sheet_intent_coup_de_mou_title
    MeeIntent.SURPRISE -> R.string.sticker_sheet_intent_surprise_title
    MeeIntent.QUOTIDIEN -> R.string.sticker_sheet_intent_quotidien_title
    MeeIntent.HUMOUR_NOIR -> R.string.sticker_sheet_intent_humour_noir_title
}

private fun meeIntentHint(intent: MeeIntent): Int = when (intent) {
    MeeIntent.BONJOUR -> R.string.sticker_sheet_intent_bonjour_hint
    MeeIntent.AMOUR -> R.string.sticker_sheet_intent_amour_hint
    MeeIntent.FETE -> R.string.sticker_sheet_intent_fete_hint
    MeeIntent.SOUTIEN -> R.string.sticker_sheet_intent_soutien_hint
    MeeIntent.RALE -> R.string.sticker_sheet_intent_rale_hint
    MeeIntent.COUP_DE_MOU -> R.string.sticker_sheet_intent_coup_de_mou_hint
    MeeIntent.SURPRISE -> R.string.sticker_sheet_intent_surprise_hint
    MeeIntent.QUOTIDIEN -> R.string.sticker_sheet_intent_quotidien_hint
    MeeIntent.HUMOUR_NOIR -> R.string.sticker_sheet_intent_humour_noir_hint
}

/**
 * La page d'un pack de TIERS installé : son auteur, puis ses stickers posables (un Instant de tiers demande le moteur
 * de zones de texte : il n'est pas offert). [imageModel] résout l'adresse servie en modèle Coil ; l'emoji du sticker
 * tient la place tant que l'image n'est pas là.
 */
@Composable
public fun StickerPackItemsPage(pack: StickerPackSummary, imageModel: (String) -> Any?, modifier: Modifier = Modifier) {
    val items = remember(pack) { pack.sendableItems }
    val byline = pack.author?.takeIf { it.isNotBlank() }?.let { stringResource(R.string.sticker_pack_by, it) }
    StickerArtGrid(modifier) {
        if (byline != null) {
            item(key = "pack:by", span = { GridItemSpan(maxLineSpan) }, contentType = "header") { StickerPageHeader(byline) }
        }
        items(items.size, key = { "pack:${items[it].key}" }, contentType = { "pack" }) { index ->
            val item = items[index]
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                StickerChoiceCell(StickerSheetChoice.PackItem(pack.slug, item.key), item.title.ifBlank { item.emoji }, StickerArtCellSize) {
                    StickerRemoteArt(imageModel(item.fileUrl), item.emoji)
                }
            }
        }
    }
}

/** Une image servie, l'emoji en attendant (ou à la place, si elle ne vient pas). */
@Composable
internal fun StickerRemoteArt(model: Any?, emoji: String, modifier: Modifier = Modifier) {
    val placeholder: @Composable () -> Unit = { Text(emoji, fontSize = 34.sp) }
    Box(modifier, contentAlignment = Alignment.Center) {
        if (model == null) {
            placeholder()
        } else {
            SubcomposeAsyncImage(
                model = model,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.padding(4.dp),
                loading = { placeholder() },
                error = { placeholder() },
            )
        }
    }
}
