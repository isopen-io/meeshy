package me.meeshy.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import me.meeshy.ui.component.kit.MeeshyGlass
import me.meeshy.ui.component.kit.MeeshyGlassButton
import me.meeshy.ui.component.kit.MeeshyGlassButtonFace
import me.meeshy.ui.component.kit.MeeshyGlassButtonKind
import me.meeshy.ui.component.kit.MeeshyGlassButtonSize
import me.meeshy.ui.component.kit.MeeshyGlassGroup
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val STATE_NORMAL = "normal"
private const val STATE_ALONE = "seul"
private const val STATE_ALONE_LIGHT = "seul-clair"
private const val STATE_ACTIVE = "actif"
private const val STATE_DESTRUCTIVE = "destructif"
private const val STATE_SOFT = "doux"
private const val STATE_TEXT = "texte"
private const val STATE_BADGE = "pastille"
private const val STATE_TINTED = "teinte"
private const val STATE_THEME = "theme"
private const val STATE_DISABLED = "desactive"
private const val STATE_SIZES = "tailles"

/** Les noms des boutons de l'échantillon : des identifiants de développement, pas des textes publiés (fiche K00 §1). */
private object SampleNames {
    const val CLOSE = "Fermer"
    const val UNDO = "Annuler"
    const val REDO = "Rétablir"
    const val ACTIONS = "Afficher les actions"
    const val COLLAPSE = "Ranger les actions"
    const val REMOVE = "Retirer"
    const val BACK = "Retour"
    const val TEXT_STYLE = "Style du texte"
    const val COLOR = "Couleur"
    const val NOTIFICATIONS = "Notifications"
    const val NOTIFICATIONS_VALUE = "3"
    const val PASTE = "Coller"
    const val PEN = "Stylo"
    const val MARKER = "Marqueur"
    const val ADD = "Ajouter"
    const val TEXT_GLYPH = "Aa"
}

/** Les états de K02, ceux d'iOS : un par tenue, puis le glyphe de texte, la pastille, la teinte, le thème, le désactivé et les tailles. */
internal val entryK02: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K02",
    name = "MeeshyGlassButton",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_NORMAL, boardView = "R2", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_ALONE, boardView = "R1", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_ALONE_LIGHT, boardView = "R13", backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_ACTIVE, boardView = "R3", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DESTRUCTIVE, boardView = "S9", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_SOFT, boardView = "S1", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_TEXT, boardView = "A2", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_BADGE, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_TINTED, backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DISABLED, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_SIZES, backdrop = MeeshyKitCatalogBackdrop.Media),
    ),
)

/**
 * L'échantillon d'un état : le vrai bouton au repos, son disque figé sous le doigt pour la tuile « pressé » (un bouton ne
 * se tient pas pressé hors écran).
 */
@Composable
internal fun ContentK02(state: MeeshyKitCatalogState, isPressed: Boolean) {
    when (state.id) {
        STATE_NORMAL -> Container(isPressed)
        STATE_ALONE -> Cell(MeeshyIcons.Close, SampleNames.CLOSE, isPressed, tone = MeeshyGlassTone.Plain)
        STATE_ALONE_LIGHT -> Cell(MeeshyIcons.Close, SampleNames.CLOSE, isPressed, tone = MeeshyGlassTone.OnLight)
        STATE_ACTIVE -> Cell(MeeshyIcons.MoreHorizontal, SampleNames.COLLAPSE, isPressed, kind = MeeshyGlassButtonKind.Active)
        STATE_DESTRUCTIVE -> Cell(
            MeeshyIcons.Delete, SampleNames.REMOVE, isPressed, kind = MeeshyGlassButtonKind.Destructive, size = MeeshyGlassButtonSize.S40,
        )
        STATE_SOFT -> Cell(
            MeeshyIcons.ChevronBackward, SampleNames.BACK, isPressed, kind = MeeshyGlassButtonKind.Soft, size = MeeshyGlassButtonSize.S40,
        )
        STATE_TEXT -> OwnGlyphs(isPressed)
        STATE_BADGE -> Badged(isPressed)
        STATE_TINTED -> Cell(MeeshyIcons.Copy, SampleNames.PASTE, isPressed, tint = MeeshyPalette.Indigo500)
        STATE_THEME -> Themed(isPressed)
        STATE_DISABLED -> Cell(MeeshyIcons.Scribble, SampleNames.MARKER, isPressed, pressable = false, enabled = false)
        STATE_SIZES -> Sizes(isPressed)
    }
}

/**
 * La pilule hôte de l'état `normal` (R2), le temps que K10 la livre : le verre dessiné de K01, où les boutons se posent
 * sans matière (jamais de verre sur du verre).
 */
@Composable
private fun Container(isPressed: Boolean) {
    MeeshyGlassGroup {
        MeeshyGlass(shape = RoundedCornerShape(MeeshyRadius.pill), tone = MeeshyGlassTone.Deep) {
            Row(
                modifier = Modifier.padding(MeeshySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Cell(MeeshyIcons.Undo, SampleNames.UNDO, isPressed, size = MeeshyGlassButtonSize.S40, pressable = false)
                Cell(MeeshyIcons.Redo, SampleNames.REDO, isPressed, size = MeeshyGlassButtonSize.S40)
                Cell(MeeshyIcons.MoreHorizontal, SampleNames.ACTIONS, isPressed, size = MeeshyGlassButtonSize.S48, pressable = false)
            }
        }
    }
}

@Composable
private fun Sizes(isPressed: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
        MeeshyGlassButtonSize.entries.forEach { size -> Cell(MeeshyIcons.Add, SampleNames.ADD, isPressed, size = size) }
    }
}

@Composable
private fun OwnGlyphs(isPressed: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
        GlyphCell(SampleNames.TEXT_STYLE, isPressed) { glyphSize ->
            Text(
                text = SampleNames.TEXT_GLYPH,
                fontSize = with(LocalDensity.current) { glyphSize.toSp() },
                fontWeight = FontWeight.SemiBold,
            )
        }
        GlyphCell(SampleNames.COLOR, isPressed) {
            Box(Modifier.size(MeeshySpacing.lg).background(MeeshyPalette.Indigo500, CircleShape))
        }
    }
}

@Composable
private fun Themed(isPressed: Boolean) {
    Row(
        modifier = Modifier.background(MeeshyTheme.tokens.backgroundPrimary).padding(MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cell(MeeshyIcons.Edit, SampleNames.PEN, isPressed, tone = MeeshyGlassTone.Theme)
        Cell(MeeshyIcons.Edit, SampleNames.PEN, isPressed, kind = MeeshyGlassButtonKind.Active, tone = MeeshyGlassTone.Theme)
    }
}

@Composable
private fun Badged(isPressed: Boolean) {
    val badge: @Composable BoxScope.() -> Unit = {
        Box(Modifier.size(MeeshySpacing.sm).background(MeeshyPalette.Error, CircleShape))
    }
    if (isPressed) {
        MeeshyGlassButtonFace(MeeshyIcons.Bell, pressed = true, badge = badge)
    } else {
        MeeshyGlassButton(
            icon = MeeshyIcons.Bell,
            label = SampleNames.NOTIFICATIONS,
            value = SampleNames.NOTIFICATIONS_VALUE,
            onClick = {},
            badge = badge,
        )
    }
}

@Composable
private fun Cell(
    icon: ImageVector,
    label: String,
    isPressed: Boolean,
    kind: MeeshyGlassButtonKind? = null,
    size: MeeshyGlassButtonSize = MeeshyGlassButtonSize.S44,
    tone: MeeshyGlassTone? = null,
    tint: Color? = null,
    pressable: Boolean = true,
    enabled: Boolean = true,
) {
    if (isPressed && pressable) {
        MeeshyGlassButtonFace(icon, kind = kind ?: MeeshyGlassButtonKind.Normal, size = size, tone = tone, tint = tint, pressed = true)
    } else {
        MeeshyGlassButton(icon = icon, label = label, onClick = {}, kind = kind, size = size, tone = tone, tint = tint, enabled = enabled)
    }
}

@Composable
private fun GlyphCell(label: String, isPressed: Boolean, glyph: @Composable (Dp) -> Unit) {
    if (isPressed) {
        MeeshyGlassButtonFace(pressed = true, glyph = glyph)
    } else {
        MeeshyGlassButton(label = label, onClick = {}, glyph = glyph)
    }
}
