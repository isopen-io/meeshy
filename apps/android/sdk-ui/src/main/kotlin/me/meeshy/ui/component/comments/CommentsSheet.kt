package me.meeshy.ui.component.comments

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.layout.onSizeChanged
import me.meeshy.sdk.model.comments.CommentSheetFit
import androidx.compose.foundation.layout.RowScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA feuille des commentaires, la même pour le fil, les réels et le détail (iOS `FeedCommentsSheet`) : un
 * `ModalBottomSheet` translucide à poignée, le titre « N commentaires » et la fermeture, le corps qui défile, et le
 * composeur collant en bas. Le contenu vient des slots : la feuille ne connaît ni le moteur ni le Prisme. L'écran qui
 * l'ouvre reste monté dessous (la vidéo d'un réel continue), la feuille ne navigue pas.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun CommentsSheet(
    title: String,
    closeLabel: String,
    onDismiss: () -> Unit,
    composer: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    headerAction: (@Composable RowScope.() -> Unit)? = null,
    body: @Composable () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MeeshyTheme.tokens.backgroundPrimary.copy(alpha = SHEET_SCRIM_ALPHA),
        dragHandle = { BottomSheetDefaults.DragHandle() },
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
        modifier = modifier,
    ) {
        // La sonde d'iOS (`keepsComposerBelowSheetHeader`) : le haut du composeur, dans la zone sous l'en-tête. Dès qu'il
        // la dépasse, la feuille prend sa grande détente — et ne se réduit jamais d'elle-même.
        var detent by remember { mutableStateOf(CommentSheetFit.Detent.MEDIUM) }
        var columnHeight by remember { mutableIntStateOf(0) }
        var headerHeight by remember { mutableIntStateOf(0) }
        var composerHeight by remember { mutableIntStateOf(0) }
        val composerTop = columnHeight - headerHeight - composerHeight
        LaunchedEffect(composerTop, columnHeight, composerHeight) {
            if (columnHeight > 0 && composerHeight > 0) detent = CommentSheetFit.detent(composerTop.toFloat(), detent)
        }
        val fraction by animateFloatAsState(
            targetValue = if (detent == CommentSheetFit.Detent.LARGE) 1f else SHEET_HEIGHT_FRACTION,
            animationSpec = spring(dampingRatio = 0.86f, stiffness = 385f),
            label = "comments-sheet-detent",
        )
        Column(Modifier.fillMaxWidth().fillMaxHeight(fraction).onSizeChanged { columnHeight = it.height }) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg).onSizeChanged { headerHeight = it.height },
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                headerAction?.invoke(this)
                IconButton(onClick = onDismiss) {
                    Icon(MeeshyIcons.Close, contentDescription = closeLabel, tint = MeeshyTheme.tokens.textSecondary)
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            ) { body() }
            // Mesuré SANS borne : une barre plus haute que la place offerte doit se lire débordante, pas écrêtée à la place restante.
            CommentComposerBar(modifier = Modifier.wrapContentHeight(unbounded = true).onSizeChanged { composerHeight = it.height }, composer = composer)
        }
    }
}

private const val SHEET_HEIGHT_FRACTION = 0.85f
private const val SHEET_SCRIM_ALPHA = 0.96f
