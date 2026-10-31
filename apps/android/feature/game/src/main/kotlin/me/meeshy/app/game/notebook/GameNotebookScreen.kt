package me.meeshy.app.game.notebook

import androidx.compose.foundation.background
import android.text.format.Formatter
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.launch
import me.meeshy.app.game.photo.GamePhotoFlowDialog
import me.meeshy.app.game.photo.GamePhotoSharer
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.GamePhotoMoments
import me.meeshy.sdk.model.game.photo.NotebookEntry
import me.meeshy.ui.theme.MeeshyPalette
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.progression.GamePageScaffold
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.PhotoLawEntry
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val NOTEBOOK_SKELETON_TAG = "game.notebook.skeleton"
internal const val NOTEBOOK_PLACE_TAG = "game.notebook.place"
internal const val NOTEBOOK_TAKE_TAG = "game.notebook.take"
internal const val NOTEBOOK_CATCH_UP_TAKE_TAG = "game.notebook.catch_up.take"
internal const val NOTEBOOK_SHARE_TAG = "game.notebook.share"
internal const val NOTEBOOK_REMOVE_TAG = "game.notebook.remove"
internal const val NOTEBOOK_REMOVE_ERROR_TAG = "game.notebook.remove.error"

/**
 * LA PAGE DE LA CHRONIQUE (iOS `GameNotebookPage`) — les étapes du jeu déjà franchies qui attendent leur photo, dans
 * l'ordre de leur piste : la première de chaque piste est ouverte, les suivantes, estompées et verrouillées, disent
 * laquelle prendre d'abord. Vide, Mee et Meo disent ce qui l'écrira. En bas, où vivent les photos : sur l'appareil.
 * Ni spinner (squelette à froid seulement) ni tirer-pour-rafraîchir : la page se lit dans le cache, hors ligne comme
 * en ligne.
 */
@Composable
fun GameNotebookScreen(onBack: () -> Unit, viewModel: GameNotebookViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var taking by remember { mutableStateOf<GamePhotoMoment?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val shareTitle = stringResource(R.string.game_photo_share)
    GamePageScaffold(
        title = stringResource(R.string.game_notebook_page_title),
        onBack = onBack,
        isRefreshing = false,
        onRefresh = null,
    ) {
        GameNotebookContent(
            state = state,
            onTake = { taking = it },
            onShare = { entry ->
                scope.launch {
                    viewModel.notebook.storyBytes(entry)?.let { GamePhotoSharer.share(context, it, entry.momentId, shareTitle) }
                }
            },
            onRemove = viewModel::remove,
        )
    }
    taking?.let { moment ->
        GamePhotoFlowDialog(moment, viewModel.notebook) {
            taking = null
            viewModel.reload()
        }
    }
}

@Composable
internal fun GameNotebookContent(
    state: GameNotebookUiState,
    onTake: (GamePhotoMoment) -> Unit = {},
    onShare: (NotebookEntry) -> Unit = {},
    onRemove: (NotebookEntry) -> Unit = {},
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl)) {
        when {
            state.phase == GameNotebookPhase.Loading -> NotebookSkeleton()
            state.isEmpty -> NotebookEmpty()
            else -> {
                if (state.pending.isNotEmpty()) PendingSection(state.pending, onTake)
                if (state.catchUp.isNotEmpty()) CatchUpSection(state, onTake)
                if (state.kept.isNotEmpty()) KeptSection(state, onShare, onRemove)
            }
        }
        if (state.phase == GameNotebookPhase.Ready) PlaceCaption(state.shelf.occupiedBytes)
    }
}

/** La place qu'occupe la Chronique, et où vivent ses photos : elles ne quittent pas l'appareil. */
@Composable
private fun PlaceCaption(occupiedBytes: Long) {
    val context = LocalContext.current
    val deviceOnly = stringResource(R.string.game_notebook_device_only)
    val text = if (occupiedBytes > 0) {
        "${stringResource(R.string.game_notebook_size, Formatter.formatShortFileSize(context, occupiedBytes))} $deviceOnly"
    } else {
        deviceOnly
    }
    Text(
        text,
        Modifier.fillMaxWidth().testTag(NOTEBOOK_PLACE_TAG),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textMuted,
    )
}

@Composable
private fun NotebookSkeleton() {
    Column(Modifier.testTag(NOTEBOOK_SKELETON_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        repeat(SKELETON_ROWS) {
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(72.dp), RoundedCornerShape(MeeshyRadius.md))
        }
    }
}

@Composable
private fun NotebookEmpty() {
    Column(
        Modifier.fillMaxWidth().padding(MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        MeeFigure(filmId = EMPTY_FILM, side = 96.dp, animates = false, modifier = Modifier.clearAndSetSemantics {})
        Text(
            stringResource(R.string.game_notebook_empty),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textMuted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        title,
        Modifier.semantics { heading() },
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textPrimary,
    )
}

/** Les moments laissés « plus tard » : ils attendent sans échéance. */
@Composable
private fun PendingSection(pending: List<NotebookEntry>, onTake: (GamePhotoMoment) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.game_notebook_pending))
        pending.forEach { entry ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(MeeshyRadius.md)).background(MeeshyTheme.tokens.backgroundSecondary)
                    .padding(MeeshySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                EntryTitles(entry, Modifier.weight(1f))
                PillButton(stringResource(R.string.game_photo_offer_start), NOTEBOOK_TAKE_TAG) { onTake(entry.moment) }
            }
        }
    }
}

@Composable
private fun CatchUpSection(state: GameNotebookUiState, onTake: (GamePhotoMoment) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.game_notebook_catch_up))
        state.catchUp.forEachIndexed { index, entry ->
            val blocker = entry.blockedBy?.let { id -> state.step(id)?.let { photoMomentTitle(it.step.emblem) } ?: id }
            CatchUpRow(entry, blocker, onTake, Modifier.staggeredAppear(minOf(index, MAX_STAGGER_RANK)))
        }
    }
}

/** Les photos gardées : la vignette décodée à la taille de la liste, Partager, Retirer. */
@Composable
private fun KeptSection(state: GameNotebookUiState, onShare: (NotebookEntry) -> Unit, onRemove: (NotebookEntry) -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.game_notebook_kept))
        state.kept.forEach { entry ->
            val photoLabel = stringResource(R.string.game_notebook_photo_a11y, photoMomentTitle(entry.moment.emblem))
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(MeeshyRadius.md)).background(tokens.backgroundSecondary)
                    .padding(MeeshySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                val thumbnail = state.shelf.thumbnails[entry.momentId]
                Box(
                    Modifier.size(72.dp, 128.dp).clip(RoundedCornerShape(MeeshyRadius.sm))
                        .background(tokens.textMuted.copy(alpha = 0.15f))
                        .semantics { contentDescription = photoLabel },
                ) {
                    thumbnail?.let {
                        Image(remember(it) { it.asImageBitmap() }, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                    EntryTitles(entry)
                    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                        PillButton(stringResource(R.string.game_photo_share), NOTEBOOK_SHARE_TAG) { onShare(entry) }
                        PillButton(stringResource(R.string.game_notebook_remove), NOTEBOOK_REMOVE_TAG) { onRemove(entry) }
                    }
                }
            }
        }
        if (state.shelf.removalFailed) {
            Text(
                stringResource(R.string.game_notebook_remove_failed),
                Modifier.testTag(NOTEBOOK_REMOVE_ERROR_TAG),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyPalette.Error,
            )
        }
    }
}

@Composable
private fun EntryTitles(entry: NotebookEntry, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val locale = LocalConfiguration.current.locales[0]
    val date = remember(entry.createdAt, locale) { DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(Date(entry.createdAt)) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            photoMomentKicker(entry.moment.emblem).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textMuted,
        )
        Text(photoMomentTitle(entry.moment.emblem), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
        Text(date, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
    }
}

@Composable
private fun PillButton(title: String, tag: String, onClick: () -> Unit) {
    Text(
        title,
        Modifier
            .clip(CircleShape)
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f))
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 44.dp)
            .wrapContentHeight()
            .padding(horizontal = MeeshySpacing.md)
            .testTag(tag),
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyPalette.Indigo500,
    )
}

@Composable
private fun CatchUpRow(entry: PhotoLawEntry, blocker: String?, onTake: (GamePhotoMoment) -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val title = photoMomentTitle(entry.step.emblem)
    val lockedLine = blocker?.let { stringResource(R.string.game_notebook_catch_up_locked, it) }
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tokens.backgroundSecondary)
            .alpha(if (entry.isOpen) 1f else LOCKED_ALPHA)
            .padding(MeeshySpacing.md)
            .heightIn(min = 44.dp)
            .semantics(mergeDescendants = !entry.isOpen) {
                if (!entry.isOpen) contentDescription = lockedLine?.let { "$title. $it" } ?: title
            },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                photoMomentKicker(entry.step.emblem).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textMuted,
            )
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
            if (lockedLine != null) {
                Text(lockedLine, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
            }
        }
        if (entry.isOpen) {
            PillButton(stringResource(R.string.game_photo_offer_start), NOTEBOOK_CATCH_UP_TAKE_TAG) { onTake(GamePhotoMoments.of(entry.step)) }
        } else {
            Icon(MeeshyIcons.Lock, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(20.dp))
        }
    }
}

private const val EMPTY_FILM = "meo-selfie"
private const val SKELETON_ROWS = 3
private const val LOCKED_ALPHA = 0.55f
private const val MAX_STAGGER_RANK = 8
