package me.meeshy.ui.component.comments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier
import me.meeshy.ui.theme.MeeshyTheme

/** La barre de saisie collante en bas de la feuille : un filet, puis le composeur de l'hôte (qui gère le clavier). */
@Composable
public fun CommentComposerBar(modifier: Modifier = Modifier, composer: @Composable () -> Unit) {
    Column(modifier = modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(HAIRLINE).background(MeeshyTheme.tokens.backgroundTertiary))
        composer()
    }
}

private val HAIRLINE = 1.dp
