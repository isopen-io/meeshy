package me.meeshy.app.chat.export

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce qu'une vignette de maquette doit savoir pour se peindre sur le message courant. */
class CardModelThumbSource(
    val store: CardThumbnailStore,
    val keyOf: (CardModel) -> String,
    val inputOf: (CardModel) -> CardInput,
    val pictures: Map<String, android.graphics.Bitmap> = emptyMap(),
)

/**
 * LA RANGÉE « STYLES » (#18673, miroir de `MessageCardModelRow`) : les maquettes, chacune peinte sur
 * le message avec son nom dessous, puis l'accès aux combinaisons de palette, police et liaison.
 */
@Composable
internal fun CardModelRow(
    models: List<CardModel>,
    selectedId: String?,
    source: CardModelThumbSource,
    onPick: (CardModel) -> Unit,
    onCombinations: () -> Unit,
) {
    val language = Locale.getDefault().language
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xxs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.Top,
    ) {
        models.forEach { model ->
            CardModelThumb(model, model.name(language), source, model.id == selectedId, 64.dp) { onPick(model) }
        }
        CombinationsTile(onCombinations)
    }
}

@Composable
private fun CardModelThumb(model: CardModel, name: String, source: CardModelThumbSource, selected: Boolean, width: Dp, onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val key = source.keyOf(model)
    val pixels = with(LocalDensity.current) { (width * 2).roundToPx() }
    val image: ImageBitmap? by produceState(source.store.cached(key)?.asImageBitmap(), key) {
        value = source.store.cached(key)?.asImageBitmap()
            ?: source.store.image(key, source.inputOf(model), pixels, source.pictures).asImageBitmap()
    }
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .width(width)
            .semantics { role = Role.Button; this.selected = selected; contentDescription = name }
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(
            Modifier
                .size(width, width * 1.25f)
                .clip(shape)
                .border(BorderStroke(if (selected) 2.dp else 1.dp, if (selected) tokens.textPrimary else tokens.hairline), shape),
            contentAlignment = Alignment.Center,
        ) {
            CardSwatch(model.palette.palette, Modifier.size(width, width * 1.25f), shape)
            image?.let { Image(BitmapPainter(it), contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(width, width * 1.25f)) }
        }
        Text(
            name, maxLines = 1, overflow = TextOverflow.Ellipsis,
            color = tokens.textPrimary,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal),
        )
    }
}

@Composable
private fun CombinationsTile(onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val label = stringResource(R.string.export_card_models_combinations)
    Column(
        modifier = Modifier
            .width(64.dp)
            .semantics { role = Role.Button; contentDescription = label }
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Column(
            Modifier.size(64.dp, 80.dp).clip(RoundedCornerShape(12.dp)).background(tokens.controlFill),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("▦", color = tokens.textPrimary, style = MaterialTheme.typography.titleMedium)
            Text("${CardTemplates.all.size}", color = tokens.textPrimary, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
        }
        Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, color = tokens.textPrimary, style = MaterialTheme.typography.labelSmall)
    }
}
