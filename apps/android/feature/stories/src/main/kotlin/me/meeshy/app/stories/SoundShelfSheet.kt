package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.SoundRemovalNotice
import me.meeshy.sdk.model.composer.sound.SoundShelfEmpty
import me.meeshy.sdk.model.composer.sound.SoundShelfLaw
import me.meeshy.sdk.model.composer.sound.SoundShelfTab
import me.meeshy.ui.component.audio.SoundPreviewController
import me.meeshy.ui.component.audio.rememberSoundPreviewController
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * L'étagère des sons du composeur — miroir de `SoundLibraryPicker` (iOS) : « Mes sons » / « Tendances », recherche,
 * aperçu un à la fois, renommer, retirer (retrait LOGIQUE : les publications qui le jouent déjà continuent), puis
 * « Utiliser » pose le son en fond de la slide. Une feuille : « Annuler » en haut, glissé vers le bas pour fermer ;
 * l'aperçu est coupé en la quittant.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SoundShelfSheet(
    onUse: (ApiSound) -> Unit,
    onDismiss: () -> Unit,
    viewModel: SoundShelfViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val preview = rememberSoundPreviewController()
    LaunchedEffect(Unit) { viewModel.loadIfNeeded() }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = { preview.stop(); onDismiss() }, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 420.dp)
                .navigationBarsPadding(),
        ) {
            ShelfHeader(onCancel = { preview.stop(); onDismiss() })
            ShelfTabs(state.tab) { preview.stop(); viewModel.onTabChange(it) }
            ShelfSearch(state.query, viewModel::onQueryChange)
            AnimatedVisibility(visible = state.removalFailed, enter = fadeIn(), exit = fadeOut()) {
                Text(
                    stringResource(R.string.story_sound_library_removeFailed),
                    color = MeeshyPalette.Error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
            ShelfContent(
                state = state,
                preview = preview,
                playableUrl = viewModel::playableUrl,
                onUse = { sound ->
                    preview.stop()
                    onUse(sound)
                },
                onRename = viewModel::beginRename,
                onRemove = viewModel::beginRemove,
                onLoadMore = viewModel::loadMore,
            )
        }
    }
    state.renaming?.let { sound ->
        RenameDialog(sound = sound, onConfirm = viewModel::commitRename, onCancel = viewModel::cancelRename)
    }
    state.removing?.let { sound ->
        RemoveDialog(
            sound = sound,
            onConfirm = {
                preview.onRemoved(sound.id)
                viewModel.confirmRemove()
            },
            onCancel = viewModel::cancelRemove,
        )
    }
}

@Composable
private fun ShelfHeader(onCancel: () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
        TextButton(onClick = onCancel, modifier = Modifier.align(Alignment.CenterStart)) {
            Text(stringResource(R.string.story_composer_cancel))
        }
        Text(
            stringResource(R.string.story_sound_library_title),
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ShelfTabs(selected: SoundShelfTab, onSelect: (SoundShelfTab) -> Unit) {
    val tabs = listOf(
        SoundShelfTab.MINE to R.string.story_sound_library_mine,
        SoundShelfTab.TRENDING to R.string.story_sound_library_trending,
    )
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        tabs.forEachIndexed { index, (tab, label) ->
            SegmentedButton(
                selected = tab == selected,
                onClick = { onSelect(tab) },
                shape = SegmentedButtonDefaults.itemShape(index, tabs.size),
            ) { Text(stringResource(label)) }
        }
    }
}

@Composable
private fun ShelfSearch(query: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = query,
        onValueChange = onChange,
        singleLine = true,
        placeholder = { Text(stringResource(R.string.story_sound_library_search)) },
        leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onChange("") }) {
                    Icon(MeeshyIcons.CloseCircleFilled, contentDescription = stringResource(R.string.story_sound_library_clearSearch))
                }
            }
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(onSearch = {}),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShelfContent(
    state: SoundShelfState,
    preview: SoundPreviewController,
    playableUrl: (ApiSound) -> String?,
    onUse: (ApiSound) -> Unit,
    onRename: (ApiSound) -> Unit,
    onRemove: (ApiSound) -> Unit,
    onLoadMore: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    when {
        state.isLoading && state.sounds.isEmpty() -> Box(Modifier.fillMaxSize().heightIn(min = 240.dp), Alignment.Center) {
            CircularProgressIndicator()
        }
        state.sounds.isEmpty() -> EmptyShelf(state.empty)
        else -> LazyColumn(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            items(state.sounds, key = { it.id }) { sound ->
                val row: @Composable () -> Unit = {
                    SoundShelfRow(
                        sound = sound,
                        isMine = state.canRename,
                        isPlaying = preview.state.isPlaying(sound.id),
                        isPreparing = preview.state.isPreparing(sound.id),
                        onTogglePreview = { haptics.light(); playableUrl(sound)?.let { preview.toggle(sound, it) } },
                        onRename = if (state.canRename) ({ onRename(sound) }) else null,
                        onRemove = if (state.canRemove) ({ onRemove(sound) }) else null,
                        onUse = { haptics.light(); onUse(sound) },
                    )
                }
                if (state.canRemove) {
                    SwipeToRemove(onRemove = { onRemove(sound) }, content = row)
                } else {
                    row()
                }
            }
            if (state.canLoadMore) {
                item(key = "more") {
                    LaunchedEffect(state.nextCursor) { onLoadMore() }
                    Box(Modifier.fillMaxWidth().padding(16.dp), Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp)) }
                }
            }
        }
    }
}

/**
 * Balayer une ligne ne la retire PAS : le geste ouvre la confirmation et la ligne revient (le retrait n'est
 * jamais un effet de bord d'un glissé — sans `role: destructive` côté iOS non plus, pour la même raison).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeToRemove(onRemove: () -> Unit, content: @Composable () -> Unit) {
    val dismiss = rememberSwipeToDismissBoxState(
        confirmValueChange = { target ->
            if (target == SwipeToDismissBoxValue.EndToStart) onRemove()
            false
        },
    )
    SwipeToDismissBox(
        state = dismiss,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Box(Modifier.fillMaxSize().padding(horizontal = 24.dp), contentAlignment = Alignment.CenterEnd) {
                Icon(MeeshyIcons.Delete, contentDescription = null, tint = MeeshyPalette.Error)
            }
        },
        content = { Box(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainerLow)) { content() } },
    )
}

@Composable
private fun EmptyShelf(kind: SoundShelfEmpty) {
    val message = when (kind) {
        SoundShelfEmpty.NoMatch -> R.string.story_sound_library_emptySearch
        SoundShelfEmpty.NoneMine -> R.string.story_sound_library_emptyMine
        SoundShelfEmpty.NoneTrending -> R.string.story_sound_library_emptyTrending
    }
    Column(
        modifier = Modifier.fillMaxWidth().heightIn(min = 240.dp).padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(MeeshyIcons.Waveform, contentDescription = null, modifier = Modifier.size(36.dp), tint = MaterialTheme.colorScheme.outline)
        Text(
            stringResource(message),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

/** Le titre est PUBLIC et porte le crédit : le dire évite le surnom privé qu'on ne voulait pas publier. */
@Composable
private fun RenameDialog(sound: ApiSound, onConfirm: (String) -> Unit, onCancel: () -> Unit) {
    var draft by remember(sound.id) { mutableStateOf(sound.title) }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.story_sound_library_renameTitle)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.story_sound_library_renameHint), style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    singleLine = true,
                    placeholder = { Text(stringResource(R.string.story_sound_library_renamePlaceholder)) },
                )
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(draft) }) { Text(stringResource(R.string.story_sound_library_renameConfirm)) } },
        dismissButton = { TextButton(onClick = onCancel) { Text(stringResource(R.string.story_composer_cancel)) } },
    )
}

/** Le message dit, AVANT le geste, combien de publications jouent encore ce son : elles continueront. */
@Composable
private fun RemoveDialog(sound: ApiSound, onConfirm: () -> Unit, onCancel: () -> Unit) {
    val message = when (val notice = SoundShelfLaw.removalNotice(sound)) {
        SoundRemovalNotice.Unused -> stringResource(R.string.story_sound_library_removeMessageUnused)
        is SoundRemovalNotice.StillPlayed ->
            pluralStringResource(R.plurals.story_sound_library_removeMessageUsed, notice.postCount, notice.postCount)
    }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.story_sound_library_removeTitle)) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.story_sound_library_removeConfirm), color = MeeshyPalette.Error)
            }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text(stringResource(R.string.story_composer_cancel)) } },
    )
}
