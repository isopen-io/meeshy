package me.meeshy.app.conversations

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
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
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.ShareLinkDetailFeedback
import me.meeshy.sdk.model.ShareLinkDetailPresentation
import me.meeshy.sdk.model.ShareLinkDetailState
import me.meeshy.ui.component.avatarInitials
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La fiche d'un lien de conversation, détails ET édition (#7797) — miroir de `ShareLinkDetailView`
 * (iOS). De haut en bas : la carte du lien (dégradé de la marque, adresse `meeshy.me/chat/<linkId>`),
 * sa configuration en lecture, puis le formulaire qui la modifie. Le lien s'affiche DEPUIS la
 * ligne de liste qui l'a ouvert (cache d'abord). Chaque action est optimiste ; un échec rend l'état
 * d'avant et le brouillon reste (voir [ShareLinkDetailViewModel]).
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
    val scope = rememberCoroutineScope()

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

    val savedMessage = stringResource(R.string.shareLink_detail_saved)
    val saveFailedMessage = stringResource(R.string.shareLink_detail_saveFailed)
    LaunchedEffect(state.feedback) {
        val message = when (state.feedback) {
            ShareLinkDetailFeedback.Saved -> savedMessage
            ShareLinkDetailFeedback.SaveFailed -> saveFailedMessage
            null -> return@LaunchedEffect
        }
        scope.launch { snackbarHostState.showSnackbar(message = message) }
        viewModel.feedbackShown()
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
                            overflow = TextOverflow.Ellipsis,
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
                val link = state.link
                when {
                    state.showColdSpinner -> CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = MeeshyPalette.Indigo500,
                    )

                    presentation != null && link != null -> DetailContent(
                        state = state,
                        link = link,
                        presentation = presentation,
                        viewModel = viewModel,
                        onCopy = { copyToClipboard(context, presentation.address) },
                        onShare = { shareLink(context, presentation.address) },
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
    state: ShareLinkDetailState,
    link: MyShareLink,
    presentation: ShareLinkDetailPresentation,
    viewModel: ShareLinkDetailViewModel,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onDelete: () -> Unit,
) {
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    var formTop by remember { mutableFloatStateOf(0f) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        HeroCard(presentation = presentation, description = link.description, onCopy = onCopy, onShare = onShare)
        ShareLinkConfigurationCard(
            link = link,
            onEdit = { scope.launch { scroll.animateScrollTo(formTop.toInt()) } },
        )
        ShareLinkEditForm(
            draft = state.draft,
            isActive = link.isActive,
            canSave = state.canSave,
            isSaving = state.isSaving,
            nowMillis = System.currentTimeMillis(),
            onDraftChange = viewModel::onDraftChange,
            onSave = viewModel::save,
            onToggleActive = viewModel::toggleActive,
            onDelete = onDelete,
            modifier = Modifier.onGloballyPositioned { formTop = it.positionInParent().y },
        )
    }
}

/** La carte du lien : dégradé de la marque, adresse canonique, message d'invitation, partager / copier. */
@Composable
private fun HeroCard(
    presentation: ShareLinkDetailPresentation,
    description: String?,
    onCopy: () -> Unit,
    onShare: () -> Unit,
) {
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(COPIED_FEEDBACK_MILLIS)
            copied = false
        }
    }
    val onHero = Color.White
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.linearGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Indigo700, MeeshyPalette.Purple600)),
            )
            .padding(MeeshySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(onHero.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = avatarInitials(presentation.groupName),
                    color = onHero,
                    fontWeight = FontWeight.ExtraBold,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = presentation.groupName,
                    color = onHero,
                    fontWeight = FontWeight.ExtraBold,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                presentation.createdAtMillis?.let { created ->
                    Text(
                        text = stringResource(R.string.shareLink_detail_createdOn, ShareLinkDateFormat.day(created)),
                        color = onHero.copy(alpha = 0.85f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            StatusBadge(isActive = presentation.isActive)
        }

        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            SelectionContainer {
                Text(
                    text = presentation.displayAddress,
                    color = onHero,
                    style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(onHero.copy(alpha = 0.16f))
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                )
            }
        }

        description?.takeIf { it.isNotBlank() }?.let { message ->
            Text(
                text = "« $message »",
                color = onHero.copy(alpha = 0.92f),
                fontStyle = FontStyle.Italic,
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), modifier = Modifier.fillMaxWidth()) {
            HeroButton(
                label = stringResource(R.string.common_share),
                icon = Icons.Filled.Share,
                filled = true,
                onClick = onShare,
                modifier = Modifier.weight(1f),
            )
            HeroButton(
                label = stringResource(if (copied) R.string.shareLink_a11y_copied else R.string.share_links_copy_a11y),
                icon = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                filled = false,
                onClick = {
                    onCopy()
                    copied = true
                },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun StatusBadge(isActive: Boolean) {
    Text(
        text = stringResource(if (isActive) R.string.common_active else R.string.common_inactive).uppercase(),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.ExtraBold,
        color = if (isActive) MeeshyPalette.Indigo950 else Color.White,
        modifier = Modifier
            .clip(CircleShape)
            .background(if (isActive) MeeshyPalette.Success else Color.White.copy(alpha = 0.3f))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    )
}

@Composable
private fun HeroButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    filled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val content = if (filled) MeeshyPalette.Indigo700 else Color.White
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (filled) Color.White else Color.White.copy(alpha = 0.14f))
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = content, modifier = Modifier.size(18.dp))
        Text(
            text = label,
            color = content,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private const val COPIED_FEEDBACK_MILLIS = 2_000L

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
