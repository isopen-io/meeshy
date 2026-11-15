package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.request.ImageRequest
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.ui.component.bubble.LocalBubbleMediaAutoDownload
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.ui.component.media.MosaicArrangement
import me.meeshy.ui.component.media.MosaicLayout
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Les visuels d'une publication, dans l'agencement choisi par son AUTEUR**
 * (#6514). La disposition ne se décide pas ici : [MosaicLayout.arrange] la
 * rend, et ce fichier choisit seulement la vue qui la peint. Un visuel seul
 * garde son rapport réel, le carrousel pagine, les quatre mosaïques posent
 * leurs tuiles.
 *
 * [onImageTap] `null` ⇒ aucune tuile n'est cliquable. Un hôte sans visionneuse
 * n'expose pas un contrôle qui ne ferait rien.
 */
@Composable
internal fun PostImageLayout(
    images: List<FeedPostImage>,
    layout: MosaicLayoutMode,
    onImageTap: ((Int) -> Unit)?,
) {
    when (val arrangement = MosaicLayout.arrange(images.size, layout)) {
        MosaicArrangement.Empty -> Unit
        MosaicArrangement.Single -> SingleFeedImage(image = images.first(), onImageTap = onImageTap)
        is MosaicArrangement.Paged -> FeedMediaCarousel(images = images, onImageTap = onImageTap)
        is MosaicArrangement.Tiled -> FeedMediaMosaic(images = images, arrangement = arrangement, onImageTap = onImageTap)
    }
}

@Composable
private fun SingleFeedImage(image: FeedPostImage, onImageTap: ((Int) -> Unit)?) {
    val openLabel = stringResource(R.string.feed_open_media)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(feedImageAspectRatio(image))
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(FEED_MEDIA_GROUND)
            .opensMedia(index = 0, label = openLabel, onImageTap = onImageTap),
    ) {
        FeedMediaImage(image = image, preferThumbnail = false)
        // Légende Prisme-résolue du média (#6280) — DISTINCTE du texte du post
        // (FeedPostPresentation.content) et de tout texte alternatif : un scrim
        // discret sous l'image, jamais de bannière ni de popup intrusive.
        image.caption?.takeIf { it.isNotBlank() }?.let { caption ->
            FeedMediaCaption(text = caption, maxLines = 2, modifier = Modifier.align(Alignment.BottomStart))
        }
    }
}

internal val FEED_MEDIA_GROUND: Color = MeeshyPalette.Indigo500.copy(alpha = 0.08f)

@Composable
internal fun FeedMediaImage(image: FeedPostImage, preferThumbnail: Boolean) {
    AsyncImage(
        model = if (preferThumbnail) image.thumbnailUrl ?: image.url else image.url,
        contentDescription = image.alt?.takeIf { it.isNotBlank() } ?: stringResource(R.string.feed_image_description),
        contentScale = ContentScale.Crop,
        placeholder = rememberThumbHashPainter(image.thumbHash),
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
internal fun FeedMediaCaption(text: String, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.55f))))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        Text(
            text = text,
            color = MeeshyPalette.White,
            fontSize = 13.sp,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * La légende qu'une tuile peut porter : celle du média, là où la place le
 * permet ([MosaicLayout.tileCarriesCaption]), bornée en mots
 * ([MosaicLayout.captionWordLimit]). `null` ⇒ la tuile n'en affiche aucune.
 */
internal fun FeedPostImage.captionFor(mode: MosaicLayoutMode, index: Int, count: Int, tileWidth: Float): String? {
    val text = caption?.takeIf { it.isNotBlank() } ?: return null
    if (!MosaicLayout.tileCarriesCaption(mode, index, count)) return null
    return MosaicLayout.truncateWords(text, MosaicLayout.captionWordLimit(mode, count, tileWidth))
}

internal fun Modifier.opensMedia(index: Int, label: String, onImageTap: ((Int) -> Unit)?): Modifier =
    if (onImageTap == null) this else clickable(onClickLabel = label) { onImageTap(index) }

internal fun feedImageAspectRatio(image: FeedPostImage): Float = feedMediaAspectRatio(image.width, image.height)

/** Le rapport borné d'un visuel de carte : dimensions absentes ⇒ 1,4 ; jamais plus étroit que 0,7 ni plus large que 1,9. */
internal fun feedMediaAspectRatio(width: Int?, height: Int?): Float {
    if (width == null || height == null || width <= 0 || height <= 0) return 1.4f
    return (width.toFloat() / height.toFloat()).coerceIn(0.7f, 1.9f)
}


/**
 * **Les médias de la carte du fil, tous types** (iOS `mediaPreview`, vue `3f`) : un média seul garde son rendu selon son type
 * (image bornée en ratio, vidéo à poster, audio à forme d'onde, document), à partir de deux la carte monte le carrousel. La
 * mosaïque n'est plus utilisée dans le fil. [onMediaTap] reçoit le rang du visuel touché parmi les images et vidéos du post.
 */
@Composable
internal fun FeedCardMedia(
    media: List<FeedMediaItem>,
    accentHex: String?,
    carrierLanguage: String?,
    onMediaTap: (Int) -> Unit,
) {
    val accent = remember(accentHex) { feedAccentColor(accentHex) }
    when {
        media.isEmpty() -> Unit
        media.size == 1 -> FeedSingleMediaCell(media.first(), accent, carrierLanguage, media, onMediaTap)
        else -> FeedMediaItemsCarousel(media, accent, carrierLanguage, onMediaTap)
    }
}

internal fun feedAccentColor(hex: String?): Color =
    hex?.let { hexColor(it) }?.takeIf { it != Color.Unspecified } ?: MeeshyPalette.Indigo500

@Composable
private fun FeedSingleMediaCell(
    item: FeedMediaItem,
    accent: Color,
    carrierLanguage: String?,
    media: List<FeedMediaItem>,
    onMediaTap: (Int) -> Unit,
) {
    val galleryIndex = FeedCardMediaRouting.galleryIndex(media, item.id)
    val onOpen = galleryIndex?.let { index -> { onMediaTap(index) } }
    val description = feedTileDescription(item)
    if (!FeedCardMediaRouting.isVisual(item)) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            FeedMediaCell(item, accent, carrierLanguage, description, onOpen, Modifier.fillMaxWidth())
            item.caption?.takeIf { it.isNotBlank() }?.let { caption ->
                Text(text = caption, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
            }
        }
        return
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(feedMediaAspectRatio(item.width, item.height))
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(FEED_MEDIA_GROUND),
    ) {
        FeedMediaCell(item, accent, carrierLanguage, description, onOpen, Modifier.fillMaxSize())
        FeedCaptionOverlay(caption = item.caption, modifier = Modifier.align(Alignment.BottomStart))
    }
}

/** Ce que TalkBack lit sur une tuile seule : le texte alternatif de l'auteur, sinon la légende servie, sinon un libellé par type. */
@Composable
internal fun feedTileDescription(item: FeedMediaItem): String =
    item.accessibilityDescription ?: stringResource(
        if (item.type == FeedMediaType.VIDEO) R.string.post_comments_media_play else R.string.feed_image_description,
    )

/** La cellule d'UN média selon son type — le seul aiguillage du fil. */
@Composable
internal fun FeedMediaCell(
    item: FeedMediaItem,
    accent: Color,
    carrierLanguage: String?,
    description: String,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    when (item.type) {
        FeedMediaType.IMAGE -> FeedImageMediaCell(item, description, onOpen, modifier)
        FeedMediaType.VIDEO -> FeedVideoMediaCell(item, accent, description, onOpen, modifier)
        FeedMediaType.AUDIO -> FeedAudioMediaCell(item, carrierLanguage, accent, modifier)
        FeedMediaType.DOCUMENT -> FeedDocumentCell(item, modifier)
        FeedMediaType.LOCATION -> Unit
    }
}

internal const val FEED_MEDIA_RETRY_TAG: String = "feed-media-retry"

/**
 * L'image d'une carte : thumbHash qui patiente, puis l'image. Un échec dessine un placeholder avec « Réessayer » (la requête est
 * relancée sous une autre clé), et « Hors ligne » quand l'appareil l'est. Le toucher ouvre la galerie plein écran.
 */
@Composable
internal fun FeedImageMediaCell(
    item: FeedMediaItem,
    description: String,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var attempt by remember(item.id) { mutableIntStateOf(0) }
    var failed by remember(item.id, attempt) { mutableStateOf(false) }
    val model: Any = remember(item.url, attempt) {
        if (attempt == 0) item.url else ImageRequest.Builder(context).data(item.url).setParameter("feed-retry", attempt, memoryCacheKey = null).build()
    }
    val offline = LocalBubbleMediaAutoDownload.current?.condition == NetworkCondition.OFFLINE
    val openLabel = stringResource(R.string.feed_media_view_fullscreen)
    Box(
        modifier = modifier
            .semantics {
                contentDescription = description
                if (onOpen != null) {
                    role = Role.Button
                    onClick(label = openLabel) { onOpen(); true }
                }
            }
            .then(if (onOpen != null) Modifier.clickable(onClickLabel = openLabel, onClick = onOpen) else Modifier),
    ) {
        if (failed) {
            FeedMediaFailure(offline = offline, onRetry = { attempt += 1 }, modifier = Modifier.fillMaxSize())
        } else {
            AsyncImage(
                model = model,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                placeholder = rememberThumbHashPainter(item.thumbHash),
                onError = { failed = true },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun FeedMediaFailure(offline: Boolean, onRetry: () -> Unit, modifier: Modifier) {
    Column(
        modifier = modifier.background(FEED_MEDIA_GROUND),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(MeeshyIcons.BrokenImage, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(32.dp))
        if (offline) {
            Text(
                text = stringResource(R.string.feed_offline_empty_title),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
        Text(
            text = stringResource(R.string.feed_retry),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button, onClick = onRetry)
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
                .testTag(FEED_MEDIA_RETRY_TAG),
        )
    }
}
