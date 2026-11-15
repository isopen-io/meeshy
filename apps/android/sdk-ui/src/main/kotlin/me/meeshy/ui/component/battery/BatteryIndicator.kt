package me.meeshy.ui.component.battery

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.battery.BatteryStore
import me.meeshy.sdk.model.battery.BatteryPresentation
import me.meeshy.sdk.model.battery.BatteryState
import me.meeshy.sdk.model.battery.BatteryTone
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le magasin de batterie de la session, fourni à la racine de l'app (`MainActivity`). Absent (aperçus, tests) :
 * [rememberBattery] rend `null`, donc aucune icône — rien n'est fabriqué.
 */
val LocalBatteryStore = staticCompositionLocalOf<BatteryStore?> { null }

/**
 * L'état de batterie de [userId], lu AU PLUS BAS niveau : seule la surface qui l'appelle se recompose. `null` hors
 * épisode (icône cachée). Cache d'abord : l'état tenu s'affiche à la première image, sans attente.
 */
@Composable
fun rememberBattery(userId: String?): BatteryState? {
    val store = LocalBatteryStore.current ?: return null
    if (userId.isNullOrBlank()) return null
    val flow = remember(store, userId) { store.stateOf(userId) }
    val initial = remember(store, userId) { store.roster.value.stateOf(userId) }
    val state by flow.collectAsStateWithLifecycle(initialValue = initial)
    return state
}

/** La teinte d'une [BatteryTone], sur la palette sémantique Meeshy. */
fun BatteryTone.color(): Color = when (this) {
    BatteryTone.CRITICAL -> MeeshyPalette.Error
    BatteryTone.LOW -> MeeshyPalette.Warning
    BatteryTone.CHARGING -> MeeshyPalette.Success
    BatteryTone.OFF -> MeeshyPalette.Neutral500
}

/** Ce que l'icône peint : deux primitives, pour qu'une feuille ne se recompose que sur un vrai changement. */
@Immutable
data class BatteryGlyphModel(val fill: Float, val tone: BatteryTone) {
    companion object {
        fun of(state: BatteryState): BatteryGlyphModel = BatteryGlyphModel(BatteryPresentation.fill(state), BatteryPresentation.tone(state))
    }
}

/** La pile dessinée : un contour, un téton, un remplissage à la teinte de la phase. */
@Composable
fun BatteryGlyph(model: BatteryGlyphModel, modifier: Modifier = Modifier, width: Dp = 18.dp) {
    val tint = model.tone.color()
    Canvas(modifier = modifier.size(width = width, height = width / 2)) {
        val stroke = size.height * STROKE_RATIO
        val nub = size.width * NUB_RATIO
        val body = Size(size.width - nub - stroke, size.height - stroke)
        val origin = Offset(stroke / 2, stroke / 2)
        val radius = CornerRadius(size.height * CORNER_RATIO)
        drawRoundRect(tint, origin, body, radius, style = Stroke(width = stroke))
        drawRect(tint, Offset(size.width - nub, size.height * NUB_INSET), Size(nub, size.height * (1 - 2 * NUB_INSET)))
        val inner = stroke * 1.5f
        val innerWidth = (body.width - 2 * inner).coerceAtLeast(0f) * model.fill.coerceIn(0f, 1f)
        if (innerWidth > 0f) {
            drawRoundRect(tint, Offset(origin.x + inner, origin.y + inner), Size(innerWidth, body.height - 2 * inner), CornerRadius(radius.x / 2))
        }
    }
}

/** L'icône de l'en-tête de conversation : rien hors épisode ; un libellé lu par TalkBack sinon. */
@Composable
fun BatteryIndicator(userId: String?, name: String, modifier: Modifier = Modifier) {
    val state = rememberBattery(userId) ?: return
    val description = batteryDescription(state, name)
    BatteryGlyph(BatteryGlyphModel.of(state), modifier.semantics { contentDescription = description })
}

/** La pastille posée sur l'avatar d'une ligne de liste. */
@Composable
fun BatteryAvatarBadge(userId: String?, name: String, modifier: Modifier = Modifier) {
    val state = rememberBattery(userId) ?: return
    val description = batteryDescription(state, name)
    Box(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surface, CircleShape)
            .padding(horizontal = 2.dp, vertical = 3.dp)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        BatteryGlyph(BatteryGlyphModel.of(state), width = 12.dp)
    }
}

@Composable
fun batteryDescription(state: BatteryState, name: String): String = if (state.charging) {
    stringResource(R.string.battery_a11y_charging, name, state.level)
} else {
    stringResource(R.string.battery_a11y, name, state.level)
}

/** Le glyphe de la SyncPill, tracé ici pour rester hors du catalogue d'icônes miroir d'iOS. */
val BatteryPillVector: ImageVector by lazy {
    ImageVector.Builder(
        name = "BatteryPill",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd) {
            moveTo(3f, 7f)
            horizontalLineTo(19f)
            verticalLineTo(17f)
            horizontalLineTo(3f)
            close()
            moveTo(5f, 9f)
            horizontalLineTo(17f)
            verticalLineTo(15f)
            horizontalLineTo(5f)
            close()
        }
        path(fill = SolidColor(Color.Black)) {
            moveTo(6f, 10f)
            horizontalLineTo(10f)
            verticalLineTo(14f)
            horizontalLineTo(6f)
            close()
            moveTo(20f, 10f)
            horizontalLineTo(22f)
            verticalLineTo(14f)
            horizontalLineTo(20f)
            close()
        }
    }.build()
}

private const val STROKE_RATIO = 0.14f
private const val NUB_RATIO = 0.08f
private const val NUB_INSET = 0.3f
private const val CORNER_RATIO = 0.22f
