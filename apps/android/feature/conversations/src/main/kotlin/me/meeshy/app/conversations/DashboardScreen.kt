package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.ManageSearch
import androidx.compose.material.icons.filled.MarkChatUnread
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.totalUnreadCount
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les conversations les plus recentes montrees sur le tableau de bord. */
internal const val DASHBOARD_RECENT_COUNT: Int = 3

/**
 * Total de non-lus et selection des recentes — extraits purs, testables en JVM.
 * Le total delegue au SSOT partage `List<ApiConversation>.totalUnreadCount()`
 * (`:core:model`), aussi consomme par le widget ecran d'accueil.
 */
internal fun dashboardUnreadTotal(conversations: List<ApiConversation>): Int =
    conversations.totalUnreadCount()

internal fun dashboardRecents(conversations: List<ApiConversation>): List<ApiConversation> =
    conversations
        .sortedByDescending { ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE }
        .take(DASHBOARD_RECENT_COUNT)

/**
 * Tableau de bord — parite iOS `WidgetPreviewView` (icone `square.grid.2x2` de la
 * barre de recherche) : carte des non-lus, conversations recentes, actions
 * rapides. Les donnees viennent du meme [ConversationListViewModel] cache-first
 * que la liste : l'ecran s'affiche instantanement depuis le cache.
 */
@Composable
fun DashboardScreen(
    onBack: () -> Unit,
    onOpenConversation: (String) -> Unit,
    onNewConversation: () -> Unit,
    onGlobalSearch: () -> Unit,
    onShareLinks: () -> Unit,
    onContacts: () -> Unit,
    viewModel: ConversationListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    MeeshyBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                // Cet ecran n'a pas de Scaffold : depuis que le Scaffold racine ne
                // reserve plus les barres systeme (MeeshyApp.kt, contentWindowInsets
                // a zero), il pose lui-meme son inset. Le fond reste PLEIN ECRAN,
                // seul le CONTENU est retreci — c'est exactement la geometrie
                // d'avant, le degrade en plus.
                .systemBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.global_search_back),
                        tint = MeeshyTheme.tokens.textPrimary,
                    )
                }
                Text(
                    text = stringResource(R.string.dashboard_title),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    fontWeight = FontWeight.Bold,
                )
            }

            Spacer(Modifier.padding(top = MeeshySpacing.sm))

            UnreadCard(unreadTotal = dashboardUnreadTotal(state.conversations))

            SectionTitle(stringResource(R.string.dashboard_recent))
            dashboardRecents(state.conversations).forEach { conversation ->
                RecentConversationRow(
                    conversation = conversation,
                    title = conversation.displayTitle(state.currentUserId),
                    onClick = { onOpenConversation(conversation.id) },
                )
            }

            SectionTitle(stringResource(R.string.dashboard_quick_actions))
            QuickActionRow(
                icon = Icons.AutoMirrored.Filled.Chat,
                tint = MeeshyPalette.Indigo500,
                label = stringResource(R.string.dashboard_action_new_conversation),
                onClick = onNewConversation,
            )
            QuickActionRow(
                icon = Icons.Filled.ManageSearch,
                tint = MeeshyPalette.Info,
                label = stringResource(R.string.dashboard_action_search),
                onClick = onGlobalSearch,
            )
            QuickActionRow(
                icon = Icons.Filled.AddLink,
                tint = MeeshyPalette.Success,
                label = stringResource(R.string.dashboard_action_share_links),
                onClick = onShareLinks,
            )
            QuickActionRow(
                icon = Icons.Filled.People,
                tint = MeeshyPalette.Warning,
                label = stringResource(R.string.dashboard_action_contacts),
                onClick = onContacts,
            )
            Spacer(Modifier.padding(bottom = MeeshySpacing.xl))
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(top = MeeshySpacing.lg, bottom = MeeshySpacing.sm),
    )
}

@Composable
private fun UnreadCard(unreadTotal: Int) {
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.lg),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(if (unreadTotal > 0) MeeshyPalette.Error else MeeshyPalette.Success),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.MarkChatUnread,
                    contentDescription = null,
                    tint = MeeshyPalette.White,
                )
            }
            Spacer(Modifier.width(MeeshySpacing.md))
            Column {
                Text(
                    text = unreadTotal.toString(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.dashboard_unread),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
        }
    }
}

@Composable
private fun RecentConversationRow(conversation: ApiConversation, title: String, onClick: () -> Unit) {
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.lg),
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(name = title, size = 40.dp)
            Spacer(Modifier.width(MeeshySpacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                )
                val preview = conversation.lastMessage?.content.orEmpty()
                if (preview.isNotBlank()) {
                    Text(
                        text = preview,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                        maxLines = 1,
                    )
                }
            }
            if (conversation.unreadCount > 0) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MeeshyPalette.Error)
                        .padding(horizontal = 7.dp, vertical = 2.dp),
                ) {
                    Text(
                        text = conversation.unreadCount.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyPalette.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickActionRow(
    icon: ImageVector,
    tint: Color,
    label: String,
    onClick: () -> Unit,
) {
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.lg),
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(tint),
                contentAlignment = Alignment.Center,
            ) {
                Icon(imageVector = icon, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(20.dp))
            }
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }
}
