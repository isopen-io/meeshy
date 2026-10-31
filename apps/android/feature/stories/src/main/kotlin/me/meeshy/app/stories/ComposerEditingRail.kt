package me.meeshy.app.stories

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.activity.compose.BackHandler
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerEditingAnnouncement
import me.meeshy.sdk.model.composer.ComposerEditingChrome
import me.meeshy.sdk.model.composer.ComposerRailContent
import me.meeshy.sdk.model.composer.ComposerRailStack
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * UN mouvement pour l'édition (#13956) : la colonne qui change de rôle, la feuille des propriétés qui monte ou descend et
 * la scène qui se réduit au-dessus d'elle partagent la même durée et la même courbe, et partent ensemble ; sous « réduire
 * les animations », tout est immédiat.
 */
internal object ComposerSceneMotion {
    const val DURATION_MS = 280

    fun <T> spec(reduceMotion: Boolean = false): FiniteAnimationSpec<T> =
        if (reduceMotion) snap() else tween(DURATION_MS, easing = FastOutSlowInEasing)
}

internal const val EDITING_RAIL_TAG = "composer-editing-rail"
internal const val EDITING_ANNOUNCER_TAG = "composer-editing-announcer"

private val OPTION_WIDTH = 68.dp
private val OPTION_DISC = 40.dp
private val OPTION_VEIL = Color.Black.copy(alpha = 0.38f)

/**
 * Ce que la sélection est pour le chrome (#13956) : un objet POSÉ sur la scène — texte, média posé, sticker, lieu, pastille
 * de son, ceux que la pile de la scène range — ou le fond de la diapo, qui n'entre jamais dans cet ordre ni dans la règle.
 */
internal val StoryComposerUiState.selectionSubject: ComposerSelectionSubject
    get() {
        val ref = selectedSceneObject ?: return ComposerSelectionSubject.NONE
        return if (ref in StorySceneStack.order(deck.selectedSlide)) ComposerSelectionSubject.OBJECT else ComposerSelectionSubject.BACKGROUND
    }

/** Le chrome visible pour cet état : la loi pure [ComposerEditingChrome], nourrie du viseur et du geste en cours. */
internal fun StoryComposerUiState.editingChrome(viewfinderArmed: Boolean, gestureOpen: Boolean): ComposerEditingChrome =
    ComposerEditingChrome.resolve(
        ComposerEditingChrome.Input(
            subject = selectionSubject,
            drawing = isDrawingActive,
            viewfinderArmed = viewfinderArmed,
            gestureOpen = gestureOpen,
        ),
    )

/**
 * La colonne de la scène, à la même place quel que soit son rôle (#13956) : les six outils au repos ([tools]), les options
 * de l'objet sélectionné en édition ([options]), le niveau « Fond » du fond média sélectionné ([background], #13973). La bascule glisse depuis le bord et se fond ; sous « réduire les
 * animations », elle est immédiate.
 */
@Composable
internal fun SceneRail(
    content: ComposerRailContent,
    tools: @Composable () -> Unit,
    options: @Composable () -> Unit,
    background: @Composable () -> Unit = {},
) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedContent(
        targetState = content,
        transitionSpec = {
            val swap = if (reduceMotion) {
                EnterTransition.None togetherWith ExitTransition.None
            } else {
                (slideInHorizontally(ComposerSceneMotion.spec()) { it / 2 } + fadeIn(ComposerSceneMotion.spec())) togetherWith
                    (slideOutHorizontally(ComposerSceneMotion.spec()) { it / 2 } + fadeOut(ComposerSceneMotion.spec()))
            }
            swap using SizeTransform(clip = false) { _, _ -> ComposerSceneMotion.spec(reduceMotion) }
        },
        contentAlignment = Alignment.TopEnd,
        label = "sceneRail",
    ) { shown ->
        when (shown) {
            ComposerRailContent.TOOLS -> tools()
            ComposerRailContent.OBJECT_OPTIONS -> options()
            ComposerRailContent.BACKGROUND_OPTIONS -> background()
            ComposerRailContent.NONE -> Unit
        }
    }
}

/**
 * Les options de l'objet sélectionné, dans la colonne des outils (#13956) : Modifier, Dupliquer, Temps, Retirer — la liste
 * de [me.meeshy.sdk.model.composer.ComposerSelectionActions], aucun Ordre (#13917). Chacune un disque et son mot, une cible
 * de toute sa largeur ; Retirer en couleur d'alerte. Trop courte, la colonne défile au lieu d'écraser ses cibles.
 */
@Composable
internal fun SceneOptionColumn(bar: SceneSelectionBar, onAction: (ComposerSelectionAction) -> Unit) {
    Column(
        modifier = Modifier.testTag(EDITING_RAIL_TAG).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        bar.actions.forEach { action -> SceneOptionItem(action) { onAction(action) } }
    }
}

@Composable
private fun SceneOptionItem(action: ComposerSelectionAction, onClick: () -> Unit) {
    SceneOptionButton(
        icon = action.glyph(),
        label = stringResource(action.labelRes()),
        tint = if (action.isDestructive) MeeshyPalette.ErrorSoft else Color.White,
        onClick = onClick,
    )
}

/** Une option de la colonne : un disque et son mot, une seule cible de toute sa largeur. */
@Composable
internal fun SceneOptionButton(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(OPTION_WIDTH)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(OPTION_DISC).background(OPTION_VEIL, CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }
        Text(
            text = label,
            color = tint,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Les niveaux de la colonne en édition (#13956) : le premier porte les options de l'objet, ou le niveau « Fond » du fond
 * média sélectionné (#13973) ; les lots suivants y ajoutent les leurs.
 */
internal enum class StoryEditingLevel { OBJECT_OPTIONS, BACKGROUND }

/** La pile des niveaux de la colonne ([ComposerRailStack]) et ses deux gestes : poser un niveau plus fin, descendre d'un niveau. */
internal class EditingLevels<L>(val stack: ComposerRailStack<L>, val onPush: (L) -> Unit, val onBack: () -> Unit)

/**
 * La pile de l'objet sélectionné, neuve à chaque sélection ([key]) ; tant qu'un niveau est posé au-dessus du premier et
 * que [backEnabled], le retour système descend d'un niveau avant tout autre retour du compositeur.
 */
@Composable
internal fun <L> rememberEditingLevels(root: L, key: Any?, backEnabled: Boolean): EditingLevels<L> {
    var stack by remember(key) { mutableStateOf(ComposerRailStack(root)) }
    BackHandler(enabled = backEnabled && stack.canGoBack) { stack = stack.popped() }
    return EditingLevels(stack, onPush = { stack = stack.pushed(it) }, onBack = { stack = stack.popped() })
}

/**
 * La colonne en édition, niveau après niveau (#13956, R6) : le niveau du haut de la pile, à la place des outils ; un niveau
 * plus fin se POSE par-dessus le précédent en montant, Retour ([back], posé en tête dès le second niveau) le fait
 * redescendre. Même mouvement que la feuille et la scène ([ComposerSceneMotion]), immédiat sous « réduire les animations ».
 */
@Composable
internal fun <L> EditingRailLevels(
    levels: EditingLevels<L>,
    back: @Composable (onBack: () -> Unit) -> Unit,
    content: @Composable (L) -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedContent(
        targetState = levels.stack,
        contentKey = { it.depth },
        transitionSpec = {
            val deeper = targetState.depth > initialState.depth
            val swap = when {
                reduceMotion -> EnterTransition.None togetherWith ExitTransition.None
                deeper -> (slideInVertically(ComposerSceneMotion.spec()) { it / 3 } + fadeIn(ComposerSceneMotion.spec())) togetherWith
                    fadeOut(ComposerSceneMotion.spec())
                else -> fadeIn(ComposerSceneMotion.spec()) togetherWith
                    (slideOutVertically(ComposerSceneMotion.spec()) { it / 3 } + fadeOut(ComposerSceneMotion.spec()))
            }
            swap.apply { targetContentZIndex = targetState.depth.toFloat() } using SizeTransform(clip = false) { _, _ -> ComposerSceneMotion.spec(reduceMotion) }
        },
        contentAlignment = Alignment.TopEnd,
        label = "editingLevels",
    ) { stack ->
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            if (stack.canGoBack) back(levels.onBack)
            content(stack.top)
        }
    }
}

/** Retour, en tête d'un niveau posé par-dessus : il descend d'un niveau. */
@Composable
internal fun SceneLevelBack(onBack: () -> Unit) {
    SceneOptionButton(MeeshyIcons.Back, stringResource(R.string.composer_editing_back), Color.White, onBack)
}

/** Ce qui se retire pendant l'édition (Fermer, l'audience, Publier) : fondu et repli, immédiat sous « réduire les animations ». */
@Composable
internal fun EditingChromeVisibility(visible: Boolean, content: @Composable () -> Unit) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedVisibility(
        visible = visible,
        enter = if (reduceMotion) {
            EnterTransition.None
        } else {
            fadeIn(ComposerSceneMotion.spec()) + expandVertically(ComposerSceneMotion.spec(), expandFrom = Alignment.Top)
        },
        exit = if (reduceMotion) {
            ExitTransition.None
        } else {
            fadeOut(ComposerSceneMotion.spec()) + shrinkVertically(ComposerSceneMotion.spec(), shrinkTowards = Alignment.Top)
        },
        label = "editingChrome",
    ) { content() }
}

/**
 * Ce que TalkBack dit quand la colonne change de rôle (#13956) : « Édition : Sticker » (« Édition : Fond » pour le fond,
 * #13973) à la sélection, « Retour aux outils
 * de la scène » à la désélection, rien à l'ouverture ([ComposerEditingChrome.announcement]). Une région vivante polie,
 * posée hors des surimpressions pour qu'une feuille ouverte ne lui fasse rien oublier.
 */
@Composable
internal fun EditingAnnouncer(editing: String?) {
    var spoken by remember { mutableStateOf<ComposerEditingAnnouncement?>(null) }
    LaunchedEffect(editing) { spoken = ComposerEditingChrome.announcement(spoken, editing != null) }
    val text = when (spoken) {
        ComposerEditingAnnouncement.EDITING -> editing?.let { stringResource(R.string.composer_editing_announce, it) }
        ComposerEditingAnnouncement.TOOLS_BACK -> stringResource(R.string.composer_editing_done)
        null -> null
    }
    Box(
        Modifier.testTag(EDITING_ANNOUNCER_TAG).size(1.dp).semantics {
            liveRegion = LiveRegionMode.Polite
            text?.let { contentDescription = it }
        },
    )
}

internal fun ComposerSelectionAction.glyph(): ImageVector = when (this) {
    ComposerSelectionAction.EDIT -> MeeshyIcons.Edit
    ComposerSelectionAction.DUPLICATE -> MeeshyIcons.Copy
    ComposerSelectionAction.TIME -> MeeshyIcons.ScheduleFilled
    ComposerSelectionAction.REMOVE -> MeeshyIcons.Delete
}

internal fun ComposerSelectionAction.labelRes(): Int = when (this) {
    ComposerSelectionAction.EDIT -> R.string.story_canvas_action_edit
    ComposerSelectionAction.DUPLICATE -> R.string.story_canvas_action_duplicate
    ComposerSelectionAction.TIME -> R.string.composer_scene_more_timing
    ComposerSelectionAction.REMOVE -> R.string.composer_selection_remove
}
