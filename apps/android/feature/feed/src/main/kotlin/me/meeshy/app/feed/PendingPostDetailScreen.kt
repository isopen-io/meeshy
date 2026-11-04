package me.meeshy.app.feed

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le détail d'une publication encore sur l'appareil (#14902, iOS #14879) — atteint en touchant sa carte. Rien n'existe
 * côté serveur sous son id local : aucun chargement, aucune salle, aucune ouverture comptée, aucun compositeur de
 * commentaire. Son ⋯ n'offre qu'« Annuler l'envoi » ; l'écran se ferme dès qu'elle quitte la file, annulée ou partie.
 */
@Composable
fun PendingPostDetailScreen(
    cmid: String,
    onBack: () -> Unit,
    viewModel: UnsentPublicationsViewModel = hiltViewModel(),
) {
    val cards by viewModel.cards.collectAsStateWithLifecycle()
    val offline by viewModel.offline.collectAsStateWithLifecycle()
    val card = remember(cards, cmid) { cards?.firstOrNull { it.post.id == cmid } }
    val held = cards
    LaunchedEffect(held, card) {
        if (held != null && card == null) onBack()
    }
    val context = LocalContext.current
    LaunchedEffect(viewModel) {
        viewModel.feedback.collect { Toast.makeText(context, context.getString(it.messageRes), Toast.LENGTH_SHORT).show() }
    }
    card?.let { shown ->
        PendingPostDetailContent(
            card = shown,
            offline = offline,
            onBack = onBack,
            onCancel = {
                viewModel.cancelSend(shown.post.id)
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PendingPostDetailContent(card: PendingFeedCard, offline: Boolean, onBack: () -> Unit, onCancel: () -> Unit) {
    val actions = remember(card.post.id, onCancel) {
        PendingSendActions(canRetry = false, canReopen = false, onRetry = {}, onReopen = {}, onCancel = onCancel)
    }
    MeeshyBackground {
        Scaffold(
            topBar = {
                CenterAlignedTopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.post_detail_title), fontWeight = FontWeight.Bold) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = MeeshyIcons.Back,
                                contentDescription = stringResource(R.string.post_detail_back),
                                tint = MeeshyTheme.tokens.textPrimary,
                            )
                        }
                    },
                )
            },
            containerColor = Color.Transparent,
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(MeeshySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                FeedPostCardHeader(
                    post = card.post,
                    isOwn = true,
                    onShare = {},
                    onCopyLink = {},
                    onCopyText = {},
                    onRepost = null,
                    onQuote = null,
                    onBookmark = {},
                    onPin = {},
                    onReport = {},
                    onDelete = {},
                    pendingSend = actions,
                )
                FeedPostCardBody(post = card.post, onFlagTap = {})
                OnlyUnlinkedRefusalLine(card.publication)
                UnsentPublicationMedia(card.publication, offline)
            }
        }
    }
}
