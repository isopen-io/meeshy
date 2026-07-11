package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.mediacache.ByteSizeFormatter
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheReport
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Media-cache management screen (feature-parity §L) — surpasses iOS `DataStorageView`, which shows
 * no sizes and only a single "clear all". Here the total and every per-category size are visible and
 * each category can be cleared on its own or all at once (with a confirmation for the sweep). Pure
 * glue over [MediaCacheViewModel]; the size arithmetic, report model and formatting live in tested
 * SSOTs ([MediaCacheReport], [ByteSizeFormatter], [MediaCacheScanner]).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaCacheScreen(
    onBack: () -> Unit,
    viewModel: MediaCacheViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmClearAll by remember { mutableStateOf(false) }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.media_cache_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.settings_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                InfoCard()

                val report = state.report
                when {
                    report == null && state.isLoading -> LoadingCard()
                    report != null -> {
                        TotalCard(totalBytes = report.totalBytes)
                        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                            MediaCacheCategory.entries.forEach { category ->
                                CategoryRow(
                                    category = category,
                                    bytes = report.bytesFor(category),
                                    isClearing = category in state.clearing,
                                    onClear = { viewModel.clear(category) },
                                )
                            }
                        }
                    }
                }

                state.error?.let { error ->
                    Text(
                        text = stringResource(error.messageRes()),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyPalette.Error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Button(
                    onClick = { confirmClearAll = true },
                    enabled = state.canClear,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.ErrorStrong),
                ) {
                    Icon(Icons.Filled.DeleteSweep, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(MeeshySpacing.sm))
                    Text(stringResource(R.string.media_cache_clear_all))
                }

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }

    if (confirmClearAll) {
        AlertDialog(
            onDismissRequest = { confirmClearAll = false },
            title = { Text(stringResource(R.string.media_cache_confirm_title)) },
            text = { Text(stringResource(R.string.media_cache_confirm_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmClearAll = false
                        viewModel.clearAll()
                    },
                ) {
                    Text(stringResource(R.string.media_cache_confirm_clear), color = MeeshyPalette.ErrorStrong)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmClearAll = false }) {
                    Text(stringResource(R.string.media_cache_confirm_cancel))
                }
            },
        )
    }
}

@Composable
private fun InfoCard() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyPalette.Warning.copy(alpha = 0.10f), RoundedCornerShape(MeeshySpacing.md))
            .border(1.dp, MeeshyPalette.Warning.copy(alpha = 0.3f), RoundedCornerShape(MeeshySpacing.md))
            .padding(MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Storage, contentDescription = null, tint = MeeshyPalette.Warning)
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = stringResource(R.string.media_cache_info_title),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.media_cache_info_body),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun TotalCard(totalBytes: Long) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f), RoundedCornerShape(MeeshySpacing.md))
            .padding(MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.media_cache_total_label),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Text(
            text = ByteSizeFormatter.format(totalBytes),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}

@Composable
private fun CategoryRow(
    category: MediaCacheCategory,
    bytes: Long,
    isClearing: Boolean,
    onClear: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = category.icon(),
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(22.dp),
        )
        Text(
            text = stringResource(category.labelRes()),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = ByteSizeFormatter.format(bytes),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Box(modifier = Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            when {
                isClearing -> CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    color = MeeshyPalette.ErrorStrong,
                    strokeWidth = 2.dp,
                )
                bytes > 0L -> IconButton(onClick = onClear) {
                    Icon(
                        Icons.Filled.DeleteSweep,
                        contentDescription = stringResource(R.string.media_cache_clear_category),
                        tint = MeeshyPalette.ErrorStrong,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadingCard() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(120.dp),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
    }
}

private fun MediaCacheCategory.labelRes(): Int = when (this) {
    MediaCacheCategory.IMAGES -> R.string.media_cache_category_images
    MediaCacheCategory.AUDIO -> R.string.media_cache_category_audio
    MediaCacheCategory.VIDEO -> R.string.media_cache_category_video
    MediaCacheCategory.THUMBNAILS -> R.string.media_cache_category_thumbnails
}

private fun MediaCacheCategory.icon(): ImageVector = when (this) {
    MediaCacheCategory.IMAGES -> Icons.Filled.Image
    MediaCacheCategory.AUDIO -> Icons.Filled.MusicNote
    MediaCacheCategory.VIDEO -> Icons.Filled.Movie
    MediaCacheCategory.THUMBNAILS -> Icons.Filled.PhotoLibrary
}

private fun MediaCacheError.messageRes(): Int = when (this) {
    MediaCacheError.SCAN -> R.string.media_cache_error_scan
    MediaCacheError.CLEAR -> R.string.media_cache_error_clear
}
