package me.meeshy.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.kit.LocalMeeshyModeFixedPress
import me.meeshy.ui.component.kit.MeeshyGlassButton
import me.meeshy.ui.component.kit.MeeshyGlassButtonKind
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.component.kit.MeeshyModeAction
import me.meeshy.ui.component.kit.MeeshyModeCapsule
import me.meeshy.ui.component.kit.MeeshyModeCapsuleDisplay
import me.meeshy.ui.component.kit.MeeshyModeChrome
import me.meeshy.ui.component.kit.MeeshyModeChromeRecipe
import me.meeshy.ui.component.kit.MeeshyModeHeader
import me.meeshy.ui.component.kit.MeeshyModePlate
import me.meeshy.ui.component.kit.MeeshyModePlateMetrics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val STATE_TEXT = "texte"
private const val STATE_PLATE = "plaque"
private const val STATE_CHECK = "coche"
private const val STATE_THREE = "trois"
private const val STATE_ACCESSORY = "accessoire"
private const val STATE_LONG_PLATE = "plaque-longue"
private const val STATE_NO_PLATE = "sans-plaque"
private const val STATE_BUSY = "occupe"
private const val STATE_DISABLED = "desactive"
private const val STATE_LIGHT = "clair"
private const val STATE_WIDE = "large"

/** Les noms de l'échantillon : des identifiants de développement, pas des textes publiés (fiche K00 §1). */
private object ModeSampleNames {
    const val DRAWING = "Dessin"
    const val CAMERA = "Caméra"
    const val RETOUCH = "Retouche"
    const val TIMELINE = "Plan temps"
    const val EXIT = "Quitter"
    const val EXIT_HINT = "Revient à l'état d'avant"
    const val CONFIRM = "Valider"
    const val DONE = "Terminé"
    const val PHOTOS = "Photos"
    const val DROP_TAKE = "Retirer la dernière prise"
    const val PLATE = "Réglages du dessin"
    const val DUPLICATE = "Dupliquer"
    const val DELETE = "Supprimer"
    const val SETTING = "Réglage"
    val TOOLS = listOf("Pinceau", "Marqueur", "Gomme", "Flou")
}

/** La fenêtre de démonstration, et la hauteur d'écran de la planche sur laquelle le plafond de la plaque se calcule. */
private val WindowWidth: Dp = 390.dp
private val WindowHeight: Dp = 520.dp
private val BoardWindowHeight: Dp = 844.dp
private val WidePlateWidth: Dp = 320.dp
private const val LONG_PLATE_ROWS = 14

/** Les onze états de K16, ceux d'iOS : les vues de la planche d'abord, puis les états que le code porte sans vue. */
internal val entryK16: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K16",
    name = "MeeshyModeChrome",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_TEXT, boardView = "A13", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_PLATE, boardView = "A13", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_CHECK, boardView = "A8", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_THREE, boardView = "C1", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_ACCESSORY, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_LONG_PLATE, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_NO_PLATE, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_BUSY, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_DISABLED, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_LIGHT, backdrop = MeeshyKitCatalogBackdrop.Light),
        MeeshyKitCatalogState(id = STATE_WIDE, boardView = "I3", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
    ),
)

/**
 * L'échantillon d'un état : le cadre posé en SURIMPRESSION d'un bloc d'hôte, comme la scène de la planche. La tuile
 * « pressée » fige l'appui des capsules (un doigt ne se tient pas hors écran). Le bas de la plaque ne lit pas la barre de
 * navigation de l'appareil et son plafond se calcule sur l'écran de la planche : l'image est celle de la planche.
 */
@Composable
internal fun ContentK16(state: MeeshyKitCatalogState, isPressed: Boolean) {
    CompositionLocalProvider(LocalMeeshyModeFixedPress provides if (isPressed) true else null) {
        Box(Modifier.size(width = WindowWidth, height = WindowHeight)) {
            HostBlock()
            Frame(state.id)
        }
    }
}

@Composable
private fun HostBlock() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(MeeshySpacing.lg)
            .background(MeeshyMediaChromeColors.ChromeFill, RoundedCornerShape(MeeshyRadius.xxl)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = MeeshyIcons.Photo,
            contentDescription = null,
            modifier = Modifier.size(MeeshyIconSize.hero),
            tint = MeeshyMediaChromeColors.OnMediaMuted,
        )
    }
}

@Composable
private fun Frame(stateId: String) {
    val exit = remember { MeeshyModeAction(title = ModeSampleNames.EXIT, onClick = {}, hint = ModeSampleNames.EXIT_HINT) }
    when (stateId) {
        STATE_TEXT -> Chrome(ModeSampleNames.DRAWING, exit, confirmTitle(ModeSampleNames.CONFIRM), plate = { Tools() })
        STATE_PLATE -> Chrome(
            ModeSampleNames.DRAWING, exit, confirmTitle(ModeSampleNames.CONFIRM),
            plate = {
                Tools()
                Actions()
            },
        )
        STATE_CHECK -> Chrome(ModeSampleNames.CAMERA, exit, confirmCheck())
        STATE_THREE -> Chrome(ModeSampleNames.RETOUCH, exit, confirmTitle(ModeSampleNames.DONE), center = { PhotosCapsule() })
        STATE_ACCESSORY -> Chrome(ModeSampleNames.CAMERA, exit, confirmCheck(), accessory = { DropTake() })
        STATE_LONG_PLATE -> Chrome(
            ModeSampleNames.DRAWING, exit, confirmTitle(ModeSampleNames.CONFIRM),
            plate = { repeat(LONG_PLATE_ROWS) { index -> SettingRow("${ModeSampleNames.SETTING} ${index + 1}") } },
        )
        STATE_NO_PLATE -> Chrome(ModeSampleNames.TIMELINE, exit, confirmTitle(ModeSampleNames.CONFIRM))
        STATE_BUSY -> Chrome(ModeSampleNames.RETOUCH, exit, confirmTitle(ModeSampleNames.DONE, busy = true))
        STATE_DISABLED -> Chrome(ModeSampleNames.TIMELINE, exit, confirmTitle(ModeSampleNames.CONFIRM, enabled = false))
        STATE_LIGHT -> Chrome(ModeSampleNames.DRAWING, exit, confirmTitle(ModeSampleNames.CONFIRM), tone = MeeshyGlassTone.OnLight, plate = { Tools() })
        else -> Wide(exit)
    }
}

@Composable
private fun Chrome(
    label: String,
    exit: MeeshyModeAction,
    confirm: MeeshyModeAction,
    tone: MeeshyGlassTone? = null,
    center: (@Composable () -> Unit)? = null,
    accessory: (@Composable () -> Unit)? = null,
    plate: (@Composable ColumnScope.() -> Unit)? = null,
) {
    MeeshyModeChrome(
        label = label,
        exit = exit,
        confirm = confirm,
        tone = tone,
        plateLabel = if (plate != null) ModeSampleNames.PLATE else null,
        plateWindowHeight = BoardWindowHeight,
        safeBottom = 0.dp,
        center = center,
        accessory = accessory,
        plate = plate,
    )
}

/** Le grand écran (I3) : l'hôte pose l'en-tête et la plaque séparément, ton `plain`, retrait de 24, plaque bornée. */
@Composable
private fun Wide(exit: MeeshyModeAction) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        MeeshyModeHeader(
            label = ModeSampleNames.DRAWING,
            exit = exit,
            confirm = confirmTitle(ModeSampleNames.CONFIRM),
            tone = MeeshyGlassTone.Plain,
            headerInset = MeeshyModeChromeRecipe.wideHeaderInset.dp,
        )
        Spacer(Modifier.weight(1f))
        MeeshyModePlate(
            label = ModeSampleNames.PLATE,
            modifier = Modifier.padding(bottom = MeeshyModePlateMetrics.bottomMargin(0f).dp),
            maxWidth = WidePlateWidth,
            tone = MeeshyGlassTone.Plain,
            windowHeight = BoardWindowHeight,
        ) { Tools() }
    }
}

private fun confirmTitle(title: String, busy: Boolean = false, enabled: Boolean = true): MeeshyModeAction =
    MeeshyModeAction(title = title, onClick = {}, enabled = enabled, busy = busy)

@Composable
private fun confirmCheck(): MeeshyModeAction = remember {
    MeeshyModeAction(title = ModeSampleNames.CONFIRM, onClick = {}, icon = MeeshyIcons.Check, display = MeeshyModeCapsuleDisplay.Glyph)
}

@Composable
private fun PhotosCapsule() {
    MeeshyModeCapsule(
        title = ModeSampleNames.PHOTOS,
        onClick = {},
        icon = MeeshyIcons.Download,
        display = MeeshyModeCapsuleDisplay.GlyphAndTitle,
    )
}

@Composable
private fun DropTake() {
    MeeshyGlassButton(icon = MeeshyIcons.Backspace, label = ModeSampleNames.DROP_TAKE, onClick = {})
}

@Composable
private fun Tools() {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        ModeSampleNames.TOOLS.forEach { name -> MeeshyGlassButton(icon = MeeshyIcons.Scribble, label = name, onClick = {}) }
    }
}

@Composable
private fun Actions() {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        MeeshyGlassButton(icon = MeeshyIcons.Copy, label = ModeSampleNames.DUPLICATE, onClick = {})
        MeeshyGlassButton(icon = MeeshyIcons.Delete, label = ModeSampleNames.DELETE, onClick = {}, kind = MeeshyGlassButtonKind.Destructive)
    }
}

@Composable
private fun SettingRow(title: String) {
    Text(
        text = title,
        modifier = Modifier.fillMaxWidth().heightIn(min = MeeshyControlSize.tapTarget),
        color = MeeshyMediaChromeColors.OnMedia,
        fontSize = MeeshyFontSize.body,
    )
}
