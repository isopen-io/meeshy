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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.DateFormat
import java.util.Date
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ShareLinkDetailPresentation
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The per-link share-link detail screen — the Android take on iOS `ShareLinkDetailView`.
 * Header (status + join URL), an actions bar (copy / share / activate-disable / delete),
 * usage stats and the link's information. Toggle applies optimistically; delete pops back
 * to the list once the server confirms (see [ShareLinkDetailViewModel]).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareLinkDetailScreen(
    onBack: () -> Unit,
    onDeleted: () -> Unit,
    viewModel: ShareLinkDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(state.isDeleted) {
        if (state.isDeleted) onDeleted()
    }

    val dismissLabel = stringResource(R.string.share_link_detail_dismiss)
    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { message ->
            snackbarHostState.showSnackbar(message = message, actionLabel = dismissLabel)
            viewModel.dismissError()
        }
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            snackbarHost = { SnackbarHost(snackbarHostState) },
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = {
                        Text(
                            text = state.presentation?.displayName
                                ?: stringResource(R.string.my_share_links_title),
                            maxLines = 1,
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.my_share_links_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                val presentation = state.presentation
                when {
                    state.showColdSpinner -> CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = MeeshyPalette.Indigo500,
                    )

                    presentation != null -> DetailContent(
                        presentation = presentation,
                        onCopy = { copyToClipboard(context, presentation.joinUrl) },
                        onShare = { shareLink(context, presentation.joinUrl) },
                        onToggle = viewModel::toggleActive,
                        onDelete = { showDeleteConfirm = true },
                    )

                    else -> NotFound()
                }
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(stringResource(R.string.share_link_detail_delete_title)) },
            text = { Text(stringResource(R.string.share_link_detail_delete_message)) },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteConfirm = false
                    viewModel.delete()
                }) {
                    Text(
                        stringResource(R.string.share_link_detail_delete_confirm),
                        color = MeeshyTheme.tokens.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text(stringResource(R.string.share_link_detail_cancel))
                }
            },
        )
    }
}

@Composable
private fun NotFound() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(MeeshySpacing.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.share_link_detail_not_found),
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun DetailContent(
    presentation: ShareLinkDetailPresentation,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        HeaderCard(presentation)
        ActionsBar(
            isActive = presentation.isActive,
            onCopy = onCopy,
            onShare = onShare,
            onToggle = onToggle,
            onDelete = onDelete,
        )
        StatsSection(presentation)
        InfoSection(presentation)
    }
}

@Composable
private fun HeaderCard(presentation: ShareLinkDetailPresentation) {
    val accent = if (presentation.isActive) MeeshyPalette.Indigo400 else MeeshyTheme.tokens.textMuted
    MeeshyCard {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .clip(CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (presentation.isActive) Icons.Filled.Link else Icons.Filled.LinkOff,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(32.dp),
                )
            }
            Text(
                text = presentation.displayName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
                textAlign = TextAlign.Center,
            )
            StatusLine(presentation)
            Text(
                text = presentation.joinUrl,
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
                maxLines = 2,
            )
        }
    }
}

@Composable
private fun StatusLine(presentation: ShareLinkDetailPresentation) {
    val statusText = when {
        presentation.isExpired -> stringResource(R.string.my_share_links_expired)
        presentation.isActive -> stringResource(R.string.my_share_links_status_active)
        else -> stringResource(R.string.my_share_links_status_inactive)
    }
    val statusColor = when {
        presentation.isExpired -> MeeshyTheme.tokens.error
        presentation.isActive -> MeeshyPalette.Indigo400
        else -> MeeshyTheme.tokens.textMuted
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = statusText,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = statusColor,
        )
        presentation.conversationTitle?.let { title ->
            Text(
                text = "· $title",
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun ActionsBar(
    isActive: Boolean,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        ActionButton(
            label = stringResource(R.string.my_share_links_copy),
            icon = Icons.Filled.ContentCopy,
            tint = MeeshyPalette.Indigo400,
            onClick = onCopy,
        )
        ActionButton(
            label = stringResource(R.string.my_share_links_share),
            icon = Icons.Filled.Share,
            tint = MeeshyPalette.Indigo400,
            onClick = onShare,
        )
        ActionButton(
            label = if (isActive) {
                stringResource(R.string.share_link_detail_disable)
            } else {
                stringResource(R.string.share_link_detail_activate)
            },
            icon = if (isActive) Icons.Filled.PauseCircle else Icons.Filled.PlayCircle,
            tint = if (isActive) MeeshyTheme.tokens.warning else MeeshyTheme.tokens.success,
            onClick = onToggle,
        )
        ActionButton(
            label = stringResource(R.string.my_share_links_delete),
            icon = Icons.Filled.Delete,
            tint = MeeshyTheme.tokens.error,
            onClick = onDelete,
        )
    }
}

@Composable
private fun ActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = onClick) {
            Icon(imageVector = icon, contentDescription = label, tint = tint)
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun StatsSection(presentation: ShareLinkDetailPresentation) {
    SectionTitle(stringResource(R.string.share_link_detail_stats_title))
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        StatCard(
            value = presentation.usesLabel,
            label = stringResource(R.string.share_link_detail_stats_uses),
            modifier = Modifier.weight(1f),
        )
        StatCard(
            value = presentation.maxUsesLabel,
            label = stringResource(R.string.share_link_detail_stats_max),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StatCard(value: String, label: String, modifier: Modifier = Modifier) {
    MeeshyCard(modifier = modifier) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(
                text = value,
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
private fun InfoSection(presentation: ShareLinkDetailPresentation) {
    SectionTitle(stringResource(R.string.share_link_detail_info_title))
    MeeshyCard {
        InfoRow(
            label = stringResource(R.string.share_link_detail_identifier),
            value = presentation.identifierLabel,
        )
        presentation.createdAtMillis?.let { millis ->
            Spacer(Modifier.size(MeeshySpacing.sm))
            InfoRow(
                label = stringResource(R.string.share_link_detail_created),
                value = formatDate(millis),
            )
        }
        presentation.expiresAtMillis?.let { millis ->
            Spacer(Modifier.size(MeeshySpacing.sm))
            InfoRow(
                label = stringResource(R.string.share_link_detail_expires),
                value = formatDate(millis),
            )
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textSecondary,
    )
}

/** Localized medium-date label — same SSOT format as the profile "member since" line. */
private fun formatDate(epochMillis: Long): String =
    DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(epochMillis))

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
