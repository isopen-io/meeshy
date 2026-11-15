package me.meeshy.ui.component.focal

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import me.meeshy.ui.component.bubble.BubbleBlurReveal
import me.meeshy.ui.component.bubble.BubbleBlurRevealSpec

/**
 * L'enveloppe de protection du bloc CONTENU de la rangée plate (iOS `FocalProtectedContent`) : citation, story,
 * médias, fichiers, texte — jamais l'identité ni la méta, que l'appelant pose hors d'elle. Sans [spec] le contenu
 * passe tel quel ; avec, rien n'en est lisible avant la révélation (voile opaque, flou dès l'API 31, retiré de
 * l'arbre d'accessibilité), et la clé [LocalFocalMessageRevealed] dit aux cases quand le message est levé.
 */
@Composable
internal fun FocalProtectedContent(
    messageId: String,
    spec: BubbleBlurRevealSpec?,
    shape: Shape,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    if (spec == null) {
        content()
        return
    }
    BubbleBlurReveal(messageId = messageId, spec = spec, shape = shape, modifier = modifier, content = content)
}
