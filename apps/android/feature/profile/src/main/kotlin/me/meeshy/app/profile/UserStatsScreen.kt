package me.meeshy.app.profile

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.NumberFormat
import java.util.Locale
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.CollapsibleHeaderPageProgress
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private const val BADGE_COLUMNS = 3
private const val COUNT_MILLIS = 700
private const val CHART_MILLIS = 900
private const val CARD_TINT_ALPHA = 0.10f
private const val CARD_BORDER_ALPHA = 0.28f

/**
 * Les statistiques de l'utilisateur (iOS `UserStatsView`) : six compteurs, l'activité des trente derniers jours et les
 * badges. Lecture seule, cache d'abord (le squelette n'existe qu'à froid), un échec se dit sans effacer l'instantané.
 * Les compteurs défilent vers leur valeur, la courbe se dessine, les badges glissent à leur place — tout cela sans
 * mouvement quand l'utilisateur l'a réduit.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserStatsScreen(
    onBack: () -> Unit,
    viewModel: UserStatsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val density = LocalDensity.current.density
    val offsetDp by remember(listState, density) {
        derivedStateOf {
            CollapsibleHeaderPageProgress.lazyOffsetDp(
                listState.firstVisibleItemIndex,
                listState.firstVisibleItemScrollOffset,
                density,
            )
        }
    }
    MeeshyBackground {
        Box(Modifier.fillMaxSize()) {
            PullToRefreshBox(
                isRefreshing = state.isRefreshing && state.hasContent,
                onRefresh = viewModel::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize().navigationBarsPadding(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    item(key = "inset") {
                        Spacer(
                            Modifier
                                .windowInsetsPadding(WindowInsets.statusBars)
                                .height(CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp),
                        )
                    }
                    state.failure?.let { failure ->
                        item(key = "failure") { StatsNotice(failure, onRetry = viewModel::refresh, Modifier.animateItem()) }
                    }
                    if (!state.hasContent && state.isColdLoading) {
                        item(key = "skeleton") { StatsSkeleton() }
                    }
                    state.stats?.let { stats ->
                        items(stats.tileRows(), key = { "tiles-${it.first().metric}" }) { row ->
                            Row(
                                Modifier.fillMaxWidth().animateItem(),
                                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                            ) {
                                row.forEach { tile -> StatCard(tile, Modifier.weight(1f)) }
                            }
                        }
                    }
                    state.timeline?.let { timeline ->
                        item(key = "activity") { ActivityCard(timeline, Modifier.animateItem()) }
                    }
                    state.stats?.takeIf { it.badges.isNotEmpty() }?.let { stats ->
                        item(key = "badges-title") {
                            SectionTitle(MeeshyIcons.Trophy, stringResource(R.string.user_stats_badges), MeeshyPalette.Warning, Modifier.animateItem())
                        }
                        items(stats.badges.chunked(BADGE_COLUMNS), key = { row -> "badges-${row.first().id}" }) { row ->
                            Row(
                                Modifier.fillMaxWidth().animateItem(),
                                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                            ) {
                                row.forEach { badge -> BadgeCell(badge, Modifier.weight(1f)) }
                                repeat(BADGE_COLUMNS - row.size) { Spacer(Modifier.weight(1f)) }
                            }
                        }
                    }
                    item(key = "end") { Spacer(Modifier.height(MeeshySpacing.xxxl)) }
                }
            }
            CollapsibleHeader(
                title = stringResource(R.string.user_stats_title),
                scrollOffsetDp = offsetDp,
                modifier = Modifier.fillMaxWidth(),
                onBack = onBack,
                titleColor = MeeshyTheme.tokens.textPrimary,
                backArrowColor = MeeshyPalette.Indigo500,
                backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
            )
        }
    }
}

/** Les six compteurs dans l'ordre de l'écran iOS, deux par ligne. */
private fun UserStatsPresentation.tileRows(): List<List<StatTile>> {
    val order = listOf(
        StatMetric.MESSAGES, StatMetric.CONVERSATIONS,
        StatMetric.TRANSLATIONS, StatMetric.LANGUAGES,
        StatMetric.MEMBER_DAYS, StatMetric.FRIEND_REQUESTS,
    )
    return order.mapNotNull { metric -> tiles.firstOrNull { it.metric == metric } }.chunked(2)
}

private data class StatLook(val label: Int, val icon: ImageVector, val tint: Color)

@Composable
private fun StatMetric.look(): StatLook = when (this) {
    StatMetric.MESSAGES -> StatLook(R.string.user_stats_messages, MeeshyIcons.MessageFilled, MeeshyPalette.Indigo500)
    StatMetric.CONVERSATIONS -> StatLook(R.string.user_stats_conversations, MeeshyIcons.GroupFilled, MeeshyPalette.Indigo300)
    StatMetric.TRANSLATIONS -> StatLook(R.string.user_stats_translations, MeeshyIcons.Globe, MeeshyPalette.Indigo600)
    StatMetric.LANGUAGES -> StatLook(R.string.user_stats_languages, MeeshyIcons.Translate, MeeshyPalette.TileBlue)
    StatMetric.MEMBER_DAYS -> StatLook(R.string.user_stats_member, MeeshyIcons.ScheduleFilled, MeeshyPalette.TileSaffron)
    StatMetric.FRIEND_REQUESTS -> StatLook(R.string.user_stats_requests, MeeshyIcons.PersonAdd, MeeshyPalette.TileRose)
}

/** Un entier qui défile vers sa valeur — d'abord de zéro, puis de la valeur affichée à la servie ; immobile si le mouvement est réduit. */
@Composable
private fun rollingCount(target: Int): Int {
    val reduce = LocalReduceMotion.current
    var goal by remember { mutableIntStateOf(if (reduce) target else 0) }
    LaunchedEffect(target) { goal = target }
    val shown by animateIntAsState(goal, if (reduce) tween(0) else tween(COUNT_MILLIS), label = "statCount")
    return shown
}

@Composable
private fun StatCard(tile: StatTile, modifier: Modifier = Modifier) {
    val look = tile.metric.look()
    val shown = rollingCount(tile.value)
    val value = if (tile.metric == StatMetric.MEMBER_DAYS) {
        stringResource(R.string.user_stats_member_days, shown)
    } else {
        remember(shown) { NumberFormat.getIntegerInstance(Locale.getDefault()).format(shown) }
    }
    val label = stringResource(look.label)
    Row(
        modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(look.tint.copy(alpha = CARD_TINT_ALPHA))
            .border(1.dp, look.tint.copy(alpha = CARD_BORDER_ALPHA), RoundedCornerShape(MeeshyRadius.md))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) { },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(36.dp).clip(RoundedCornerShape(MeeshyRadius.sm)).background(look.tint.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(look.icon, contentDescription = null, tint = look.tint, modifier = Modifier.size(20.dp))
        }
        Column {
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = look.tint, maxLines = 1)
            Text(label, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun SectionTitle(icon: ImageVector, text: String, tint: Color, modifier: Modifier = Modifier) {
    Row(
        modifier.padding(start = MeeshySpacing.xs).semantics(mergeDescendants = true) { },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = tint)
    }
}

@Composable
private fun ActivityCard(timeline: StatsTimelinePresentation, modifier: Modifier = Modifier) {
    val tint = MeeshyPalette.TileBlue
    val reduce = LocalReduceMotion.current
    val reveal = remember { Animatable(if (reduce) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduce) reveal.animateTo(1f, tween(CHART_MILLIS)) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        SectionTitle(MeeshyIcons.ChartLine, stringResource(R.string.user_stats_activity), MeeshyPalette.Info)
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(tint.copy(alpha = CARD_TINT_ALPHA))
                .border(1.dp, tint.copy(alpha = CARD_BORDER_ALPHA), RoundedCornerShape(MeeshyRadius.md))
                .padding(MeeshySpacing.md),
        ) {
            if (timeline.hasActivity) {
                ActivitySparkline(
                    bars = timeline.bars,
                    color = tint,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .drawWithContent {
                            clipRect(right = size.width * reveal.value) { this@drawWithContent.drawContent() }
                        },
                )
            } else {
                Text(stringResource(R.string.profile_activity_empty), style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
            }
        }
    }
}

@Composable
private fun BadgeCell(badge: AchievementBadge, modifier: Modifier = Modifier) {
    val tint = hexColor(badge.color).takeIf { it != Color.Unspecified } ?: MeeshyPalette.Warning
    Column(
        modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tint.copy(alpha = if (badge.isUnlocked) CARD_TINT_ALPHA else 0.04f))
            .padding(MeeshySpacing.sm)
            .alpha(if (badge.isUnlocked) 1f else 0.55f)
            .semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.Trophy, contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
        Text(badge.name, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("${badge.progressPercent}%", style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textSecondary)
    }
}

@Composable
private fun StatsNotice(failure: UserStatsFailure, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val offline = failure == UserStatsFailure.Offline
    val tint = if (offline) MeeshyPalette.Warning else MeeshyPalette.Error
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(tint.copy(alpha = CARD_TINT_ALPHA))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) { },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (offline) MeeshyIcons.WifiOff else MeeshyIcons.WarningFilled, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
        Text(
            stringResource(if (offline) R.string.user_stats_offline else R.string.user_stats_error),
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.common_retry), color = tint) }
    }
}

/** La FORME de l'écran à froid (trois lignes de deux cartes), jamais un spinner. */
@Composable
private fun StatsSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        repeat(3) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                repeat(2) {
                    Box(
                        Modifier
                            .weight(1f)
                            .height(68.dp)
                            .clip(RoundedCornerShape(MeeshyRadius.md))
                            .background(MeeshyTheme.tokens.backgroundTertiary),
                    )
                }
            }
        }
    }
}
