package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.PostReferenceDisplay
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.MeeshySpacing

/** Les modes qu'une mention prend sur une story : épinglée (pastille), « Avec … », ou silencieuse (iOS `declarable(forCanvas:)`). */
private val MENTION_MODES = listOf(PostReferenceDisplay.PINNED, PostReferenceDisplay.NOTE, PostReferenceDisplay.SILENT)

private fun PostReferenceDisplay.modeLabelRes(): Int = when (this) {
    PostReferenceDisplay.NOTE -> R.string.story_mention_mode_note
    PostReferenceDisplay.SILENT -> R.string.story_mention_mode_silent
    else -> R.string.story_mention_mode_pinned
}

/** Les feuilles du « ⋯ » qui nomment la publication (#13846), sombres comme la scène. */
@Composable
internal fun StoryReferenceSheet(open: StoryComposerSheet, state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDone: () -> Unit) {
    MeeshyTheme(darkTheme = true) {
        when (open) {
            StoryComposerSheet.MENTION -> ComposerAnchoredSheet(fill = false) {
                StoryMentionSheet(referenced = state.referenced, onCancel = onDone) { kept, people, mode ->
                    viewModel.onReferencesEdited(kept, people, mode)
                    onDone()
                }
            }
            StoryComposerSheet.HASHTAGS -> ComposerAnchoredSheet(fill = false) { StoryHashtagSheet(state, viewModel, onDone) }
            StoryComposerSheet.PLACE -> ComposerAnchoredSheet(fill = false) {
                StoryPlaceSheet(onCancel = onDone) { place ->
                    viewModel.onPosePlace(place)
                    onDone()
                }
            }
            else -> Unit
        }
    }
}

/**
 * Qui mentionner, et comment (iOS `StoryMentionPickerSheet`) : les personnes déjà nommées se retrouvent en tête, chacune avec
 * son mode, qu'on change d'un toucher ou qu'on retire ; Annuler ne touche à rien, OK reste grisé tant que rien n'a changé.
 */
@Composable
private fun StoryMentionSheet(
    referenced: List<PostMentionInput>,
    onCancel: () -> Unit,
    onDone: (List<PostMentionInput>, List<AudienceCandidate>, PostReferenceDisplay) -> Unit,
) {
    var mode by rememberSaveable { mutableStateOf(PostReferenceDisplay.PINNED) }
    var kept by remember { mutableStateOf(referenced) }
    StoryAudiencePickerPage(
        title = stringResource(R.string.story_mention_title),
        initialSelection = emptyList(),
        single = false,
        requiresSelection = true,
        hasEdits = kept != referenced,
        options = {
            AlreadyReferenced(kept, onChange = { kept = it })
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                MENTION_MODES.forEach { candidate ->
                    FilterChip(
                        selected = mode == candidate,
                        onClick = { mode = candidate },
                        label = { Text(stringResource(candidate.modeLabelRes())) },
                        modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton },
                    )
                }
            }
        },
        onCancel = onCancel,
        onDone = { _, people -> onDone(kept, people.filterNot { person -> kept.any { it.username.equals(person.username, ignoreCase = true) } }, mode) },
    )
}

/** « Déjà référencées » : une pastille par personne, son mode au toucher, une croix pour la retirer ; et ce que nommer ouvre. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AlreadyReferenced(kept: List<PostMentionInput>, onChange: (List<PostMentionInput>) -> Unit) {
    if (kept.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)) {
        Text(
            text = stringResource(R.string.story_mention_already),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            kept.forEach { mention ->
                ReferencedChip(
                    mention = mention,
                    onMode = { display -> onChange(kept.map { if (it == mention) it.copy(display = display.wire) else it }) },
                    onRemove = { onChange(kept - mention) },
                )
            }
        }
        Text(
            text = stringResource(R.string.story_mention_audience_warning),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ReferencedChip(mention: PostMentionInput, onMode: (PostReferenceDisplay) -> Unit, onRemove: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    val display = MENTION_MODES.firstOrNull { it.wire == mention.display } ?: PostReferenceDisplay.PINNED
    val name = "@${mention.username.orEmpty()}"
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box {
            AssistChip(
                onClick = { open = true },
                label = { Text("$name · ${stringResource(display.modeLabelRes())}", maxLines = 1) },
                modifier = Modifier.heightIn(min = 48.dp),
            )
            ReferenceModeMenu(open = open, current = display, onDismiss = { open = false }) { candidate ->
                open = false
                onMode(candidate)
            }
        }
        IconButton(onClick = onRemove, modifier = Modifier.size(48.dp)) {
            Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.story_mention_remove, name))
        }
    }
}

@Composable
private fun ReferenceModeMenu(open: Boolean, current: PostReferenceDisplay, onDismiss: () -> Unit, onPick: (PostReferenceDisplay) -> Unit) {
    DropdownMenu(expanded = open, onDismissRequest = onDismiss) {
        MENTION_MODES.forEach { candidate ->
            DropdownMenuItem(
                text = { Text(stringResource(candidate.modeLabelRes())) },
                onClick = { onPick(candidate) },
                trailingIcon = { if (candidate == current) Icon(MeeshyIcons.Check, contentDescription = null) },
                modifier = Modifier.semantics {
                    role = Role.RadioButton
                    selected = candidate == current
                },
            )
        }
    }
}

/** Une seule validation : Retour ajoute la balise saisie, OK ferme ; Annuler rend exactement ce que la feuille a trouvé. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StoryHashtagSheet(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDone: () -> Unit) {
    val before = remember { state.hashtags }
    val sheet: StoryHashtagSheetViewModel = hiltViewModel()
    val trending by sheet.trending.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { sheet.load() }
    var draft by remember { mutableStateOf("") }
    val add = {
        draft.trim().trim('#').takeIf { it.isNotEmpty() && state.hashtags.none { tag -> tag.equals(it, ignoreCase = true) } }
            ?.let(viewModel::onToggleHashtag)
        draft = ""
    }
    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = MeeshySpacing.md)) {
        ReferenceSheetHeader(
            title = stringResource(R.string.story_hashtag_title),
            onCancel = {
                viewModel.onRestoreHashtags(before)
                onDone()
            },
            onDone = {
                add()
                onDone()
            },
            canConfirm = true,
        )
        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            leadingIcon = { Icon(MeeshyIcons.Tag, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.story_hashtag_field)) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { add() }),
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            state.hashtags.forEach { tag ->
                val remove = stringResource(R.string.story_hashtag_remove, tag)
                InputChip(
                    selected = true,
                    onClick = { viewModel.onToggleHashtag(tag) },
                    label = { Text("#$tag") },
                    trailingIcon = { Icon(MeeshyIcons.Close, contentDescription = remove) },
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
        }
        TrendingHashtags(trending.filterNot { tag -> state.hashtags.any { it.equals(tag, ignoreCase = true) } }, viewModel::onToggleHashtag)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TrendingHashtags(tags: List<String>, onPick: (String) -> Unit) {
    if (tags.isEmpty()) return
    Text(
        text = stringResource(R.string.story_hashtag_trending),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
    )
    FlowRow(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        tags.forEach { tag -> AssistChip(onClick = { onPick(tag) }, label = { Text("#$tag") }, modifier = Modifier.heightIn(min = 48.dp)) }
    }
}

/** Le lieu : la recherche, les lieux autour après l'accord, rien d'office ; après un refus, la feuille dit pourquoi. */
@Composable
private fun StoryPlaceSheet(onCancel: () -> Unit, onConfirm: (SharedPlace) -> Unit) {
    val sheet: StoryPlaceSheetViewModel = hiltViewModel()
    val state by sheet.state.collectAsStateWithLifecycle()
    val permissions = rememberPermissionFlow()
    val hereName = stringResource(R.string.story_place_here)
    var query by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        sheet.open(hereName)
        sheet.onAccessResolved(permissions.ensure(PermissionNature.LOCATION, announcesRefusal = false))
    }
    Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
        ReferenceSheetHeader(
            title = stringResource(R.string.story_place_title),
            onCancel = onCancel,
            onDone = { state.selected?.takeIf { state.canConfirm }?.let(onConfirm) },
            canConfirm = state.canConfirm,
        )
        OutlinedTextField(
            value = query,
            onValueChange = {
                query = it
                sheet.onQueryChange(it)
            },
            singleLine = true,
            leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.story_place_search)) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
        )
        if (state.showsRefusal) {
            Text(
                text = stringResource(R.string.story_place_denied),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(MeeshySpacing.lg).semantics { liveRegion = LiveRegionMode.Polite },
            )
        } else if (query.isBlank() && state.proposed.isNotEmpty()) {
            Text(
                text = stringResource(R.string.story_place_around),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = MeeshySpacing.lg, top = MeeshySpacing.md),
            )
        }
        PlaceRows(state.proposed, state.selected, sheet::onChoose)
    }
    PermissionFlowHost(permissions)
}

@Composable
private fun PlaceRows(places: List<SharedPlace>, selected: SharedPlace?, onChoose: (SharedPlace) -> Unit) {
    Box(Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
        LazyColumn(Modifier.fillMaxWidth()) {
            itemsIndexed(places, key = { index, it -> "$index:${it.latitude},${it.longitude},${it.name}" }) { _, place ->
                val chosen = place == selected
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 56.dp)
                        .clickable { onChoose(place) }
                        .padding(horizontal = MeeshySpacing.lg)
                        .semantics(mergeDescendants = true) {
                            role = Role.RadioButton
                            this.selected = chosen
                        },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    Icon(if (chosen) MeeshyIcons.LocationFilled else MeeshyIcons.Location, contentDescription = null)
                    Column(Modifier.weight(1f)) {
                        Text(place.name.orEmpty(), style = MaterialTheme.typography.bodyLarge, maxLines = 1)
                        place.address?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                    }
                    if (chosen) Icon(MeeshyIcons.Check, contentDescription = null)
                }
            }
        }
    }
}

@Composable
private fun ReferenceSheetHeader(title: String, onCancel: () -> Unit, onDone: () -> Unit, canConfirm: Boolean) {
    Row(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onCancel) { Text(stringResource(R.string.stories_audience_picker_cancel)) }
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
        TextButton(onClick = onDone, enabled = canConfirm) {
            Text(stringResource(R.string.stories_audience_picker_done), fontWeight = FontWeight.SemiBold)
        }
    }
}
