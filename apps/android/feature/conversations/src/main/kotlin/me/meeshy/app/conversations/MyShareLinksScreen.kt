package me.meeshy.app.conversations

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.ui.platform.LocalDensity
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.CollapsibleHeaderPageProgress
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ExtendShareLinkForm
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.MyShareLinksPhase
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.ShareLinkExpiration
import me.meeshy.sdk.model.displayName
import me.meeshy.sdk.model.isExpired
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The user's own share-links management screen: an aggregate stats header plus the
 * list of created links, each with copy / share / activate-deactivate / delete.
 * Reached from Settings. Activate & delete apply optimistically (see
 * [MyShareLinksViewModel]); a failure rolls back and surfaces the message.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyShareLinksScreen(
    onBack: () -> Unit,
    onOpenLink: (MyShareLink) -> Unit,
    viewModel: MyShareLinksViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.onResumed() }

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
        Box(Modifier.fillMaxSize()) {
            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    state.showColdSpinner -> Box(Modifier.fillMaxSize().headerReserve()) {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                            color = MeeshyPalette.Indigo500,
                        )
                    }

                    state.showEmptyState -> EmptyLinks()

                    state.phase == MyShareLinksPhase.Error && state.links.isEmpty() ->
                        FailedLoad(message = state.errorMessage, onRetry = viewModel::refresh)

                    else -> LinksList(
                        listState = listState,
                        links = state.links,
                        stats = state.stats,
                        showFailureBanner = state.showFailureBanner,
                        onRetry = viewModel::refresh,
                        joinUrlFor = viewModel::joinUrlFor,
                        onOpen = onOpenLink,
                        onCopy = { link ->
                            copyToClipboard(context, viewModel.joinUrlFor(link))
                        },
                        onShare = { link ->
                            shareLink(context, viewModel.joinUrlFor(link))
                        },
                        onToggle = viewModel::toggleActive,
                        onDelete = viewModel::delete,
                        onExtend = viewModel::extendExpiry,
                    )
                }
            }
            CollapsibleHeader(
                title = stringResource(R.string.my_share_links_title),
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

/** Espace reserve sous l'en-tete repliable (barre d'etat + 64 dp) pour les etats sans liste. */
@Composable
private fun Modifier.headerReserve(): Modifier =
    this
        .windowInsetsPadding(WindowInsets.statusBars)
        .padding(top = CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp)

@Composable
private fun EmptyLinks() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .headerReserve()
            .verticalScroll(rememberScrollState())
            .padding(MeeshySpacing.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.my_share_links_empty_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.my_share_links_empty_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(top = MeeshySpacing.sm),
        )
    }
}

@Composable
private fun FailedLoad(message: String?, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .headerReserve()
            .verticalScroll(rememberScrollState())
            .padding(MeeshySpacing.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message ?: stringResource(R.string.sharelinks_list_refresh_failed),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.sharelinks_list_retry)) }
    }
}

@Composable
private fun FailureBanner(onRetry: () -> Unit) {
    MeeshyCard {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(
                text = stringResource(R.string.sharelinks_list_refresh_failed),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.warning,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry) { Text(stringResource(R.string.sharelinks_list_retry)) }
        }
    }
}

@Composable
private fun LinksList(
    listState: LazyListState,
    links: List<MyShareLink>,
    stats: MyShareLinkStats?,
    showFailureBanner: Boolean,
    onRetry: () -> Unit,
    joinUrlFor: (MyShareLink) -> String,
    onOpen: (MyShareLink) -> Unit,
    onCopy: (MyShareLink) -> Unit,
    onShare: (MyShareLink) -> Unit,
    onToggle: (MyShareLink) -> Unit,
    onDelete: (MyShareLink) -> Unit,
    onExtend: (MyShareLink, ShareLinkExpiration) -> Unit,
) {
    val nowMillis = remember { System.currentTimeMillis() }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = MeeshySpacing.lg,
            end = MeeshySpacing.lg,
            bottom = MeeshySpacing.lg,
        ),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        item(key = "collapsible-header-spacer", contentType = "spacer") {
            Spacer(
                Modifier
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .height(CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp),
            )
        }
        if (showFailureBanner) {
            item(key = "failure", contentType = "banner") { FailureBanner(onRetry) }
        }
        stats?.let {
            item(key = "stats", contentType = "stats") { StatsHeader(it) }
        }
        item(key = "section") {
            Text(
                text = stringResource(R.string.my_share_links_section),
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyTheme.tokens.textSecondary,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(vertical = MeeshySpacing.xs),
            )
        }
        items(links, key = { it.id }, contentType = { "link" }) { link ->
            ShareLinkRow(
                link = link,
                joinUrl = joinUrlFor(link),
                isExpired = link.isExpired(nowMillis),
                expiryLine = rowExpiry(link, nowMillis),
                onOpen = { onOpen(link) },
                onCopy = { onCopy(link) },
                onShare = { onShare(link) },
                onToggle = { onToggle(link) },
                onDelete = { onDelete(link) },
                onExtend = { expiration -> onExtend(link, expiration) },
            )
        }
    }
}

@Composable
private fun StatsHeader(stats: MyShareLinkStats) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        StatCard(
            value = stats.totalLinks,
            label = stringResource(R.string.my_share_links_stats_total),
            modifier = Modifier.weight(1f),
        )
        StatCard(
            value = stats.activeLinks,
            label = stringResource(R.string.my_share_links_stats_active),
            modifier = Modifier.weight(1f),
        )
        StatCard(
            value = stats.totalUses,
            label = stringResource(R.string.my_share_links_stats_uses),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StatCard(value: Int, label: String, modifier: Modifier = Modifier) {
    MeeshyCard(modifier = modifier) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(
                text = value.toString(),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun ShareLinkRow(
    link: MyShareLink,
    joinUrl: String,
    isExpired: Boolean,
    expiryLine: String?,
    onOpen: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
    onExtend: (ShareLinkExpiration) -> Unit,
) {
    val statusText = when {
        isExpired -> stringResource(R.string.my_share_links_expired)
        link.isActive -> stringResource(R.string.my_share_links_status_active)
        else -> stringResource(R.string.my_share_links_status_inactive)
    }
    val statusColor = when {
        isExpired -> MeeshyTheme.tokens.error
        link.isActive -> MeeshyPalette.Indigo400
        else -> MeeshyTheme.tokens.textMuted
    }
    MeeshyCard(onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = link.displayName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                )
                Text(
                    text = "$statusText · " + pluralStringResource(
                        R.plurals.my_share_links_joined_count,
                        link.currentUses,
                        link.currentUses,
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = statusColor,
                    maxLines = 1,
                )
                link.conversationTitle?.let { title ->
                    Text(
                        text = title,
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textMuted,
                        maxLines = 1,
                    )
                }
                expiryLine?.let { line ->
                    Text(
                        text = line,
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.warning,
                        maxLines = 1,
                    )
                }
            }
            Switch(
                checked = link.isActive,
                onCheckedChange = { onToggle() },
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ExtendMenuButton(onExtend = onExtend)
            IconButton(onClick = onCopy) {
                Icon(
                    Icons.Filled.ContentCopy,
                    contentDescription = stringResource(R.string.my_share_links_copy),
                    tint = MeeshyPalette.Indigo400,
                    modifier = Modifier.size(20.dp),
                )
            }
            IconButton(onClick = onShare) {
                Icon(
                    Icons.Filled.Share,
                    contentDescription = stringResource(R.string.my_share_links_share),
                    tint = MeeshyPalette.Indigo400,
                    modifier = Modifier.size(20.dp),
                )
            }
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.my_share_links_delete),
                    tint = MeeshyTheme.tokens.error,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

/** #10381 — la ligne dit l'échéance choisie ; un lien sans échéance n'ajoute rien à sa ligne. */
@Composable
private fun rowExpiry(link: MyShareLink, nowMillis: Long): String? {
    val expiresAt = isoToEpochMillisOrNull(link.expiresAt) ?: return null
    if (expiresAt <= nowMillis) return stringResource(R.string.conversationCard_expired)
    return stringResource(R.string.participantProfile_linkExpires) + " " + ShareLinkDateFormat.day(expiresAt)
}

@Composable
private fun ExtendMenuButton(onExtend: (ShareLinkExpiration) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    IconButton(onClick = { expanded = true }) {
        Icon(
            Icons.Filled.Schedule,
            contentDescription = stringResource(R.string.my_share_links_extend),
            tint = MeeshyPalette.Indigo400,
            modifier = Modifier.size(20.dp),
        )
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        ExtendShareLinkForm.options.forEach { option ->
            DropdownMenuItem(
                text = { Text(expiryOptionLabel(option)) },
                onClick = {
                    expanded = false
                    onExtend(option)
                },
            )
        }
    }
}

@Composable
private fun expiryOptionLabel(option: ShareLinkExpiration): String = stringResource(
    when (option) {
        ShareLinkExpiration.Hours24 -> R.string.my_share_links_expiry_24h
        ShareLinkExpiration.Days7 -> R.string.my_share_links_expiry_7d
        ShareLinkExpiration.Days30 -> R.string.my_share_links_expiry_30d
        ShareLinkExpiration.Months3 -> R.string.my_share_links_expiry_3m
        ShareLinkExpiration.Never -> R.string.my_share_links_expiry_7d
    },
)

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("meeshy-share-link", text))
    Toast.makeText(context, R.string.my_share_links_copied, Toast.LENGTH_SHORT).show()
}

private fun shareLink(context: Context, url: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.my_share_links_share_subject))
        putExtra(Intent.EXTRA_TEXT, url)
    }
    context.startActivity(
        Intent.createChooser(send, context.getString(R.string.my_share_links_share)),
    )
}
