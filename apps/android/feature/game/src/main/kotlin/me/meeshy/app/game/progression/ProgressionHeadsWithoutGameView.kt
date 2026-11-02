package me.meeshy.app.game.progression

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.gestures.GameGesturesUiState
import me.meeshy.app.game.gestures.GameGesturesViewModel
import me.meeshy.app.game.gestures.mintFailureText
import me.meeshy.app.game.pages.GameActionButton
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.progression.MeeshAction
import me.meeshy.sdk.model.game.progression.ProgressionLevelHero
import me.meeshy.sdk.model.game.progression.ProgressionMeeshDetail
import me.meeshy.ui.component.game.MeeshCoin
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA TÊTE DU NIVEAU SANS BLOC DE JEU (iOS `ProgressionLevelHero`) : « Niveau N » en grand, les étincelles en indigo à
 * droite, la barre vers le suivant (elle se remplit à l'ouverture, posée d'un coup sous « réduire les animations ») et
 * ce qui en sépare — ou l'échelle complète. Fond teinté de la marque.
 */
@Composable
internal fun LevelHeroWithoutGame(hero: ProgressionLevelHero, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val tint = MeeshyPalette.Indigo500
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Column(
        modifier
            .testTag(LEVEL_HERO_TAG)
            .fillMaxWidth()
            .clip(shape)
            .background(tokens.backgroundSecondary)
            .background(tint.copy(alpha = TINT_FILL_ALPHA))
            .border(1.dp, tint.copy(alpha = TINT_STROKE_ALPHA), shape)
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                stringResource(R.string.progression_level, hero.level),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
            )
            Spacer(Modifier.weight(1f).width(MeeshySpacing.sm))
            Text(
                pluralStringResource(R.plurals.progression_points, hero.score, hero.score),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = tint,
            )
        }
        LabelledGauge(hero.progress, tint, stringResource(R.string.progression_a11y_bar_level, hero.level + 1))
        Text(
            hero.next?.let { stringResource(R.string.progression_next_level, it.remaining, it.level) }
                ?: stringResource(R.string.progression_scale_complete),
            style = MaterialTheme.typography.bodySmall,
            color = tokens.textMuted,
        )
    }
}

/**
 * LA TÊTE DE LA MEESH SANS BLOC DE JEU (iOS `ProgressionMeeshDetail`) : la pièce et le mot, le solde (« Aucune Meesh »
 * plutôt que « 0 »), les frappées depuis toujours, les deux bornes du registre, la barre, puis la frappe — le bouton
 * RESTE pendant la frappe et dit qu'il travaille — et son refus SOUS elle, ou ce qu'il manque. La frappe part par
 * l'API ([onMint]) ; le solde affiché est celui que la passerelle sert ensuite, jamais un débit calculé ici.
 */
@Composable
internal fun MeeshDetailWithoutGame(
    detail: ProgressionMeeshDetail,
    gestures: GameGesturesUiState,
    onMint: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val tint = MeeshyPalette.Warning
    val locale = LocalConfiguration.current.locales[0]
    Column(
        modifier
            .testTag(MEESH_DETAIL_TAG)
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(tokens.backgroundSecondary)
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            MeeshCoin(Modifier.size(16.dp))
            Text(
                stringResource(R.string.progression_meesh_title).uppercase(locale),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = tint,
            )
        }
        Text(balance(detail.balance), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
        detail.minted?.let {
            Text(minted(it), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
        }
        Bounds(detail, locale)
        LabelledGauge(detail.progress, tint, stringResource(R.string.progression_a11y_bar_meesh), Modifier.padding(top = MeeshySpacing.xs))
        when (val action = detail.action) {
            is MeeshAction.Mint -> {
                GameActionButton(
                    title = stringResource(R.string.progression_meesh_mint, action.cost),
                    onClick = onMint,
                    modifier = Modifier.padding(top = MeeshySpacing.xs).testTag(if (gestures.minting) MEESH_MINTING_TAG else MEESH_MINT_TAG),
                    busy = gestures.minting,
                    tint = tint,
                    busyTitle = stringResource(R.string.progression_meesh_minting),
                    ink = tokens.backgroundPrimary,
                )
                if (!gestures.minting) mintFailureText(gestures, debt = 0L)?.let { MintError(it) }
            }
            is MeeshAction.Missing -> Text(missing(action), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
        }
    }
}

/** La tête de la Meesh branchée sur les gestes du jeu : la frappe part sans aperçu, comme iOS (`viewModel.mint()`). */
@Composable
internal fun MeeshDetailWithoutGame(detail: ProgressionMeeshDetail, viewModel: GameGesturesViewModel) {
    val gestures by viewModel.state.collectAsStateWithLifecycle()
    MeeshDetailWithoutGame(detail, gestures, onMint = { viewModel.mint(null) })
}

/** La barre d'une tête, dite au lecteur d'écran par son libellé et sa part (iOS `ProgressionBar`). */
@Composable
private fun LabelledGauge(progress: Double, tint: Color, label: String, modifier: Modifier = Modifier) {
    val share = progress.toFloat().coerceIn(0f, 1f)
    Box(
        modifier.fillMaxWidth().semantics {
            contentDescription = label
            progressBarRangeInfo = ProgressBarRangeInfo(share, 0f..1f)
        },
    ) {
        ConceptGauge(share, tint)
    }
}

/** Les deux BORNES du registre : une frappe unique ne se dit qu'une fois, aucune frappe se dit en une phrase. */
@Composable
private fun Bounds(detail: ProgressionMeeshDetail, locale: Locale) {
    val tokens = MeeshyTheme.tokens
    val first = detail.first?.let { remember(it, locale) { abbreviated(it, locale) } }
    if (first == null) {
        Text(stringResource(R.string.progression_meesh_never_minted), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
        Bound(stringResource(R.string.progression_meesh_first_mint), first)
        detail.last?.let { iso -> remember(iso, locale) { abbreviated(iso, locale) } }?.let { Bound(stringResource(R.string.progression_meesh_last_mint), it) }
    }
}

@Composable
private fun Bound(title: String, date: String) {
    val tokens = MeeshyTheme.tokens
    Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
        Text(date, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textPrimary)
    }
}

@Composable
private fun MintError(message: String) {
    Row(
        Modifier.testTag(MEESH_MINT_ERROR_TAG).semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(14.dp))
        Text(message, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = MeeshyPalette.Error)
    }
}

@Composable
private fun balance(value: Int): String = when {
    value <= 0 -> stringResource(R.string.progression_meesh_none)
    value == 1 -> stringResource(R.string.progression_meesh_one)
    else -> stringResource(R.string.progression_meesh_many, value)
}

@Composable
private fun minted(value: Int): String =
    if (value == 1) stringResource(R.string.progression_meesh_minted_one) else stringResource(R.string.progression_meesh_minted_many, value)

/** « 600 étincelles jusqu'à ta prochaine Meesh. », puis le plancher de conversation quand il compte. */
@Composable
private fun missing(action: MeeshAction.Missing): String {
    val missing = pluralStringResource(R.plurals.progression_meesh_missing, action.missing, action.missing)
    if (action.floor <= 0) return missing
    return missing + " " + pluralStringResource(R.plurals.progression_meesh_floor, action.floor, action.floor)
}

/** La date d'une borne, abrégée dans la langue du lecteur (iOS `.abbreviated`) ; illisible, la chaîne servie. */
private fun abbreviated(iso: String, locale: Locale): String = runCatching {
    DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(Instant.parse(iso).atZone(ZoneId.systemDefault()))
}.getOrDefault(iso)

internal const val LEVEL_HERO_TAG = "progression.level.hero"
internal const val MEESH_DETAIL_TAG = "progression.meesh.detail"
internal const val MEESH_MINT_TAG = "progression.meesh.mint"
internal const val MEESH_MINTING_TAG = "progression.meesh.minting"
internal const val MEESH_MINT_ERROR_TAG = "progression.meesh.mint.error"
private const val TINT_FILL_ALPHA = 0.10f
private const val TINT_STROKE_ALPHA = 0.24f
