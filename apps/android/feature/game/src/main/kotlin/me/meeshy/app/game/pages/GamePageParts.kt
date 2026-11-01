package me.meeshy.app.game.pages

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.game.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Une carte de page : un titre en capitales discrètes, puis son contenu (iOS `GameCard`). */
@Composable
internal fun GameCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    tint: Color? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background((tint ?: tokens.textMuted).copy(alpha = if (tint != null) TINT_CARD_ALPHA else 0f))
            .background(tokens.backgroundSecondary.copy(alpha = if (tint != null) 0.6f else 1f))
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        if (title != null) {
            Text(
                title.uppercase(),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textMuted,
            )
        }
        content()
    }
}

/** Une phrase qui explique, jamais plus d'un souffle (iOS `GameNote`). */
@Composable
internal fun GameNote(text: String, modifier: Modifier = Modifier, tone: Color? = null) {
    Text(
        text,
        modifier,
        style = MaterialTheme.typography.bodyMedium,
        color = tone ?: MeeshyTheme.tokens.textMuted,
    )
}

/** Le refus d'un geste, en une phrase (iOS `GameErrorLine`) ; rien quand il n'y en a pas. */
@Composable
internal fun GameErrorLine(message: String?, modifier: Modifier = Modifier) {
    if (message.isNullOrBlank()) return
    Text(message, modifier, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MeeshyPalette.Error)
}

/** L'échec d'une lecture quand rien d'autre n'est à montrer : la phrase, et de quoi réessayer. */
@Composable
internal fun GameRetryBlock(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        GameErrorLine(message)
        TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 44.dp)) {
            Text(stringResource(R.string.game2_retry), color = MeeshyPalette.Indigo500, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** « Hors ligne : ce geste reprendra avec la connexion. » — dit sous un contrôle qui se tait hors ligne. */
@Composable
internal fun GameOfflineNote(online: Boolean) {
    if (!online) GameNote(stringResource(R.string.game2_offline_action))
}

/** Des rangées grises, sur cache VIDE seulement — jamais un spinner. */
@Composable
internal fun GameRowsSkeleton(rows: Int, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        repeat(rows) {
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(44.dp), RoundedCornerShape(MeeshyRadius.sm))
        }
    }
}

/**
 * Une barre de progression ; l'information est dite par le TEXTE voisin, la barre est un renfort. Elle se remplit une
 * fois à l'ouverture (0,6 s) et glisse quand la valeur change ; la fraction est lue À LA PEINTURE, et instantanée sous
 * « réduire les animations ».
 */
@Composable
internal fun GameProgressBar(value: Float, tint: Color, label: String, modifier: Modifier = Modifier) {
    val reduce = LocalReduceMotion.current
    val goal = value.coerceIn(0f, 1f)
    val fill = remember { Animatable(if (reduce) goal else 0f) }
    LaunchedEffect(goal, reduce) {
        if (reduce) fill.snapTo(goal) else fill.animateTo(goal, tween(BAR_MILLIS))
    }
    val track = MeeshyTheme.tokens.textMuted.copy(alpha = TRACK_ALPHA)
    Canvas(modifier.fillMaxWidth().height(8.dp).semantics { contentDescription = label }) {
        val radius = CornerRadius(size.height / 2f)
        drawRoundRect(track, size = size, cornerRadius = radius)
        val shown = fill.value
        if (shown > 0f) drawRoundRect(tint, size = Size(size.width * shown, size.height), cornerRadius = radius)
    }
}

/**
 * Le bouton plein d'un geste principal : 44 dp au moins, rebond et haptique, grisé en vol ou hors ligne. [busyTitle]
 * remplace le titre pendant le vol (un anneau tourne alors à côté) ; [detail] dit en petit, DANS le bouton, ce que le
 * geste rapporte ; [ink] est l'encre du bouton (sombre sur l'ambre, où le blanc tombe sous le seuil de lisibilité).
 */
@Composable
internal fun GameActionButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
    enabled: Boolean = true,
    tint: Color = MeeshyPalette.Indigo500,
    busyTitle: String? = null,
    detail: String? = null,
    ink: Color = Color.White,
) {
    val usable = enabled && !busy
    GameBounceButton(onClick = { if (usable) onClick() }, modifier = modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(tint.copy(alpha = if (usable || busy) 1f else DISABLED_ALPHA))
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            contentAlignment = Alignment.Center,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = ink, strokeWidth = 2.dp)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        if (busy) busyTitle ?: title else title,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = ink,
                        textAlign = TextAlign.Center,
                    )
                    if (detail != null) {
                        Text(
                            detail,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = ink.copy(alpha = DETAIL_ALPHA),
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

/** Un bouton discret (texte seul), pour les gestes secondaires : quitter, annuler, rouvrir. */
@Composable
internal fun GameQuietButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    destructive: Boolean = false,
) {
    TextButton(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 44.dp)) {
        Text(
            title,
            fontWeight = FontWeight.SemiBold,
            color = if (destructive) MeeshyPalette.Error else MeeshyPalette.Indigo500,
        )
    }
}

/** Une ligne de la liste qui se DÉPLACE quand son rang change, sous « réduire les animations » elle saute. */
@Composable
internal fun LazyItemScope.animateRow(): Modifier =
    if (LocalReduceMotion.current) {
        Modifier.animateItem(fadeInSpec = null, placementSpec = null, fadeOutSpec = null)
    } else {
        Modifier.animateItem()
    }

/** Une pastille de texte (« Toi »). */
@Composable
internal fun GameChip(text: String, modifier: Modifier = Modifier, tint: Color = MeeshyPalette.Indigo500) {
    Box(
        modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(tint.copy(alpha = CHIP_ALPHA))
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = tint)
    }
}

private const val BAR_MILLIS = 600
private const val DISABLED_ALPHA = 0.4f
private const val DETAIL_ALPHA = 0.8f
private const val TRACK_ALPHA = 0.2f
private const val CHIP_ALPHA = 0.14f
private const val TINT_CARD_ALPHA = 0.08f

/** La porte « Réglages du jeu » de la première page. */
@Composable
internal fun GameSettingsDoor(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    GameDoorRow(
        icon = me.meeshy.ui.icons.MeeshyIcons.SettingsFilled,
        title = stringResource(R.string.game2_door_settings),
        onOpen = onOpen,
        modifier = modifier,
    )
}

/**
 * Une PORTE du bas de la première page (iOS `ProgressionConceptRow` sans sous-titre) : un pictogramme, un titre, un
 * chevron, 44 dp au moins, et le rebond du jeu. Carnet, « Comment ça marche » et Réglages ont la même forme.
 */
@Composable
internal fun GameDoorRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GameBounceButton(onClick = onOpen, modifier = modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.backgroundSecondary)
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                .heightIn(min = 44.dp),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            androidx.compose.material3.Icon(icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(22.dp))
            Text(
                title,
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            androidx.compose.material3.Icon(
                me.meeshy.ui.icons.MeeshyIcons.ChevronForward,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
