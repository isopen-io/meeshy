package me.meeshy.app.contacts

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.ui.component.people.ScrollOffsetReporter
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private class KeypadKey(val digit: String, val letters: String)

private val KEYPAD_ROWS: List<List<KeypadKey>> = listOf(
    listOf(KeypadKey("1", ""), KeypadKey("2", "ABC"), KeypadKey("3", "DEF")),
    listOf(KeypadKey("4", "GHI"), KeypadKey("5", "JKL"), KeypadKey("6", "MNO")),
    listOf(KeypadKey("7", "PQRS"), KeypadKey("8", "TUV"), KeypadKey("9", "WXYZ")),
    listOf(KeypadKey("+", ""), KeypadKey("0", ""), KeypadKey("#", "")),
)

/**
 * L'onglet Clavier du hub Personnes : un pavé 4x3 qui retrouve une personne Meeshy par numéro ou par nom
 * (iOS `KeypadTab`). Le clavier système ne s'ouvre jamais : le champ n'est qu'un affichage.
 */
@Composable
fun KeypadTab(
    onOpenProfile: (userId: String) -> Unit,
    onCall: (conversationId: String, name: String, video: Boolean) -> Unit,
    modifier: Modifier = Modifier,
    isActive: Boolean = true,
    onCollapseProgressChange: (Float) -> Unit = {},
    viewModel: KeypadViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    KeypadTabContent(
        state = state,
        onEvent = viewModel::onEvent,
        onOpenProfile = onOpenProfile,
        onCall = onCall,
        isActive = isActive,
        onCollapseProgressChange = onCollapseProgressChange,
        modifier = modifier,
    )
}

@Composable
internal fun KeypadTabContent(
    state: KeypadUiState,
    onEvent: (KeypadUiEvent) -> Unit,
    onOpenProfile: (userId: String) -> Unit,
    onCall: (conversationId: String, name: String, video: Boolean) -> Unit,
    modifier: Modifier = Modifier,
    isActive: Boolean = true,
    onCollapseProgressChange: (Float) -> Unit = {},
) {
    Column(modifier = modifier.fillMaxSize()) {
        InputBar(input = state.input, onEvent = onEvent)
        Results(
            state = state,
            isActive = isActive,
            onCollapseProgressChange = onCollapseProgressChange,
            onOpenProfile = onOpenProfile,
            onCall = onCall,
            modifier = Modifier.weight(1f),
        )
        Keypad(onEvent = onEvent)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun InputBar(input: String, onEvent: (KeypadUiEvent) -> Unit) {
    val tokens = MeeshyTheme.tokens
    val haptics = rememberMeeshyHaptics()
    val fieldLabel = stringResource(R.string.keypad_input_a11y)
    val deleteLabel = stringResource(R.string.keypad_delete_a11y)
    val clearLabel = stringResource(R.string.keypad_clear_a11y)
    Box(modifier = Modifier.fillMaxWidth().height(64.dp)) {
        Row(
            modifier = Modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xxl),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            val fieldText = input.ifEmpty { stringResource(R.string.keypad_input_placeholder) }
            Text(
                text = fieldText,
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = if (input.isEmpty()) fieldLabel else "$fieldLabel, $input" },
                color = if (input.isEmpty()) tokens.textMuted else tokens.textPrimary,
                fontSize = 26.sp,
                fontWeight = FontWeight.Medium,
                fontFamily = FontFamily.SansSerif,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
            if (input.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .size(MeeshyControlSize.minTouchTarget)
                        .combinedClickable(
                            role = Role.Button,
                            onClickLabel = deleteLabel,
                            onClick = {
                                onEvent(KeypadUiEvent.DeleteLast)
                                haptics.light()
                            },
                            onLongClickLabel = clearLabel,
                            onLongClick = {
                                onEvent(KeypadUiEvent.Clear)
                                haptics.medium()
                            },
                        )
                        .semantics { contentDescription = deleteLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Backspace,
                        contentDescription = null,
                        tint = tokens.textMuted,
                    )
                }
            }
        }
        HorizontalDivider(
            modifier = Modifier.align(Alignment.BottomCenter),
            color = tokens.textMuted.copy(alpha = MeeshyOpacity.light),
        )
    }
}

@Composable
private fun Results(
    state: KeypadUiState,
    isActive: Boolean,
    onCollapseProgressChange: (Float) -> Unit,
    onOpenProfile: (String) -> Unit,
    onCall: (String, String, Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    ScrollOffsetReporter(state = listState, active = isActive, onProgress = onCollapseProgressChange)
    LazyColumn(state = listState, modifier = modifier.fillMaxWidth()) {
        if (state.rows.isEmpty()) {
            item(key = "hint", contentType = "hint") { Hint(state.load) }
        } else {
            items(state.rows, key = { it.user.id }, contentType = { "result" }) { row ->
                KeypadResultRow(
                    row = row,
                    onOpenProfile = { onOpenProfile(row.user.id) },
                    onCall = onCall,
                )
            }
        }
    }
}

@Composable
private fun Hint(load: KeypadLoad) {
    val tokens = MeeshyTheme.tokens
    if (load == KeypadLoad.Loading) {
        Box(modifier = Modifier.fillMaxWidth().padding(top = 28.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = MeeshyPalette.Indigo500)
        }
        return
    }
    val noMatch = load == KeypadLoad.Loaded
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.xxl, start = 40.dp, end = 40.dp)
            .semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Text(
            text = stringResource(if (noMatch) R.string.keypad_no_match_title else R.string.keypad_prompt_title),
            color = tokens.textPrimary,
            fontSize = MeeshyFontSize.headline,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(if (noMatch) R.string.keypad_no_match_subtitle else R.string.keypad_prompt_subtitle),
            color = tokens.textMuted,
            fontSize = MeeshyFontSize.label,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun Keypad(onEvent: (KeypadUiEvent) -> Unit) {
    val tokens = MeeshyTheme.tokens
    val haptics = rememberMeeshyHaptics()
    Column {
        HorizontalDivider(color = tokens.textMuted.copy(alpha = MeeshyOpacity.light))
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        ) {
            KEYPAD_ROWS.forEach { keys ->
                Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                    keys.forEach { key ->
                        KeyButton(key = key, onPress = {
                            onEvent(KeypadUiEvent.Append(key.digit))
                            haptics.light()
                        })
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun KeyButton(key: KeypadKey, onPress: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier
            .width(72.dp)
            .height(56.dp)
            .combinedClickable(role = Role.Button, onClick = onPress)
            .clearAndSetSemantics { contentDescription = key.digit },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = key.digit,
            color = tokens.textPrimary,
            fontSize = 30.sp,
            fontFamily = FontFamily.SansSerif,
        )
        Text(
            text = key.letters,
            color = tokens.textMuted,
            fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.sp,
            modifier = Modifier.height(10.dp),
        )
    }
}
