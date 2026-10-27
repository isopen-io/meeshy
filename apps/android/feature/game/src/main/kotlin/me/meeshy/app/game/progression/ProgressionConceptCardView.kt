package me.meeshy.app.game.progression

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.gameString
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.progression.ProgressionConceptCard
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.gameBounce
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA CARTE D'UN CONCEPT sur la première page — trois étages, et la carte entière ouvre la fiche : le NOM en petit,
 * la VALEUR en grand, UNE ligne en petit. Ni pastilles, ni jauge, ni paragraphe : la fiche dit le reste. Ce qui
 * demande un geste (Offrande prête, Flamme en danger, frappe possible…) PREND la ligne, marquée d'un point
 * d'attention. La carte entière rebondit au toucher (ressort du jeu) avec un retour haptique léger ; un seul
 * élément pour TalkBack, dont le libellé dit nom, niveau de l'emblème, valeur, ligne.
 */
@Composable
internal fun ProgressionConceptCardView(
    card: ProgressionConceptCard,
    game: GameBlock?,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val haptics = rememberMeeshyHaptics()
    val source = remember { MutableInteractionSource() }
    val name = stringResource(ConceptCopy.name(card.concept))
    val value = card.value?.let { gameString(it) }.orEmpty()
    val line = card.line?.let { gameString(it) }
    val emblemLevel = card.emblemLevel?.let { gameString(it) }
    val hint = stringResource(R.string.game_concept_card_hint)
    val description = remember(name, emblemLevel, value, line) {
        listOfNotNull(name, emblemLevel, value, line).filter { it.isNotEmpty() }.joinToString(", ")
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .gameBounce(source)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tokens.backgroundSecondary)
            .clickable(interactionSource = source, indication = null, onClickLabel = hint, role = Role.Button) {
                haptics.light()
                onOpen()
            }
            .semantics(mergeDescendants = true) { contentDescription = description }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
            .heightIn(min = MIN_TAP_TARGET),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProgressionConceptEmblem(card.concept, game)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(
                name.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textMuted,
            )
            GameValueRoll(
                value = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
            )
            if (line != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                    if (card.urgent) {
                        androidx.compose.foundation.layout.Box(
                            Modifier.size(URGENT_DOT).clip(CircleShape).background(MeeshyPalette.Warning),
                        )
                    }
                    Text(
                        line,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (card.urgent) tokens.textPrimary else tokens.textMuted,
                    )
                }
            }
        }
        Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
    }
}

/**
 * Une valeur qui CHANGE roule (un geste fait dans une fiche se relit ici au retour) ; rien ne joue au premier rendu
 * (`AnimatedContent` n'anime pas l'état initial), et rien sous « réduire les animations ».
 */
@Composable
internal fun GameValueRoll(
    value: String,
    style: androidx.compose.ui.text.TextStyle,
    fontWeight: FontWeight,
    color: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    val reduce = LocalReduceMotion.current
    AnimatedContent(
        targetState = value,
        modifier = modifier,
        transitionSpec = {
            if (reduce) {
                fadeIn(tween(0)) togetherWith fadeOut(tween(0))
            } else {
                (slideInVertically(tween(ROLL_MILLIS)) { it / 2 } + fadeIn(tween(ROLL_MILLIS))) togetherWith
                    (slideOutVertically(tween(ROLL_MILLIS)) { -it / 2 } + fadeOut(tween(ROLL_MILLIS)))
            }
        },
        label = "gameValueRoll",
    ) { shown ->
        Text(
            shown,
            style = style,
            fontWeight = fontWeight,
            fontFamily = FontFamily.Default,
            color = color,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private val MIN_TAP_TARGET = 44.dp
private val URGENT_DOT = 8.dp
private const val ROLL_MILLIS = 350
