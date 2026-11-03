package me.meeshy.ui.sticker

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.StickerBoxLaw
import me.meeshy.sdk.model.StickerRenderSource
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeSlot
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.ui.component.bubble.largeEmojiTextStyle
import me.meeshy.ui.component.game.MeeFigure

/**
 * Le dessin d'un sticker de conversation (#14345) — l'atome que la bulle et les rangées de lecture (Script, Focal,
 * Rivière, #14534) montent, miroir d'iOS `MessageStickerArtwork` : par la priorité de [StickerRenderSource], le film de
 * Mee (animé), l'Instant et ses mots, le gabarit redessiné, l'emoji en grand, sinon le PNG joint. Les boîtes sont celles
 * de [StickerBoxLaw] : la cellule ne saute pas au chargement. Un film garde autour de lui sa marge de débordement
 * ([StickerBoxLaw.filmBleed]) et y dessine librement : rien ne le rogne, rien ne le rétrécit.
 */
@Composable
public fun MessageStickerArtwork(
    spec: BubbleStickerSpec,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
    side: Dp = StickerBoxLaw.SIDE_DP.dp,
) {
    val label = messageStickerLabel(spec)
    val framed = modifier.semantics { contentDescription = label }
    val bleed = StickerBoxLaw.filmBleed(side.value).dp
    when (val source = spec.sourceWith(StickerTemplateArtwork::knows)) {
        is StickerRenderSource.Mee -> Box(framed.padding(bleed)) {
            MeeFigure(filmId = source.id, side = side, animates = animates, bleeds = true)
        }
        is StickerRenderSource.MeeInstant -> MeeInstantCatalog.byId(source.id)?.let { instant ->
            Box(framed.padding(bleed)) {
                MeeInstantArtwork(instant, MeeSlot.slots(spec.sticker.slots), side, animates = animates, bleeds = true)
            }
        }
        is StickerRenderSource.Template -> Box(
            framed.sizeIn(maxWidth = side * StickerBoxLaw.TEMPLATE_RATIO, maxHeight = side),
            contentAlignment = Alignment.Center,
        ) {
            StickerTemplateArtwork(source.id, spec.sticker.slots, body = side * TEMPLATE_BODY_FRACTION)
        }
        is StickerRenderSource.Picture -> AsyncImage(
            model = source.picture.fileUrl,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = framed.size(side),
        )
        is StickerRenderSource.Emoji -> Box(framed, contentAlignment = Alignment.Center) {
            Text(source.emoji, style = largeEmojiTextStyle(with(LocalDensity.current) { StickerBoxLaw.EMOJI_GLYPH_DP.dp.toSp() }))
        }
    }
}

/** Ce que TalkBack dit d'un sticker : le titre du film ou de l'Instant, le nom du gabarit et ses mots, sinon l'emoji. */
@Composable
private fun messageStickerLabel(spec: BubbleStickerSpec): String {
    val sticker = spec.sticker
    MeeStickerCatalog.sticker(sticker.templateId)?.let { return it.title }
    MeeInstantCatalog.instant(sticker.templateId)?.let { instant ->
        val words = sticker.slots.values.filter { it.isNotBlank() }
        return if (words.isEmpty()) instant.title else "${instant.title} — ${words.joinToString(", ")}"
    }
    val templateId = sticker.templateId
    if (!templateId.isNullOrEmpty()) {
        StickerTemplateCatalog.template(templateId)?.let { return stickerTemplateLabel(it, sticker.slots) }
    }
    return sticker.emoji?.takeIf { it.isNotEmpty() } ?: StickerRenderSource.fallbackEmoji(sticker)
}

private const val TEMPLATE_BODY_FRACTION = 0.16f
