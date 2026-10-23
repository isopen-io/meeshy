package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun ReactionDetailsSheet(
    details: ReactionDetailsUiState,
    accentColor: Color,
    onSelectTab: (Int) -> Unit,
    modifier: Modifier = Modifier,
    onReact: ((String) -> Unit)? = null,
    onOpenFullPicker: (() -> Unit)? = null,
) {
    val haptics = rememberMeeshyHaptics()
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.chat_reactions_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )

        if (onReact != null) {
            QuickReactionStrip(
                emojis = details.quickEmojis,
                accentColor = accentColor,
                onReact = { emoji ->
                    haptics.light()
                    onReact(emoji)
                },
                onOpenFullPicker = onOpenFullPicker,
            )
        }

        val tabs = details.breakdown.tabs
        if (tabs.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                contentPadding = PaddingValues(horizontal = MeeshySpacing.lg),
                modifier = Modifier.fillMaxWidth(),
            ) {
                itemsIndexed(tabs) { index, tab ->
                    val selected = index == details.selectedTabIndex
                    val label = when (tab) {
                        is ReactionTab.All -> stringResource(R.string.chat_reactions_all)
                        is ReactionTab.Emoji -> tab.emoji
                    }
                    val countA11y = stringResource(R.string.message_detail_reactions_count_a11y, tab.count)
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(MeeshyRadius.pill))
                            .background(
                                if (selected) accentColor.copy(alpha = 0.18f)
                                else MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                            )
                            .clickable {
                                haptics.light()
                                onSelectTab(index)
                            }
                            .semantics(mergeDescendants = true) {
                                role = Role.Tab
                                contentDescription = label
                                stateDescription = countA11y
                                this.selected = selected
                            }
                            .defaultMinSize(minHeight = 48.dp)
                            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(text = label, style = MaterialTheme.typography.labelLarge)
                        Text(
                            text = tab.count.toString(),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (selected) accentColor else MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(MeeshySpacing.sm))

        val reactors = details.selectedTab?.reactors.orEmpty()
        when {
            details.isLoading && reactors.isEmpty() ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(MeeshySpacing.xl),
                    contentAlignment = Alignment.Center,
                ) { ReactionRowsSkeleton() }

            reactors.isEmpty() ->
                Text(
                    text = stringResource(R.string.message_detail_reactions_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(
                        horizontal = MeeshySpacing.lg,
                        vertical = MeeshySpacing.lg,
                    ),
                )

            else ->
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                    items(reactors, key = { it.userId + it.emoji }) { reactor ->
                        ReactionReactorRow(reactor = reactor, accentColor = accentColor)
                    }
                }
        }
    }
}

@Composable
private fun ReactionReactorRow(reactor: ReactionReactor, accentColor: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        MeeshyAvatar(name = reactor.displayName ?: reactor.userId, size = 36.dp, containerColor = accentColor)
        Text(
            text = when {
                reactor.isSelf -> stringResource(R.string.chat_reactions_you)
                else -> reactor.displayName ?: stringResource(R.string.common_unknown)
            },
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(text = reactor.emoji, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun QuickReactionStrip(
    emojis: List<String>,
    accentColor: Color,
    onReact: (String) -> Unit,
    onOpenFullPicker: (() -> Unit)?,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.sm),
    ) {
        items(emojis, key = { it }) { emoji ->
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button) { onReact(emoji) },
                contentAlignment = Alignment.Center,
            ) { Text(text = emoji, style = MaterialTheme.typography.titleLarge) }
        }
        if (onOpenFullPicker != null) {
            item(key = "more") {
                IconButton(onClick = onOpenFullPicker, modifier = Modifier.size(48.dp)) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = stringResource(R.string.chat_reactions_more),
                        tint = accentColor,
                    )
                }
            }
        }
    }
}

@Composable
private fun ReactionRowsSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        repeat(SKELETON_ROWS) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                MeeshySkeletonBox(modifier = Modifier.size(36.dp), shape = CircleShape)
                MeeshySkeletonBox(modifier = Modifier.height(14.dp).fillMaxWidth(0.5f))
            }
        }
    }
}

private const val SKELETON_ROWS = 4
