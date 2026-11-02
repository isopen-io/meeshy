package me.meeshy.ui.sticker

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.sticker.StickerSheetChoice

/**
 * Ce que la feuille remet aux pages qu'un hôte lui injecte (packs, Personnalisés) : [pick] pose un choix exactement comme
 * une case d'emoji — il alimente les récents, remet le choix à la destination et ferme la feuille —, et l'appui long
 * épingle. Une page montée HORS de la feuille n'a pas de picker : ses cases sont alors inertes.
 */
@Stable
public class StickerSheetPicker internal constructor(
    public val pick: (StickerSheetChoice) -> Unit,
    internal val actions: StickerCellActions,
)

public val LocalStickerSheetPicker: androidx.compose.runtime.ProvidableCompositionLocal<StickerSheetPicker?> =
    staticCompositionLocalOf { null }

/**
 * Une case qui pose [choice] : un tap la pose (haptique moyen), un appui long propose d'épingler ce que la mémoire retient.
 * [enabled] faux : la case montre ce qu'elle fera mais ne pose rien (un cadre à mots sans mots) — TalkBack la dit désactivée.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun StickerChoiceCell(
    choice: StickerSheetChoice,
    label: String,
    side: Dp,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable () -> Unit,
) {
    val picker = LocalStickerSheetPicker.current
    val entry = choice.usageEntry
    var menuOpen by remember { mutableStateOf(false) }
    Box(
        modifier = modifier
            .size(side)
            .clip(RoundedCornerShape(12.dp))
            .alpha(if (enabled) 1f else DISABLED_ALPHA)
            .combinedClickable(
                enabled = picker != null,
                onClick = {
                    if (enabled && picker != null) {
                        picker.actions.haptics.medium()
                        picker.pick(choice)
                    }
                },
                onLongClick = if (entry != null && picker != null) ({ picker.actions.haptics.light(); menuOpen = true }) else null,
            )
            .semantics {
                contentDescription = label
                if (!enabled) disabled()
            },
        contentAlignment = Alignment.Center,
    ) {
        content()
        if (entry != null && picker != null) StickerFavoriteMenu(menuOpen, { menuOpen = false }, entry, picker.actions)
    }
}

/** Une case qui montre ce qu'elle fera sans pouvoir le faire encore s'efface à moitié, comme iOS (0,55). */
private const val DISABLED_ALPHA = 0.55f
