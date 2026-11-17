package me.meeshy.ui.component.contentcard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.ZoneId
import java.util.Locale
import kotlin.math.min
import kotlin.math.roundToInt
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentCardMedia
import me.meeshy.sdk.model.contentcard.ContentCardStats
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.sdk.model.format.LocalizedNumber
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.media.DecodeBudget
import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.ui.R
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.media.MeeshyAsyncImage
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberReaderLocale
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.MeeshyThemeTokens

private val CardMaxWidth = 280.dp
private val AvatarSize = 20.dp
private val PlaySize = 36.dp
private val PlayGlyphSize = 22.dp
private val PillIconSize = 12.dp
private val StatIconSize = 13.dp
private val UnavailableIconSize = 16.dp
private val SkeletonMediaHeight = 120.dp
private val SkeletonLineWidth = 140.dp
private val SkeletonLineHeight = 12.dp
private val MoodEmojiSize = 28.sp
private const val SurfaceAlpha = 0.96f
private const val ScrimAlpha = 0.55f

/**
 * La carte d'un post, d'un réel, d'une story ou d'une humeur dans une bulle ou sous le texte d'un post (iOS
 * `ContentLinkCard`, contrat #19331 § 4) : le média en tête (vignette, ▶ et durée, « +N », pastille du genre), puis
 * l'auteur et sa date, le texte du Prisme et les compteurs. Un toucher ouvre le contenu ; l'appui long reste celui de
 * l'hôte ([onLongPress], le menu du message dans une bulle) ; TalkBack la lit d'un tenant.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ContentLinkCardView(
    card: ContentCard,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    onLongPress: (() -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val spoken = spokenLabel(card)
    val hint = stringResource(R.string.content_card_a11y_open)
    Column(
        modifier = modifier
            .cardSurface(tokens)
            .let { surface ->
                if (onLongPress == null) {
                    surface.clickable(onClickLabel = hint, onClick = onOpen)
                } else {
                    surface.combinedClickable(onClickLabel = hint, onLongClick = onLongPress, onClick = onOpen)
                }
            }
            .clearAndSetSemantics {
                contentDescription = spoken
                role = Role.Button
            },
    ) {
        card.media?.let { MediaBlock(it, card.type) }
        Body(card, tokens)
    }
}

/** Le squelette, sur cache vide seulement : la forme de la carte, sans roue. */
@Composable
internal fun ContentLinkCardSkeleton(modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val spoken = stringResource(R.string.skeleton_feed_post_loading)
    Column(modifier = modifier.cardSurface(tokens).semantics { contentDescription = spoken }) {
        MeeshySkeletonBox(Modifier.fillMaxWidth().height(SkeletonMediaHeight), shape = RoundedCornerShape(0.dp))
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), modifier = Modifier.padding(MeeshySpacing.md)) {
            MeeshySkeletonBox(Modifier.width(SkeletonLineWidth).height(SkeletonLineHeight))
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(SkeletonLineHeight))
        }
    }
}

/** Le contenu n'est plus servi au lecteur : une ligne atténuée, sans porte, qui ne répète jamais le lien. */
@Composable
internal fun ContentLinkCardUnavailable(type: PostType?, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val message = stringResource(R.string.content_failure_unavailable_title)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = modifier
            .cardSurface(tokens)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus)
            .clearAndSetSemantics { contentDescription = message },
    ) {
        Icon(type?.icon() ?: MeeshyIcons.Block, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(UnavailableIconSize))
        Text(message, color = tokens.textSecondary, fontSize = MeeshyFontSize.subhead, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

private fun Modifier.cardSurface(tokens: MeeshyThemeTokens): Modifier {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    return padding(top = MeeshySpacing.sm)
        .widthIn(max = CardMaxWidth)
        .fillMaxWidth()
        .clip(shape)
        .background(tokens.backgroundPrimary.copy(alpha = SurfaceAlpha))
        .border(BorderStroke(1.dp, tokens.hairline), shape)
}

@Composable
private fun MediaBlock(media: ContentCardMedia, type: PostType) {
    val baseUrl = LocalMediaBaseUrl.current
    val locale = rememberReaderLocale()
    val url = remember(media.imageUrl, baseUrl) { media.imageUrl?.let { resolveMediaUrl(it, baseUrl) } }
    Box(Modifier.fillMaxWidth().mediaFrame(media.aspectRatio, media.maxHeightDp.dp)) {
        MeeshyAsyncImage(
            url = url,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            surface = DecodeBudget.Surface.Fitting(CardMaxWidth.value, media.maxHeightDp.toFloat()),
            thumbHash = media.thumbHash,
            showsStatusOverlays = false,
        )
        KindPill(type, overMedia = true, modifier = Modifier.align(Alignment.TopStart).padding(MeeshySpacing.sm))
        if (media.extraCount > 0) {
            ScrimPill("+" + LocalizedNumber.exact(media.extraCount, locale), Modifier.align(Alignment.TopEnd).padding(MeeshySpacing.sm))
        }
        if (media.isVideo) {
            PlayGlyph(Modifier.align(Alignment.Center))
            media.durationSeconds?.let { seconds ->
                ScrimPill(LocalizedNumber.duration(seconds, locale = locale), Modifier.align(Alignment.BottomEnd).padding(MeeshySpacing.sm))
            }
        }
    }
}

/** Le cadre du média : toute la largeur, la hauteur du rapport donné, bornée par [maxHeight]. */
private fun Modifier.mediaFrame(aspectRatio: Float, maxHeight: Dp): Modifier = layout { measurable, constraints ->
    val width = if (constraints.hasBoundedWidth) constraints.maxWidth else CardMaxWidth.roundToPx()
    val height = min((width / aspectRatio).roundToInt(), maxHeight.roundToPx())
        .coerceIn(constraints.minHeight, constraints.maxHeight)
    val placeable = measurable.measure(Constraints.fixed(width, height))
    layout(width, height) { placeable.placeRelative(0, 0) }
}

@Composable
private fun Body(card: ContentCard, tokens: MeeshyThemeTokens) {
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
    ) {
        AuthorLine(card, tokens)
        if (card.moodEmoji != null || card.text.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                card.moodEmoji?.let { emoji -> Text(emoji, fontSize = MoodEmojiSize) }
                if (card.text.isNotEmpty()) {
                    Text(
                        card.text,
                        color = tokens.textPrimary,
                        fontSize = MeeshyFontSize.subhead,
                        maxLines = card.textMaxLines,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        StatsLine(card.stats, tokens)
    }
}

@Composable
private fun AuthorLine(card: ContentCard, tokens: MeeshyThemeTokens) {
    val date = relativeDate(card.createdAtIso)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        if (card.media == null) KindPill(card.type, overMedia = false)
        MeeshyAvatar(name = card.author.name, size = AvatarSize, imageUrl = card.author.avatarUrl)
        Text(
            card.author.name,
            color = tokens.textPrimary,
            fontSize = MeeshyFontSize.small,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        date?.let { label ->
            Text("·", color = tokens.textSecondary, fontSize = MeeshyFontSize.small)
            Text(label, color = tokens.textSecondary, fontSize = MeeshyFontSize.small, maxLines = 1)
        }
    }
}

@Composable
private fun relativeDate(iso: String?): String? {
    val strings = rememberRelativeTimeStrings()
    return remember(iso, strings) {
        isoToEpochMillisOrNull(iso)?.let { millis ->
            RelativeTimeFormat.short(millis, System.currentTimeMillis(), ZoneId.systemDefault(), Locale.getDefault(), strings)
        }
    }
}

/** 👁 vues (toujours) · ♥ j'aime et 💬 commentaires (s'il y en a) · 🔖 favoris (toujours, plein si le lecteur l'a enregistré). */
@Composable
private fun StatsLine(stats: ContentCardStats, tokens: MeeshyThemeTokens) {
    val locale = rememberReaderLocale()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Stat(MeeshyIcons.Eye, stats.views, locale, tokens.textSecondary)
        if (stats.likes > 0) Stat(MeeshyIcons.HeartFilled, stats.likes, locale, tokens.textSecondary)
        if (stats.comments > 0) Stat(MeeshyIcons.ChatBubbleOutline, stats.comments, locale, tokens.textSecondary)
        Stat(
            icon = if (stats.isBookmarkedByMe) MeeshyIcons.BookmarkFilled else MeeshyIcons.Bookmark,
            count = stats.bookmarks,
            locale = locale,
            tint = if (stats.isBookmarkedByMe) tokens.warning else tokens.textSecondary,
        )
    }
}

@Composable
private fun Stat(icon: ImageVector, count: Int, locale: Locale, tint: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(StatIconSize))
        Text(CompactCountFormat.text(count, locale), color = tint, fontSize = MeeshyFontSize.footnote, maxLines = 1)
    }
}

/** La pastille du genre : sur le média (voile sombre) ou devant le nom quand le contenu n'en a pas. */
@Composable
private fun KindPill(type: PostType, overMedia: Boolean, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val ink = if (overMedia) MeeshyPalette.White else tokens.textSecondary
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(if (overMedia) Color.Black.copy(alpha = ScrimAlpha) else tokens.controlFill)
            .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs),
    ) {
        Icon(type.icon(), contentDescription = null, tint = ink, modifier = Modifier.size(PillIconSize))
        Text(stringResource(type.labelRes()), color = ink, fontSize = MeeshyFontSize.caption, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun ScrimPill(label: String, modifier: Modifier) {
    Text(
        label,
        color = MeeshyPalette.White,
        fontSize = MeeshyFontSize.footnote,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.xs))
            .background(Color.Black.copy(alpha = ScrimAlpha))
            .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs),
    )
}

@Composable
private fun PlayGlyph(modifier: Modifier) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.size(PlaySize).clip(CircleShape).background(Color.Black.copy(alpha = ScrimAlpha)),
    ) {
        Icon(MeeshyIcons.Play, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(PlayGlyphSize))
    }
}

/** « {Genre} de {Auteur}. {texte}. {n} vues, {m} favoris[, enregistré] » — le libellé UNIQUE de la carte. */
@Composable
private fun spokenLabel(card: ContentCard): String {
    val byAuthor = when (card.type) {
        PostType.POST -> stringResource(R.string.content_card_a11y_post_by, card.author.name)
        PostType.REEL -> stringResource(R.string.content_card_a11y_reel_by, card.author.name)
        PostType.STORY -> stringResource(R.string.content_card_a11y_story_by, card.author.name)
        PostType.STATUS -> stringResource(R.string.content_card_a11y_mood_by, card.author.name)
    }
    val text = listOfNotNull(card.moodEmoji, card.text.takeIf { it.isNotEmpty() }).joinToString(" ").takeIf { it.isNotEmpty() }
    val counts = listOfNotNull(
        pluralStringResource(R.plurals.content_card_a11y_views, card.stats.views, card.stats.views),
        stringResource(R.string.content_card_a11y_saves, card.stats.bookmarks),
        stringResource(R.string.content_card_a11y_saved).takeIf { card.stats.isBookmarkedByMe },
    ).joinToString(", ")
    return listOfNotNull(byAuthor, text, counts).joinToString(". ")
}

private fun PostType.icon(): ImageVector = when (this) {
    PostType.POST -> MeeshyIcons.GridViewFilled
    PostType.REEL -> MeeshyIcons.Movie
    PostType.STORY -> MeeshyIcons.Slideshow
    PostType.STATUS -> MeeshyIcons.EmojiFilled
}

private fun PostType.labelRes(): Int = when (this) {
    PostType.POST -> R.string.content_card_kind_post
    PostType.REEL -> R.string.content_card_kind_reel
    PostType.STORY -> R.string.content_card_kind_story
    PostType.STATUS -> R.string.content_card_kind_mood
}
