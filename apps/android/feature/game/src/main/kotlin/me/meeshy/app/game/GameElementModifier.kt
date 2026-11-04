package me.meeshy.app.game

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.element.GameElementDetail
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.component.game.gameBounce
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * La porte des précisions (iOS `gameOpenDetail`) : posée par la PAGE ([GameElementHost]), qui présente la feuille — UNE par
 * page, quel que soit le nombre d'éléments. `null` hors d'une page de Progression : l'élément se lit alors sans se toucher.
 */
internal val LocalGameOpenDetail = staticCompositionLocalOf<((GameElementDetail) -> Unit)?> { null }

/**
 * Rend un élément TOUCHABLE (iOS `gameElement(_:)`) : il rebondit, tape légèrement, puis la page ouvre SES précisions. Le
 * lecteur d'écran l'annonce « <nom> : voir les précisions ». Sans précisions à dire ou sans page pour les présenter,
 * l'élément reste tel quel.
 */
internal fun Modifier.gameElement(detail: GameElementDetail?): Modifier = composed {
    val open = LocalGameOpenDetail.current
    val haptics = rememberMeeshyHaptics()
    val source = remember { MutableInteractionSource() }
    val label = detail?.let { stringResource(R.string.game_detail_open, gameString(it.name)) }
    if (detail == null || open == null || label == null) return@composed this
    this
        .gameBounce(source)
        .semantics { contentDescription = label }
        .clickable(interactionSource = source, indication = null, role = Role.Button) {
            haptics.light()
            open(detail)
        }
}

/**
 * Présente les précisions de l'élément touché : une feuille par page. [onOpenConcept] : « Voir la fiche », hors de la
 * fiche du concept (`null` : le lien n'est pas offert) ; [onOpenBadgesGuide] : « Comprendre les médailles », sur la fiche d'une
 * médaille. La feuille se ferme avant d'appeler le rappel.
 */
@Composable
internal fun GameElementHost(
    onOpenConcept: ((ProgressionConcept) -> Unit)?,
    onOpenBadgesGuide: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    var opened by remember { mutableStateOf<GameElementDetail?>(null) }
    CompositionLocalProvider(LocalGameOpenDetail provides { detail: GameElementDetail -> opened = detail }) { content() }
    opened?.let { detail ->
        GameElementSheet(
            detail = detail,
            onDismiss = { opened = null },
            onOpenConcept = onOpenConcept,
            onOpenBadgesGuide = onOpenBadgesGuide,
        )
    }
}
