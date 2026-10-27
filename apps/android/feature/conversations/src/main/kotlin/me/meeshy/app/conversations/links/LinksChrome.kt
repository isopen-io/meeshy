package me.meeshy.app.conversations.links

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.CollapsibleHeaderPageProgress
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La teinte d'une carte ou d'un écran de liens, depuis son hexadécimal sans dièse (`MeeshyColors.*AccentHex`). */
internal fun linkAccent(hex: String): Color = Color(0xFF000000L or hex.toLong(16))

/** Teinte de surface d'une carte : le dégradé iOS `surfaceGradient(tint:)` se réduit ici à un voile teinté. */
internal fun Color.wash(alpha: Float = 0.10f): Color = copy(alpha = alpha)

/**
 * Page de liens commune : fond, en-tête repliable, tirer-pour-rafraîchir et colonne paresseuse.
 * Les écrans y posent leurs lignes ; la première est toujours l'espaceur sous l'en-tête.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LinksPage(
    title: String,
    accent: Color,
    onBack: () -> Unit,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
    content: LazyListScope.() -> Unit,
) {
    MeeshyBackground {
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
        Box(modifier.fillMaxSize()) {
            PullToRefreshBox(isRefreshing = isRefreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    state = listState,
                    contentPadding = PaddingValues(start = MeeshySpacing.lg, end = MeeshySpacing.lg, bottom = 40.dp),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    item(key = "header-spacer", contentType = "spacer") {
                        Spacer(
                            Modifier
                                .windowInsetsPadding(WindowInsets.statusBars)
                                .height(CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp),
                        )
                    }
                    content()
                }
            }
            CollapsibleHeader(
                title = title,
                scrollOffsetDp = offsetDp,
                modifier = Modifier.fillMaxWidth(),
                onBack = onBack,
                titleColor = MeeshyTheme.tokens.textPrimary,
                backArrowColor = accent,
                backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
                actions = actions,
            )
        }
    }
}

/** Un entier qui s'écoule vers sa valeur (compteur animé) ; sans animation si le mouvement est réduit. */
@Composable
internal fun animatedCount(target: Int): Int {
    val reduce = LocalReduceMotion.current
    val shown by animateIntAsState(
        targetValue = target,
        animationSpec = if (reduce) tween(0) else tween(COUNTER_MILLIS),
        label = "linkCounter",
    )
    return shown
}

private const val COUNTER_MILLIS = 600

/** Pastille ronde d'une icône, teintée à 15 % comme iOS. */
@Composable
internal fun LinkIconBadge(icon: ImageVector, accent: Color, size: Dp = 48.dp, tint: Color = accent) {
    Box(
        Modifier.size(size).clip(CircleShape).background(accent.wash(0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(size * 0.5f))
    }
}

/** Surface teintée d'une carte de liens (voile + liseré de la teinte). */
internal fun Modifier.linkSurface(accent: Color, radius: Dp = 14.dp): Modifier =
    clip(RoundedCornerShape(radius))
        .background(accent.wash())
        .border(1.dp, accent.copy(alpha = 0.2f), RoundedCornerShape(radius))

/** Titre de section en capitales espacées (iOS `kerning(0.8)`), annoncé comme un titre. */
@Composable
internal fun LinksSectionTitle(text: String, color: Color = MeeshyTheme.tokens.textSecondary) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = color,
        letterSpacing = 0.8.sp,
        modifier = Modifier.padding(start = MeeshySpacing.xs).semantics { heading() },
    )
}

/** Une tuile de chiffre : icône, compteur animé, légende. */
@Composable
internal fun LinkStatTile(icon: ImageVector, value: Int, label: String, accent: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.linkSurface(accent).padding(vertical = MeeshySpacing.mdPlus, horizontal = MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
        Text(
            text = animatedCount(value).toString(),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textSecondary, maxLines = 1)
    }
}

/** État vide d'une liste de liens : icône, titre, sous-titre. */
@Composable
internal fun LinkEmptyState(icon: ImageVector, title: String, subtitle: String, accent: Color) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(icon, contentDescription = null, tint = accent.copy(alpha = 0.45f), modifier = Modifier.size(40.dp))
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
    }
}

/** Bandeau d'échec d'un rafraîchissement : la liste reste affichée dessous (jamais d'écran vide pour un cache non vide). */
@Composable
internal fun LinkRefreshFailedBanner(onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().linkSurface(MeeshyTheme.tokens.warning).padding(MeeshySpacing.md)) {
        Text(
            text = stringResource(R.string.sharelinks_list_refresh_failed),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.warning,
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.sharelinks_list_retry)) }
    }
}

/** Placeholder de chargement à froid : trois lignes grisées (squelette) pendant que le réseau répond. */
@Composable
internal fun LinkSkeletonRows(accent: Color, rows: Int = 3) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        repeat(rows) {
            Box(Modifier.fillMaxWidth().height(72.dp).linkSurface(accent))
        }
    }
}

/** Copie, partage et haptique d'un lien : un seul endroit, les mêmes gestes sur tous les écrans de liens. */
internal class LinkActions(private val context: Context, private val haptics: MeeshyHaptics) {
    fun copy(text: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText(CLIP_LABEL, text))
        haptics.success()
        Toast.makeText(context, R.string.my_share_links_copied, Toast.LENGTH_SHORT).show()
    }

    fun share(text: String) {
        haptics.light()
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.my_share_links_share_subject))
            putExtra(Intent.EXTRA_TEXT, text)
        }
        context.startActivity(Intent.createChooser(send, context.getString(R.string.my_share_links_share)))
    }

    private companion object {
        const val CLIP_LABEL = "meeshy-link"
    }
}

@Composable
internal fun rememberLinkActions(): LinkActions {
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    return remember(context, haptics) { LinkActions(context, haptics) }
}
