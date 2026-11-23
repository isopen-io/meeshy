package me.meeshy.ui.component.contentcard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentCardMedia
import me.meeshy.sdk.model.contentcard.ContentCardPage
import me.meeshy.sdk.model.contentcard.ContentCardVisual
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/** Le lecteur sonore de l'application (le moteur unique des vocaux), pour le son seul d'un contenu partagé. */
public typealias ContentCardSoundPlayer = @Composable (sound: ContentCardVisual.Sound, modifier: Modifier) -> Unit

/** Le player de scène de l'application, ARRÊTÉ : la scène de base d'un contenu, fond et objets posés. */
public typealias ContentCardScenePainter = @Composable (item: StoryItem, accentHex: String, modifier: Modifier) -> Unit

/** Fournis par l'application (le moteur audio et le player de scène vivent hors de ce module) ; absents, la carte reste lisible. */
public val LocalContentCardSoundPlayer: ProvidableCompositionLocal<ContentCardSoundPlayer?> = staticCompositionLocalOf { null }
public val LocalContentCardScenePainter: ProvidableCompositionLocal<ContentCardScenePainter?> = staticCompositionLocalOf { null }

private const val PORTRAIT_ASPECT = 9f / 16f
private const val PORTRAIT_MAX_HEIGHT_DP = 260
private const val FLOOR_ALPHA = 0.18f
private const val DOT_ALPHA_IDLE = 0.45f
private val DotSize = 6.dp

/**
 * **Le bloc visuel de la carte** (#20233, iOS `ContentLinkCardVisual`) — ce que [ContentCard.visual] a élu, rendu par les
 * briques existantes : la vignette de la carte, le player de scène arrêté ([LocalContentCardScenePainter]). Le son seul
 * vit hors de la zone qui ouvre ([ContentLinkCardSound]) : son bouton joue, il n'ouvre pas.
 */
@Composable
internal fun ContentLinkCardPicture(card: ContentCard, pager: PagerState) {
    when (val visual = card.visual) {
        is ContentCardVisual.Media -> MediaBlock(visual.media, card.type)
        is ContentCardVisual.Scene -> SceneBlock(card, visual.index, showsKindPill = true)
        is ContentCardVisual.Slideshow -> SlideshowBlock(card, visual.pages, pager)
        ContentCardVisual.None, is ContentCardVisual.Sound -> Unit
    }
}

/**
 * Les pages qu'on fait glisser une à une — médias d'un post ou d'un réel, scènes d'un document. La hauteur se lit sur la
 * PREMIÈRE page et ne change plus : la bulle ne saute pas pendant le glissement. Le glissement appartient au pager ; seul
 * un toucher ouvre le contenu (celui de la carte).
 */
@Composable
private fun SlideshowBlock(card: ContentCard, pages: List<ContentCardPage>, pager: PagerState) {
    val (aspect, maxHeight) = frameOf(pages.firstOrNull())
    Box(Modifier.fillMaxWidth().mediaFrame(aspect, maxHeight.dp)) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { index ->
            when (val page = pages[index]) {
                is ContentCardPage.Media -> Box(Modifier.fillMaxSize()) { MediaPicture(page.media) }
                is ContentCardPage.Scene -> ScenePicture(card, page.index, Modifier.fillMaxSize())
            }
        }
        KindPill(card.type, overMedia = true, modifier = Modifier.align(Alignment.TopStart).padding(MeeshySpacing.sm))
        ScrimPill("${pager.currentPage + 1}/${pages.size}", Modifier.align(Alignment.TopEnd).padding(MeeshySpacing.sm))
        PageDots(pages.size, pager.currentPage, Modifier.align(Alignment.BottomCenter).padding(bottom = MeeshySpacing.sm))
    }
}

private fun frameOf(page: ContentCardPage?): Pair<Float, Int> = when (page) {
    is ContentCardPage.Media -> page.media.aspectRatio to page.media.maxHeightDp
    is ContentCardPage.Scene, null -> PORTRAIT_ASPECT to PORTRAIT_MAX_HEIGHT_DP
}

@Composable
private fun PageDots(count: Int, current: Int, modifier: Modifier) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs),
    ) {
        repeat(count) { index ->
            Box(
                Modifier.size(DotSize).clip(CircleShape)
                    .background(Color.White.copy(alpha = if (index == current) 1f else DOT_ALPHA_IDLE)),
            )
        }
    }
}

/** La scène telle que l'auteur l'a composée, arrêtée ; la pastille du genre posée dessus. */
@Composable
private fun SceneBlock(card: ContentCard, index: Int, showsKindPill: Boolean) {
    Box(Modifier.fillMaxWidth().mediaFrame(PORTRAIT_ASPECT, PORTRAIT_MAX_HEIGHT_DP.dp)) {
        ScenePicture(card, index, Modifier.fillMaxSize())
        if (showsKindPill) KindPill(card.type, overMedia = true, modifier = Modifier.align(Alignment.TopStart).padding(MeeshySpacing.sm))
    }
}

/**
 * Le player de scène de l'application, sur le sol de l'auteur. Sans player (aperçu, test) ou sans scène servie : le
 * premier média du contenu s'il en a un, sinon le sol seul — jamais un trou.
 */
@Composable
private fun ScenePicture(card: ContentCard, index: Int, modifier: Modifier) {
    val scene = card.scene
    val item = scene?.items?.getOrNull(index)
    val painter = LocalContentCardScenePainter.current
    Box(modifier.background(scene?.accentHex?.let(::hexColor)?.takeIf { it != Color.Unspecified }?.copy(alpha = FLOOR_ALPHA) ?: Color.Black)) {
        val fallback = card.media
        when {
            item != null && painter != null -> painter(item, scene.accentHex, Modifier.fillMaxSize())
            fallback != null -> MediaPicture(fallback)
        }
    }
}

/** Le son seul d'un contenu — un vocal posté, le son de fond d'une humeur — dans le lecteur audio de l'application. */
@Composable
internal fun ContentLinkCardSound(sound: ContentCardVisual.Sound, type: PostType) {
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier.fillMaxWidth().padding(start = MeeshySpacing.md, end = MeeshySpacing.md, top = MeeshySpacing.smPlus),
    ) {
        KindPill(type, overMedia = false)
        LocalContentCardSoundPlayer.current?.invoke(sound, Modifier.fillMaxWidth())
    }
}

/** Ce qui se peint sur un cadre donné : une image, ou l'image de garde d'une vidéo avec le signe lecture et sa durée. */
@Composable
internal fun BoxScope.MediaPicture(media: ContentCardMedia) {
    MediaThumbnail(media)
    if (media.isVideo) VideoSigns(media)
}
