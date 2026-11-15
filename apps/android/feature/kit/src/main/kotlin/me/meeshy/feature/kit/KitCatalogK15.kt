package me.meeshy.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.kit.MeeshyAnchoredSheet
import me.meeshy.ui.component.kit.MeeshyAnchoredSheetHeight
import me.meeshy.ui.component.kit.MeeshyAnchoredSheetState
import me.meeshy.ui.component.kit.MeeshyAnchoredSheetSurface
import me.meeshy.ui.component.kit.MeeshyGlassButton
import me.meeshy.ui.component.kit.MeeshyGlassButtonSize
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.component.kit.rememberMeeshyAnchoredSheetState
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val STATE_SHORT = "courte"
private const val STATE_HALF = "mi-hauteur"
private const val STATE_TALL = "haute"
private const val STATE_VALIDATE = "valider"
private const val STATE_UNTITLED = "sans-titre"
private const val STATE_NO_HANDLE = "sans-poignee"
private const val STATE_DETENTS = "crans"
private const val STATE_THEME = "theme"
private const val STATE_SCRIM = "voile"
private const val STATE_WIDE = "large"

private val WINDOW_WIDTH = 320.dp
private val WINDOW_HEIGHT = 560.dp
private val NARROW_WIDTH = 240.dp

/** Les noms de l'échantillon : des identifiants de développement, pas des textes publiés (fiche K00 §1). */
private object SheetSampleNames {
    const val MORE = "Plus"
    const val STICKERS = "Stickers"
    const val PLACE = "Lieu"
    const val SOUND = "pop-2024.m4a"
    const val OPTIONS = "Options"
    const val OK = "OK"
    const val REOPEN = "Rouvrir"
    val ROWS = listOf("Sondage", "Position", "Lien", "Minuteur")
}

/** Les états de K15, ceux d'iOS : la feuille courte, à mi-hauteur, haute, à validation, sans titre, sans poignée, à crans, du thème, voilée, bornée en largeur. */
internal val entryK15: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K15",
    name = "MeeshyAnchoredSheet",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_SHORT, boardView = "R11", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_HALF, boardView = "A11", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_TALL, boardView = "A16", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_VALIDATE, boardView = "A15", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_UNTITLED, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_NO_HANDLE, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_DETENTS, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light),
        MeeshyKitCatalogState(id = STATE_SCRIM, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_WIDE, backdrop = MeeshyKitCatalogBackdrop.Media),
    ),
)

/**
 * L'échantillon d'un état : la feuille sous un bloc d'hôte que sa place publiée réduit, comme la scène de la planche. La
 * fenêtre de démonstration est fixe : sa taille fixe l'état (les fractions de la planche tiennent sur 844, la loi est la
 * même). Fermée par son ✕, la feuille laisse un bouton pour la rouvrir. Le ✕ ne se fige pas « pressé » : K02 n'offre pas
 * de crochet à une feuille ; la tuile pressée de `valider` fige, elle, la validation.
 */
@Composable
internal fun ContentK15(state: MeeshyKitCatalogState, isPressed: Boolean) {
    var isOpen by remember(state.id) { mutableStateOf(true) }
    val sheetState = rememberMeeshyAnchoredSheetState()
    val density = LocalDensity.current
    val footprint = with(density) { sheetState.footprintPx.toDp() }
    Box(Modifier.size(WINDOW_WIDTH, WINDOW_HEIGHT)) {
        HostBlock(footprint)
        if (isOpen) {
            Sheet(state.id, isPressed, sheetState, onClose = { isOpen = false })
        } else {
            Box(Modifier.fillMaxSize().padding(bottom = MeeshySpacing.xxl), contentAlignment = Alignment.BottomCenter) {
                MeeshyGlassButton(
                    icon = MeeshyIcons.ChevronUp,
                    label = SheetSampleNames.REOPEN,
                    onClick = { isOpen = true },
                    size = MeeshyGlassButtonSize.S48,
                )
            }
        }
    }
}

@Composable
private fun HostBlock(footprint: Dp) {
    val room = (WINDOW_HEIGHT - footprint - MeeshySpacing.lg).coerceAtLeast(0.dp)
    Box(
        Modifier
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, top = MeeshySpacing.lg)
            .fillMaxWidth()
            .height(if (footprint == 0.dp) WINDOW_HEIGHT else room)
            .clip(RoundedCornerShape(MeeshyRadius.xxl))
            .background(MeeshyMediaChromeColors.MediaFill),
        contentAlignment = Alignment.Center,
    ) {
        Icon(MeeshyIcons.Photo, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaMuted, modifier = Modifier.size(MeeshyIconSize.hero))
    }
}

@Composable
private fun Sheet(
    stateId: String,
    isPressed: Boolean,
    sheetState: MeeshyAnchoredSheetState,
    onClose: () -> Unit,
) {
    val dark = MeeshyAnchoredSheetSurface.Dark
    when (stateId) {
        STATE_SHORT -> MeeshyAnchoredSheet(onClose, title = SheetSampleNames.MORE, surface = dark, state = sheetState) { Rows() }
        STATE_HALF -> MeeshyAnchoredSheet(onClose, title = SheetSampleNames.STICKERS, height = MeeshyAnchoredSheetHeight.Regular, surface = dark, state = sheetState) { Grid() }
        STATE_TALL -> MeeshyAnchoredSheet(onClose, title = SheetSampleNames.PLACE, height = MeeshyAnchoredSheetHeight.Tall, surface = dark, state = sheetState) { Places() }
        STATE_VALIDATE -> MeeshyAnchoredSheet(
            onClose,
            title = SheetSampleNames.SOUND,
            height = MeeshyAnchoredSheetHeight.Regular,
            surface = dark,
            state = sheetState,
            trailing = { OkPill(isPressed) },
        ) { Grid() }
        STATE_UNTITLED -> MeeshyAnchoredSheet(onClose, accessibilityLabel = SheetSampleNames.OPTIONS, surface = dark, state = sheetState) { Rows() }
        STATE_NO_HANDLE -> MeeshyAnchoredSheet(onClose, title = SheetSampleNames.MORE, showsHandle = false, surface = dark, state = sheetState) { Rows() }
        STATE_DETENTS -> MeeshyAnchoredSheet(
            onClose,
            title = SheetSampleNames.STICKERS,
            height = MeeshyAnchoredSheetHeight.Detents(listOf(0.3f, 0.62f), initial = 0),
            surface = dark,
            state = sheetState,
        ) { Grid() }
        STATE_THEME -> MeeshyAnchoredSheet(onClose, title = SheetSampleNames.MORE, surface = MeeshyAnchoredSheetSurface.Theme, state = sheetState) { Rows() }
        STATE_SCRIM -> MeeshyAnchoredSheet(onClose, title = SheetSampleNames.MORE, surface = dark, scrim = true, state = sheetState) { Rows() }
        else -> MeeshyAnchoredSheet(onClose, title = SheetSampleNames.MORE, surface = dark, maxWidth = NARROW_WIDTH, state = sheetState) { Rows() }
    }
}

/** La validation de la fin d'en-tête (A15) : un « OK » plein, de l'encre sur média. */
@Composable
private fun OkPill(isPressed: Boolean) {
    Box(
        Modifier
            .widthIn(min = MeeshyControlSize.tapTarget)
            .height(MeeshyControlSize.large)
            .alpha(if (isPressed) MeeshyOpacity.strong else 1f)
            .clip(CircleShape)
            .background(MeeshyMediaChromeColors.OnMedia)
            .padding(horizontal = MeeshySpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Text(SheetSampleNames.OK, color = MeeshyPalette.Indigo950, fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Rows() {
    Column(Modifier.fillMaxWidth()) {
        SheetSampleNames.ROWS.forEach { title ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = MeeshyControlSize.minTouchTarget).padding(horizontal = MeeshySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Icon(MeeshyIcons.GridView, contentDescription = null, modifier = Modifier.size(MeeshyIconSize.xl))
                Text(title, fontSize = MeeshyFontSize.body)
            }
        }
    }
}

@Composable
private fun Grid() {
    LazyVerticalGrid(
        columns = GridCells.Fixed(GRID_COLUMNS),
        modifier = Modifier.fillMaxSize().padding(horizontal = MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items((0 until GRID_ITEMS).toList()) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(GRID_CELL)
                    .clip(RoundedCornerShape(MeeshyRadius.lg))
                    .background(MeeshyMediaChromeColors.MediaFill.copy(alpha = MeeshyOpacity.light)),
            )
        }
    }
}

@Composable
private fun Places() {
    LazyColumn(Modifier.fillMaxSize()) {
        items(SheetSampleNames.ROWS + SheetSampleNames.ROWS.map { "$it 2" }) { title ->
            Text(
                title,
                fontSize = MeeshyFontSize.body,
                modifier = Modifier.fillMaxWidth().heightIn(min = MeeshyControlSize.minTouchTarget).padding(horizontal = MeeshySpacing.lg),
            )
        }
    }
}

private const val GRID_COLUMNS = 4
private const val GRID_ITEMS = 16
private val GRID_CELL = 56.dp
