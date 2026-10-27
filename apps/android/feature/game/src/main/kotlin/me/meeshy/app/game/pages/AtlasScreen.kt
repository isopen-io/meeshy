package me.meeshy.app.game.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.AtlasPending
import me.meeshy.sdk.model.game.AtlasStamp
import me.meeshy.sdk.model.game.GameAtlasBlock
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'ATLAS DES LANGUES (iOS `GameAtlasPage`) — le passeport. Chaque langue avec laquelle on a VRAIMENT échangé (un
 * message envoyé ET un reçu avec quelqu'un qui l'écrit) pose un tampon ; les échanges à moitié faits se disent à part,
 * et le reste est « à découvrir ». Les noms de langues viennent de la locale de l'appareil, jamais d'un catalogue écrit
 * à la main.
 *
 * PRIVÉ PAR DÉFAUT : une langue minoritaire ou liturgique peut révéler une origine ou une conviction. L'écran le dit en
 * toutes lettres et redit qui le voit — tel que la passerelle le sert. Ni l'interlocuteur ni la conversation ne sont
 * gardés : seulement la langue, les deux sens et la date. Changer qui le voit est une écriture d'une partie suivante.
 */
@Composable
fun AtlasScreen(onBack: () -> Unit) {
    GamePageHost(title = stringResource(R.string.game2_atlas_title), onBack = onBack) { game ->
        AtlasContent(game)
    }
}

@Composable
private fun AtlasContent(game: GameBlock) {
    val atlas = game.atlas
    if (atlas == null) {
        GameCard { GameNote(stringResource(R.string.game2_unavailable)) }
        return
    }
    val remaining = maxOf(0, atlas.total - atlas.stamped)
    AtlasHeader(atlas)
    AtlasStamps(atlas, remaining)
    if (atlas.pending.isNotEmpty()) AtlasPendingCard(atlas.pending)
    GameCard(title = stringResource(R.string.game2_atlas_visibility)) {
        val level = game.visibility?.atlas ?: ShowcaseVisibility.Me
        GameNote(stringResource(R.string.game2_visibility_field_atlas) + " : " + stringResource(visibilityRes(level)), tone = MeeshyTheme.tokens.textPrimary)
        GameNote(stringResource(R.string.game2_atlas_privacy))
    }
}

@Composable
private fun AtlasHeader(atlas: GameAtlasBlock) {
    val line = pluralStringResource(R.plurals.game_atlas_languages, atlas.stamped, count(atlas.stamped), count(atlas.total))
    GameCard(title = stringResource(R.string.game2_atlas_title), tint = MeeshyPalette.Indigo500) {
        Text(line, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
        GameProgressBar(atlas.stamped.toFloat() / maxOf(1, atlas.total), MeeshyPalette.Indigo500, line)
        GameNote(stringResource(R.string.game2_atlas_intro))
    }
}

@Composable
private fun AtlasStamps(atlas: GameAtlasBlock, remaining: Int) {
    val locale = currentLocale()
    GameCard(title = stringResource(R.string.game2_atlas_stamps)) {
        if (atlas.stamps.isEmpty()) GameNote(stringResource(R.string.game2_atlas_empty))
        val cells: List<StampCell> = atlas.stamps.mapIndexed { index, stamp -> StampCell.Stamped(stamp, tilt = if (index % 2 == 0) -TILT_A else TILT_B) } +
            List(minOf(PLACEHOLDERS, remaining)) { StampCell.Undiscovered }
        cells.chunked(COLUMNS).forEachIndexed { rowIndex, row ->
            Row(
                Modifier.fillMaxWidth().staggeredAppear(minOf(rowIndex, MAX_STAGGER_ROW)),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                row.forEach { cell ->
                    when (cell) {
                        is StampCell.Stamped -> StampedCell(cell.stamp, cell.tilt, locale, Modifier.weight(1f))
                        StampCell.Undiscovered -> Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { StampMark("", StampState.Undiscovered) }
                    }
                }
                repeat(COLUMNS - row.size) { Box(Modifier.weight(1f)) }
            }
        }
        if (remaining > 0) GameNote(stringResource(R.string.game2_atlas_remaining, count(remaining)))
    }
}

private sealed interface StampCell {
    data class Stamped(val stamp: AtlasStamp, val tilt: Float) : StampCell
    data object Undiscovered : StampCell
}

@Composable
private fun StampedCell(stamp: AtlasStamp, tilt: Float, locale: Locale, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val name = languageName(stamp.language, locale)
    val date = stringResource(R.string.game2_atlas_stamped_on, dayLabel(stamp.stampedOn, locale))
    Column(
        modifier.semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        StampMark(stamp.language, StampState.Stamped, Modifier.rotate(tilt))
        Text(name, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary, textAlign = TextAlign.Center)
        Text(date, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = tokens.textMuted, textAlign = TextAlign.Center)
    }
}

@Composable
private fun AtlasPendingCard(pending: List<AtlasPending>) {
    val locale = currentLocale()
    GameCard(title = stringResource(R.string.game2_atlas_pending)) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            pending.forEach { entry ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 44.dp).semantics(mergeDescendants = true) { },
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    StampMark(entry.language, StampState.Pending, size = 36.dp)
                    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                        Text(languageName(entry.language, locale), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
                        Text(
                            stringResource(if (entry.sent) R.string.game2_atlas_pending_sent else R.string.game2_atlas_pending_received),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            color = MeeshyTheme.tokens.textMuted,
                        )
                    }
                }
            }
        }
    }
}

private enum class StampState { Stamped, Pending, Undiscovered }

/** Le tampon : plein et encré, à moitié encré, ou en pointillé — la langue est dite à côté, le dessin est décoratif. */
@Composable
private fun StampMark(code: String, state: StampState, modifier: Modifier = Modifier, size: androidx.compose.ui.unit.Dp = 64.dp) {
    val tint = if (state == StampState.Undiscovered) MeeshyTheme.tokens.textMuted else MeeshyPalette.Indigo500
    val fill = when (state) {
        StampState.Stamped -> STAMPED_ALPHA
        StampState.Pending -> PENDING_ALPHA
        StampState.Undiscovered -> 0f
    }
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(tint.copy(alpha = fill))
            .border(2.dp, tint.copy(alpha = if (state == StampState.Undiscovered) UNDISCOVERED_BORDER else 1f), CircleShape)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Text(code.take(3).uppercase(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = tint)
    }
}

private const val COLUMNS = 3
private const val PLACEHOLDERS = 3
private const val TILT_A = 6f
private const val TILT_B = 8f
private const val MAX_STAGGER_ROW = 8
private const val STAMPED_ALPHA = 0.14f
private const val PENDING_ALPHA = 0.06f
private const val UNDISCOVERED_BORDER = 0.4f
