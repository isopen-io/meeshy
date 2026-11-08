package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import me.meeshy.sdk.model.media.MediaPresentation
import me.meeshy.sdk.model.media.MediaPresentationState

/**
 * L'hote UNIQUE des presentations plein ecran du chat (iOS `ConversationPresentedMedia`) : image,
 * video, audio, document, code, lieu. Une seule est ouverte a la fois, en ouvrir une seconde
 * remplace la premiere, le retour systeme la ferme. La visionneuse d'images est portee par l'etat
 * du ViewModel : l'hote la ferme ([dismissImageViewer]) quand une autre forme la remplace.
 */
internal class ChatMediaHost(private val dismissImageViewer: () -> Unit) {
    private var state by mutableStateOf(MediaPresentationState())

    val active: MediaPresentation? get() = state.active

    fun open(presentation: MediaPresentation) {
        if (state.active is MediaPresentation.Image && presentation !is MediaPresentation.Image) {
            dismissImageViewer()
        }
        state = state.open(presentation)
    }

    fun close() {
        if (state.active is MediaPresentation.Image) dismissImageViewer()
        state = state.close()
    }

    /** La visionneuse d'images s'est fermee de son cote : l'hote n'a plus rien a fermer. */
    fun onImageViewerClosed() {
        if (state.active is MediaPresentation.Image) state = state.close()
    }
}

@Composable
internal fun rememberChatMediaHost(dismissImageViewer: () -> Unit): ChatMediaHost {
    val latest by rememberUpdatedState(dismissImageViewer)
    return remember { ChatMediaHost { latest() } }
}
