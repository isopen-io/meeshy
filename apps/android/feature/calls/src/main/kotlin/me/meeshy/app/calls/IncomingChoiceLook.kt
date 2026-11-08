package me.meeshy.app.calls

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.sdk.model.call.IncomingCallAction

/** L'aspect d'un bouton de l'écran entrant : son glyphe, son disque, la teinte du glyphe et celle de sa légende. */
internal data class IncomingChoiceLook(val icon: ImageVector, val fill: Color, val glyph: Color, val caption: Color)

/**
 * Les trois boutons de la vue P17 (`docs/product/appels-vue-finale/planche.html`) : Refuser (disque rouge), Sans vidéo
 * (un combiné blanc sur un verre neutre, légende blanche), Répondre (disque vert, caméra ou combiné selon l'appel).
 * Les légendes de Refuser et Répondre gardent leur teinte déjà livrée ; la planche les dessine blanches (écart consigné).
 */
internal object IncomingChoiceLooks {
    fun of(action: IncomingCallAction, isVideoCall: Boolean): IncomingChoiceLook = when (action) {
        IncomingCallAction.Decline -> IncomingChoiceLook(
            icon = Icons.Filled.CallEnd,
            fill = CallPalette.Decline,
            glyph = CallPalette.Ink,
            caption = CallPalette.Decline,
        )
        IncomingCallAction.AnswerWithoutVideo -> IncomingChoiceLook(
            icon = Icons.Filled.Call,
            fill = CallGlassTone.OverPicture.neutralFill,
            glyph = CallPalette.Ink,
            caption = CallPalette.Ink,
        )
        IncomingCallAction.Accept -> IncomingChoiceLook(
            icon = if (isVideoCall) Icons.Filled.Videocam else Icons.Filled.Call,
            fill = CallPalette.Accept,
            glyph = CallPalette.Ink,
            caption = CallPalette.Accept,
        )
    }
}
