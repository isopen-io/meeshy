package me.meeshy.app.chat.export

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Un choix en capsule : l'élu s'inverse (encre pleine), cible de 44 dp. */
@Composable
internal fun CardPill(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val fill by animateColorAsState(if (selected) tokens.textPrimary else tokens.controlFill, label = "pillFill")
    val ink by animateColorAsState(if (selected) tokens.backgroundPrimary else tokens.textPrimary, label = "pillInk")
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = 44.dp)
            .clip(CircleShape)
            .background(fill)
            .semantics { role = Role.Button; this.selected = selected }
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.mdPlus),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = ink, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), maxLines = 1)
    }
}

/** Une tuile du plateau : un contenu de 56 dp et son libellé, l'élue cernée. */
@Composable
internal fun CardTile(label: String, selected: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier
            .width(64.dp)
            .semantics(mergeDescendants = true) { role = Role.Button; this.selected = selected; contentDescription = label }
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if (selected) tokens.hairline else tokens.controlFill)
                .border(
                    BorderStroke(if (selected) 2.dp else 0.dp, if (selected) tokens.textPrimary else Color.Transparent),
                    RoundedCornerShape(14.dp),
                ),
            contentAlignment = Alignment.Center,
        ) { content() }
        Text(
            label, color = tokens.textPrimary, textAlign = TextAlign.Center, maxLines = 2,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal),
        )
    }
}

/** La pastille d'une palette : son fond en dégradé, un point à son accent. */
@Composable
internal fun CardSwatch(palette: CardPalette, modifier: Modifier = Modifier, shape: androidx.compose.ui.graphics.Shape = CircleShape) {
    val colors = remember(palette) { palette.background.map { Color(it.color.toArgb()) } }
    Box(modifier.clip(shape).background(Brush.linearGradient(if (colors.size > 1) colors else colors + colors)), contentAlignment = Alignment.Center) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(Color(palette.accent.toArgb())))
    }
}

/** Le « Aa » d'une typographie, dans la police que la carte lui donne. */
@Composable
internal fun CardTypefaceGlyph(id: CardTypefaceId) {
    val face = id.typeface.replyFace
    val family = remember(face) { FontFamily(CardRenderer.typeface(face)) }
    Text("Aa", fontFamily = family, color = MeeshyTheme.tokens.textPrimary, style = MaterialTheme.typography.titleLarge)
}

/** Une vignette de template : sa VRAIE carte, peinte à l'entrée à l'écran — jamais un carré vide. */
@Composable
internal fun CardThumb(
    id: CardTemplateId,
    source: CardThumbSource,
    selected: Boolean,
    width: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val key = source.keyOf(id)
    val pixels = with(androidx.compose.ui.platform.LocalDensity.current) { (width * 2).roundToPx() }
    val image: ImageBitmap? by produceState<ImageBitmap?>(source.store.cached(key)?.asImageBitmap(), key) {
        value = source.store.cached(key)?.asImageBitmap()
            ?: source.store.image(key, source.inputOf(id), pixels).asImageBitmap()
    }
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier = modifier
            .width(width)
            .clip(shape)
            .border(BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.hairline), shape)
            .semantics { role = Role.Button; this.selected = selected; contentDescription = id.palette.palette.name }
            .clickable(onClick = onClick),
        contentAlignment = Alignment.TopCenter,
    ) {
        CardSwatch(id.palette.palette, Modifier.width(width).size(width, width * 4 / 3), shape)
        image?.let { Image(BitmapPainter(it), contentDescription = null, contentScale = ContentScale.FillWidth, modifier = Modifier.width(width)) }
    }
}

/** Ce qu'une vignette doit savoir pour se peindre dans l'état courant de la carte. */
class CardThumbSource(
    val store: CardThumbnailStore,
    val keyOf: (CardTemplateId) -> String,
    val inputOf: (CardTemplateId) -> CardInput,
)
