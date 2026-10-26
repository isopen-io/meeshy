package me.meeshy.app.community

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.community.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** La feuille « Ajouter un channel » (iOS `AddChannelSheet`) : recherche locale, tap pour rattacher, confirmation avant un déplacement. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityAddChannelSheet(
    communityId: String,
    onAdded: () -> Unit,
    onDismiss: () -> Unit,
    viewModel: CommunityAddChannelViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    LaunchedEffect(communityId) { viewModel.start(communityId) }
    LaunchedEffect(viewModel) {
        viewModel.effects.collect {
            haptics.success()
            onAdded()
        }
    }
    val tokens = MeeshyTheme.tokens
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false), containerColor = tokens.backgroundPrimary) {
        Column(Modifier.fillMaxWidth().height(520.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.community_add_channel_title),
                    Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 18.sp, color = tokens.textPrimary,
                )
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.community_common_close)) }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(10.dp))
                    .background(tokens.backgroundSecondary.copy(alpha = 0.5f)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = tokens.textMuted, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f)) {
                    PlainField(state.query, viewModel::onQuery, stringResource(R.string.community_add_channel_search_prompt), ImeAction.Search)
                }
                if (state.query.isNotEmpty()) {
                    Icon(Icons.Filled.Close, stringResource(R.string.community_common_close), tint = tokens.textMuted,
                        modifier = Modifier.size(18.dp).pressableScale(onClick = { viewModel.onQuery("") }))
                }
            }
            val visible = state.visible
            when {
                state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                visible.isEmpty() -> Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(Icons.Filled.ChatBubble, null, tint = tokens.textMuted, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.height(12.dp))
                    Text(
                        stringResource(if (state.query.isEmpty()) R.string.community_add_channel_empty_no_conversations else R.string.community_add_channel_empty_no_results),
                        fontWeight = FontWeight.Medium, color = tokens.textSecondary,
                    )
                    if (state.query.isEmpty()) {
                        Text(stringResource(R.string.community_add_channel_empty_hint), fontSize = 14.sp, color = tokens.textMuted, modifier = Modifier.padding(top = 6.dp))
                    }
                }
                else -> LazyColumn(Modifier.fillMaxSize().navigationBarsPadding()) {
                    items(visible, key = { it.id }, contentType = { "candidate" }) { c ->
                        CandidateRow(c, adding = state.addingId == c.id, enabled = state.addingId == null, onClick = { viewModel.onPick(c) }, modifier = Modifier.animateItem())
                    }
                }
            }
        }
    }
    state.pendingMove?.let {
        AlertDialog(
            onDismissRequest = viewModel::cancelMove,
            title = { Text(stringResource(R.string.community_add_channel_move_confirm_title)) },
            text = { Text(stringResource(R.string.community_add_channel_move_confirm_message)) },
            confirmButton = { TextButton(onClick = viewModel::confirmMove) { Text(stringResource(R.string.community_add_channel_move_button)) } },
            dismissButton = { TextButton(onClick = viewModel::cancelMove) { Text(stringResource(R.string.community_common_cancel)) } },
        )
    }
    state.errorMessage?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            title = { Text(stringResource(R.string.community_common_error)) },
            text = { Text(message.ifBlank { stringResource(R.string.community_settings_error_default) }) },
            confirmButton = { TextButton(onClick = viewModel::dismissError) { Text(stringResource(R.string.community_common_ok)) } },
        )
    }
}

@Composable
private fun CandidateRow(c: CommunityChannelCandidate, adding: Boolean, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    Row(
        modifier.fillMaxWidth().pressableScale(onClick = onClick, pressedScale = 0.98f, enabled = enabled).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(8.dp)).background(MeeshyPalette.Indigo500.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Tag, null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(c.title, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                c.memberCount?.let {
                    Icon(Icons.Filled.People, null, tint = tokens.textMuted, modifier = Modifier.size(12.dp))
                    Text(it.toString(), fontSize = 12.sp, color = tokens.textMuted)
                }
                if (c.belongsToOtherCommunity) {
                    Icon(Icons.Filled.SwapHoriz, null, tint = MeeshyPalette.Amber500, modifier = Modifier.size(12.dp))
                    Text(stringResource(R.string.community_add_channel_other_community), fontSize = 11.sp, color = MeeshyPalette.Amber500)
                }
            }
        }
        if (adding) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
        else Icon(
            if (c.belongsToOtherCommunity) Icons.Filled.SwapHoriz else Icons.Filled.AddCircle, null,
            tint = if (c.belongsToOtherCommunity) MeeshyPalette.Amber500 else MeeshyPalette.Indigo500,
            modifier = Modifier.size(24.dp),
        )
    }
}
