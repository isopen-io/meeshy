package me.meeshy.ui.accessibility

import androidx.compose.foundation.focusable
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.semantics

/**
 * Referme une surimpression maison : touche Échap d'un clavier physique et action « fermer »
 * du lecteur d'écran partagent la même action.
 */
public fun Modifier.dismissOnEscape(onDismiss: () -> Unit): Modifier =
    this
        .semantics { dismiss { onDismiss(); true } }
        .focusable()
        .onPreviewKeyEvent { event ->
            val isEscape = event.key == Key.Escape && event.type == KeyEventType.KeyUp
            if (isEscape) onDismiss()
            isEscape
        }
