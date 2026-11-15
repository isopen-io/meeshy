package me.meeshy.ui.component.comments

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.layout.layout
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.comments.CommentComposerFoldState
import me.meeshy.sdk.model.comments.CommentComposerFoldState.Presentation
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le repli d'un espace commentaire (iOS `foldableComment`, #9122) : ⌄ par défaut ; le toucher ferme le clavier et replie
 * la barre en une icône de commentaire ; toucher l'icône la rouvre. Replié, [content] reste MONTÉ — hauteur nulle, alpha
 * nul — pour que le brouillon, les pièces et la prise vocale survivent. Une réponse en cours rouvre la barre ; le ⌄
 * s'efface pendant la saisie ([isComposing]). Ressort 0,32 / 0,82 et haptique légère, comme iOS.
 */
@Composable
public fun FoldableCommentBar(
    isReplying: Boolean,
    isComposing: Boolean,
    foldLabel: String,
    unfoldLabel: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var userFolded by rememberSaveable { mutableStateOf(false) }
    val presentation = CommentComposerFoldState.presentation(userFolded, isReplying)
    val folded = presentation == Presentation.FOLDED
    LaunchedEffect(isComposing) {
        if (CommentComposerFoldState.reopens(userFolded, isComposing)) userFolded = false
    }
    val focus = LocalFocusManager.current
    val haptics = rememberMeeshyHaptics()
    val stiffness = SPRING_STIFFNESS
    Column(
        modifier = modifier
            .fillMaxWidth()
            .animateContentSize(spring(dampingRatio = CommentComposerFoldState.SPRING_DAMPING, stiffness = stiffness)),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (folded) {
            IconButton(
                onClick = {
                    haptics.light()
                    userFolded = false
                },
                modifier = Modifier.size(TAP_TARGET),
            ) {
                Icon(MeeshyIcons.ChatBubbleOutline, contentDescription = unfoldLabel, tint = MeeshyTheme.tokens.textPrimary)
            }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .layout { measurable, constraints ->
                    val placeable = measurable.measure(constraints)
                    layout(placeable.width, if (folded) 0 else placeable.height) { placeable.place(0, 0) }
                }
                .alpha(if (folded) 0f else 1f)
                .then(if (folded) Modifier.clearAndSetSemantics { }.focusProperties { canFocus = false } else Modifier),
        ) {
            if (CommentComposerFoldState.offersFoldButton(presentation, isComposing)) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                    IconButton(
                        onClick = {
                            focus.clearFocus()
                            haptics.light()
                            userFolded = true
                        },
                        modifier = Modifier.size(FOLD_TARGET),
                    ) {
                        Icon(MeeshyIcons.ChevronDown, contentDescription = foldLabel, tint = MeeshyTheme.tokens.textSecondary)
                    }
                }
            }
            content()
        }
    }
}

/** `response` 0,32 s ⇒ raideur (2π / response)² du ressort amorti de Compose. */
private const val SPRING_STIFFNESS = 385f
private val TAP_TARGET = 48.dp
private val FOLD_TARGET = 32.dp
