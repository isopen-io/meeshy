package me.meeshy.ui.component.comments

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.CommentQuotedLegend
import me.meeshy.sdk.model.CommentQuotedMedia
import me.meeshy.sdk.model.legend
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **LA CITATION D'UN MÉDIA DE POST, aux DEUX moments où elle se voit** (iOS `CommentQuotedMediaViews`, #6578). Le bandeau
 * ([CommentQuotedMediaBanner]) dit ce dont un commentaire PUBLIÉ parle ; la puce ([CommentQuotationChip]) dit ce dont
 * je suis en train de parler, avec de quoi me raviser. Les deux rendent la même chose par [CommentQuotedMediaThumbnail] :
 * une vignette quand le média est encore rattrapable, sa NATURE seule quand il ne l'est plus — jamais un effacement.
 * [accent] vient de l'appelant (couleur de la conversation ou du post), jamais d'un littéral.
 */
@Composable
public fun CommentQuotedMediaBanner(citation: CommentQuotedMedia, accent: Color, modifier: Modifier = Modifier) {
    val legend = citation.legendText()
    val description = stringResource(R.string.comment_quote_a11y, legend)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = BANNER_HEIGHT)
            .clip(RoundedCornerShape(MeeshyRadius.xs))
            .background(accent.copy(alpha = SUBTLE))
            .padding(vertical = MeeshySpacing.xs, horizontal = MeeshySpacing.xsPlus)
            .semantics(mergeDescendants = true) { contentDescription = description },
    ) {
        Box(Modifier.size(width = BAR_WIDTH, height = BANNER_HEIGHT - 8.dp).clip(RoundedCornerShape(2.dp)).background(accent))
        CommentQuotedMediaThumbnail(citation, side = 34.dp, accent = accent)
        Text(
            text = legend,
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

/** La puce au-dessus du champ : « À propos de » + la légende, et la croix qui retire la citation. Rien si [citation] est nulle. */
@Composable
public fun CommentQuotationChip(
    citation: CommentQuotedMedia?,
    accent: Color,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(visible = citation != null, modifier = modifier) {
        val shown = citation ?: return@AnimatedVisibility
        val legend = shown.legendText()
        val removeLabel = stringResource(R.string.comment_quote_remove)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {},
            ) {
                CommentQuotedMediaThumbnail(shown, side = 30.dp, accent = accent)
                Column(Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.comment_quote_about),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textMuted,
                    )
                    Text(
                        text = legend,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Medium,
                        color = MeeshyTheme.tokens.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(REMOVE_TARGET)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClickLabel = removeLabel, onClick = onRemove)
                    .semantics { contentDescription = removeLabel },
            ) {
                Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(14.dp))
            }
        }
    }
}

/**
 * La vignette RELUE, ou le symbole de la NATURE quand il n'y a plus rien à relire : un seul site pour les deux surfaces,
 * pour qu'un même média ne dise pas deux choses selon l'endroit où on le regarde. Décorative : le texte porte le sens.
 */
@Composable
public fun CommentQuotedMediaThumbnail(citation: CommentQuotedMedia, side: Dp, accent: Color, modifier: Modifier = Modifier) {
    val url = citation.thumbnailUrl
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(side)
            .clip(RoundedCornerShape(MeeshyRadius.xxs))
            .background(accent.copy(alpha = LIGHT))
            .clearAndSetSemantics { },
    ) {
        if (url != null) {
            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(side))
        } else {
            Icon(citation.kind.glyph(), contentDescription = null, tint = accent, modifier = Modifier.size(side * GLYPH_RATIO))
        }
    }
}

@Composable
private fun CommentQuotedMedia.legendText(): String = when (val legend = legend) {
    is CommentQuotedLegend.Caption -> legend.text
    is CommentQuotedLegend.OfKind -> stringResource(legend.kind.nameRes())
}

private fun CommentQuotedMedia.Kind.glyph(): ImageVector = when (this) {
    CommentQuotedMedia.Kind.IMAGE -> MeeshyIcons.Photo
    CommentQuotedMedia.Kind.VIDEO -> MeeshyIcons.Video
    CommentQuotedMedia.Kind.AUDIO -> MeeshyIcons.Mic
    CommentQuotedMedia.Kind.LOCATION -> MeeshyIcons.Location
    CommentQuotedMedia.Kind.FILE -> MeeshyIcons.AttachFile
}

private fun CommentQuotedMedia.Kind.nameRes(): Int = when (this) {
    CommentQuotedMedia.Kind.IMAGE -> R.string.comment_quote_kind_image
    CommentQuotedMedia.Kind.VIDEO -> R.string.comment_quote_kind_video
    CommentQuotedMedia.Kind.AUDIO -> R.string.comment_quote_kind_audio
    CommentQuotedMedia.Kind.LOCATION -> R.string.comment_quote_kind_location
    CommentQuotedMedia.Kind.FILE -> R.string.comment_quote_kind_file
}

private val BANNER_HEIGHT = 42.dp
private val BAR_WIDTH = 3.dp
private val REMOVE_TARGET = 48.dp
private const val SUBTLE = 0.08f
private const val LIGHT = 0.15f
private const val GLYPH_RATIO = 0.42f
