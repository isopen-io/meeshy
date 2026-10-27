package me.meeshy.app.conversations.links

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.links.displayName
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val ACCENT_HEX = "4F46E5"
private const val COPIED_FEEDBACK_MS = 2_000L

/**
 * La fiche d'un lien de suivi (iOS `TrackingLinkDetailView`) : carte d'identité, actions (copier avec
 * coche de retour, partager, QR, supprimer), chiffres animés, répartitions, derniers clics et UTM.
 * Le lien se peint d'abord du cache de la liste ; les clics arrivent ensuite sans bloquer l'écran.
 */
@Composable
fun TrackingLinkDetailScreen(
    onBack: () -> Unit,
    viewModel: TrackingLinkDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val accent = linkAccent(ACCENT_HEX)
    val actions = rememberLinkActions()
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    var copied by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var qrBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                LinkEvent.Removed -> { haptics.success(); onBack() }
                LinkEvent.RemoveFailed -> haptics.error()
                LinkEvent.Created -> Unit
            }
        }
    }
    LaunchedEffect(copied) {
        if (copied) { delay(COPIED_FEEDBACK_MS); copied = false }
    }

    val link = state.link
    LinksPage(
        title = link?.displayName.orEmpty(),
        accent = accent,
        onBack = onBack,
        isRefreshing = state.isLoadingClicks && link != null,
        onRefresh = viewModel::load,
    ) {
        if (link == null) {
            item(key = "loading", contentType = "loading") {
                Column(Modifier.fillMaxWidth().padding(MeeshySpacing.xxxl), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (state.loadFailed) {
                        Text(stringResource(R.string.sharelinks_list_refresh_failed), color = MeeshyTheme.tokens.textSecondary)
                        TextButton(onClick = viewModel::load) { Text(stringResource(R.string.sharelinks_list_retry)) }
                    } else {
                        CircularProgressIndicator(color = accent)
                    }
                }
            }
            return@LinksPage
        }
        item(key = "header", contentType = "header") { TrackingHeaderCard(link, accent) }
        item(key = "actions", contentType = "actions") {
            TrackingActionsBar(
                copied = copied,
                accent = accent,
                onCopy = { actions.copy(link.shortUrl); copied = true },
                onShare = { actions.share(link.shortUrl) },
                onQr = { qrBitmap = QrLinkShare.render(link.shortUrl) },
                onDelete = { confirmDelete = true },
            )
        }
        item(key = "stats", contentType = "stats") { TrackingMainStats(link, accent) }
        if (state.loadFailed) item(key = "failed", contentType = "banner") { LinkRefreshFailedBanner(viewModel::load) }
        if (state.clicks.isNotEmpty()) {
            item(key = "countries", contentType = "breakdown") {
                BreakdownCard(R.string.links_tracking_detail_countries, state.breakdown.countries, accent, showFlag = true)
            }
            item(key = "devices", contentType = "breakdown") {
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                    BreakdownCard(R.string.links_tracking_detail_devices, state.breakdown.devices, accent)
                    BreakdownCard(R.string.links_tracking_detail_browsers, state.breakdown.browsers, accent)
                }
            }
            item(key = "timeline", contentType = "timeline") { ClicksTimeline(state.clicks, accent, state.isLoadingClicks) }
        }
        item(key = "utm", contentType = "utm") { UtmInfoCard(link, accent) }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.links_tracking_detail_confirm_delete), fontWeight = FontWeight.SemiBold) },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; viewModel.delete() }, enabled = !state.isDeleting) {
                    Text(stringResource(R.string.links_tracking_detail_delete), color = MeeshyTheme.tokens.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.links_common_cancel)) } },
        )
    }

    qrBitmap?.let { bitmap ->
        QrDialog(
            bitmap = bitmap,
            onShare = { QrLinkShare.share(context, bitmap, "meeshy-qr-${link?.token.orEmpty()}", context.getString(R.string.links_tracking_detail_qr)) },
            onDismiss = { qrBitmap = null },
        )
    }
}
