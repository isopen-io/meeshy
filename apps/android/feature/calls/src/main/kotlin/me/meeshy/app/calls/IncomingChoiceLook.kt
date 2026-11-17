package me.meeshy.app.calls

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.sdk.model.call.IncomingCallAction
import me.meeshy.sdk.model.call.IncomingCallLayout
import me.meeshy.ui.icons.MeeshyIcons

/**
 * L'aspect d'un bouton de l'écran entrant : son glyphe, la teinte de son verre ([fill] nul ⇒ un verre neutre, sans
 * teinte), celle du glyphe et celle de sa légende.
 */
internal data class IncomingChoiceLook(val icon: ImageVector, val fill: Color?, val glyph: Color, val caption: Color)

/**
 * Les trois boutons de la vue P17 (`docs/product/appels-vue-finale/planche.html`), chacun un disque de VERRE (P17.13) :
 * Refuser (verre teinté rouge), Sans vidéo (un combiné blanc sur un verre neutre), Répondre (verre teinté vert, caméra ou
 * combiné selon l'appel). Sur la vue P17 ([IncomingCallLayout.whiteCaptions]) les trois légendes sont blanches (P17.10) ;
 * l'écran audio, que la planche ne redessine pas, garde les légendes teintées de Refuser et Répondre.
 * Le glyphe de Répondre annonce ce qui partira (P17.11) : [acceptsVideo] faux ⇒ un téléphone, la réponse part sans vidéo.
 */
internal object IncomingChoiceLooks {
    fun of(action: IncomingCallAction, acceptsVideo: Boolean, layout: IncomingCallLayout): IncomingChoiceLook {
        val captionInk: Color? = if (layout.whiteCaptions) CallPalette.Ink else null
        return when (action) {
            IncomingCallAction.Decline -> IncomingChoiceLook(
                icon = MeeshyIcons.CallEnd,
                fill = CallPalette.Decline,
                glyph = CallPalette.Ink,
                caption = captionInk ?: CallPalette.Decline,
            )
            IncomingCallAction.AnswerWithoutVideo -> IncomingChoiceLook(
                icon = MeeshyIcons.Call,
                fill = null,
                glyph = CallPalette.Ink,
                caption = CallPalette.Ink,
            )
            IncomingCallAction.Accept -> IncomingChoiceLook(
                icon = if (acceptsVideo) MeeshyIcons.Video else MeeshyIcons.Call,
                fill = CallPalette.Accept,
                glyph = CallPalette.Ink,
                caption = captionInk ?: CallPalette.Accept,
            )
        }
    }
}
