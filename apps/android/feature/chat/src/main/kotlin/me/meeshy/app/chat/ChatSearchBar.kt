package me.meeshy.app.chat

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ChatSearchBar(
    search: ChatSearchState,
    accentColor: Color,
    onQueryChange: (String) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onClose: () -> Unit,
) {
    TopAppBar(
        navigationIcon = {
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.chat_search_close))
            }
        },
        title = {
            TextField(
                value = search.query,
                onValueChange = onQueryChange,
                singleLine = true,
                placeholder = { Text(stringResource(R.string.chat_search_hint)) },
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    cursorColor = accentColor,
                ),
            )
        },
        actions = {
            val term = search.query.isNotBlank()
            if (term) {
                Text(
                    text = if (search.hasMatches) {
                        stringResource(R.string.chat_search_count, search.currentPosition, search.matchCount)
                    } else {
                        stringResource(R.string.chat_search_no_results)
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.xs),
                )
                IconButton(onClick = onPrevious, enabled = search.hasMatches) {
                    Icon(Icons.Filled.KeyboardArrowUp, contentDescription = stringResource(R.string.chat_search_previous))
                }
                IconButton(onClick = onNext, enabled = search.hasMatches) {
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = stringResource(R.string.chat_search_next))
                }
            }
        },
    )
}
