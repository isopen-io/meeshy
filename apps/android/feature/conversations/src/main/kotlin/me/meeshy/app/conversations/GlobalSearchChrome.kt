package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun SearchHeader(
    query: String,
    onQueryChange: (String) -> Unit,
    onBack: () -> Unit,
    focusRequester: FocusRequester,
) {
    val fieldDescription = stringResource(R.string.global_search_hint)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.global_search_back),
                tint = MeeshyTheme.tokens.textPrimary,
            )
        }
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.pill),
            modifier = Modifier.weight(1f),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Search,
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(20.dp),
                )
                BasicTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = MeeshyTheme.tokens.textPrimary),
                    cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = MeeshySpacing.sm)
                        .focusRequester(focusRequester)
                        .semantics { contentDescription = fieldDescription },
                    decorationBox = { inner ->
                        Box(contentAlignment = Alignment.CenterStart) {
                            if (query.isEmpty()) {
                                Text(
                                    text = fieldDescription,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MeeshyTheme.tokens.textMuted,
                                )
                            }
                            inner()
                        }
                    },
                )
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }, modifier = Modifier.size(32.dp)) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.global_search_clear_field),
                            tint = MeeshyTheme.tokens.textMuted,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.width(MeeshySpacing.sm))
    }
}

@Composable
internal fun SearchTabRow(
    current: GlobalSearchTab,
    countFor: (GlobalSearchTab) -> Int,
    onSelect: (GlobalSearchTab) -> Unit,
) {
    Row(modifier = Modifier.fillMaxWidth()) {
        GlobalSearchTab.entries.forEach { tab ->
            val isSelected = tab == current
            val label = when (tab) {
                GlobalSearchTab.MESSAGES -> stringResource(R.string.global_search_tab_messages)
                GlobalSearchTab.CONVERSATIONS -> stringResource(R.string.global_search_tab_conversations)
                GlobalSearchTab.USERS -> stringResource(R.string.global_search_tab_users)
            }
            val icon = when (tab) {
                GlobalSearchTab.MESSAGES -> Icons.AutoMirrored.Filled.Message
                GlobalSearchTab.CONVERSATIONS -> Icons.Filled.Group
                GlobalSearchTab.USERS -> Icons.Filled.Person
            }
            val count = countFor(tab)
            val description = GlobalSearchRows.tabLabel(label, count, stringResource(R.string.global_search_tab_description))
            val tint = if (isSelected) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted
            Column(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Tab) { onSelect(tab) }
                    .semantics(mergeDescendants = true) {
                        contentDescription = description
                        selected = isSelected
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(vertical = MeeshySpacing.sm),
                ) {
                    Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(MeeshySpacing.xs))
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        color = tint,
                    )
                    if (count > 0) {
                        Spacer(Modifier.width(MeeshySpacing.xs))
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(MeeshyPalette.Indigo500)
                                .padding(horizontal = 6.dp, vertical = 1.dp),
                        ) {
                            Text(
                                text = GlobalSearchRows.badge(count),
                                style = MaterialTheme.typography.labelSmall,
                                color = MeeshyPalette.White,
                            )
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .background(if (isSelected) MeeshyPalette.Indigo500 else Color.Transparent),
                )
            }
        }
    }
}

/** Section « Recherches recentes » (parite iOS) : tap = relance, action nommee ou croix = oubli. */
@Composable
internal fun RecentSearchesSection(
    recents: List<String>,
    onSelect: (String) -> Unit,
    onRemove: (String) -> Unit,
    onClear: () -> Unit,
) {
    val removeAction = stringResource(R.string.global_search_recent_remove_action)
    val relaunchHint = stringResource(R.string.global_search_recent_relaunch_hint)
    val itemTemplate = stringResource(R.string.global_search_recent_item)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = MeeshySpacing.lg,
            end = MeeshySpacing.lg,
            top = MeeshySpacing.sm,
            bottom = 120.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        item(key = "recent_header", contentType = "header") {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Filled.History,
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(MeeshySpacing.sm))
                Text(
                    text = stringResource(R.string.global_search_recent_title),
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { heading() },
                )
                Text(
                    text = stringResource(R.string.global_search_recent_clear),
                    style = MaterialTheme.typography.labelLarge,
                    color = MeeshyPalette.Error,
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .heightIn(min = 48.dp)
                        .clickable(role = Role.Button, onClick = onClear)
                        .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.md),
                )
            }
        }
        items(recents, key = { it }, contentType = { "recent" }) { query ->
            ResultCard(
                onClick = { onSelect(query) },
                description = itemTemplate.format(query),
                hint = relaunchHint,
                modifier = Modifier.semantics {
                    customActions = listOf(CustomAccessibilityAction(removeAction) { onRemove(query); true })
                },
            ) {
                Icon(
                    imageVector = Icons.Filled.History,
                    contentDescription = null,
                    tint = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(MeeshySpacing.md))
                Text(
                    text = query,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { onRemove(query) }, modifier = Modifier.size(48.dp)) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = removeAction,
                        tint = MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
    }
}
